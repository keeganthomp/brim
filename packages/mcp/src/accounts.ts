import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getAddressDecoder,
} from '@solana/kit';
import {
  decodeAgentPolicy,
  findBrimPolicyAddress,
  findTokenAccount,
  NETWORKS,
  readBrimCard,
} from '@brim/sdk';
import { Effect, Schema } from 'effect';
import { attempt, fail, io, McpFailure } from './errors.js';
import { loopback } from './config.js';
import type { McpConfig } from './types.js';

const KeyBytes = Schema.Array(
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 255 })),
).check(Schema.isBetweenLength(64, 64));
const decodeBytes = (data: readonly [string, string]) =>
  Uint8Array.from(atob(data[0]), (char) => char.charCodeAt(0));
const readAddress = (data: Uint8Array, offset: number) =>
  getAddressDecoder().decode(data.slice(offset, offset + 32));
export const usdc = (amount: bigint) =>
  `${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, '0')}`;

export function accountReader(config: McpConfig) {
  return Effect.gen(function* () {
    const card = yield* attempt(
      () => readBrimCard(config.card),
      'INVALID_CARD',
      'Card setup is invalid.',
    );
    const url = yield* attempt(
      () => new URL(config.rpcUrl),
      'INVALID_CONFIG',
      'RPC configuration is invalid.',
    );
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url))) ||
      (config.local &&
        (url.protocol !== 'http:' ||
          !loopback(url) ||
          card.network !== 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'))
    )
      return yield* fail('INVALID_CONFIG', 'RPC configuration is invalid.');
    const key = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(KeyBytes))(
      config.agentKey,
    ).pipe(
      Effect.mapError(
        () => new McpFailure({ code: 'INVALID_CONFIG', message: 'Scoped agent key is invalid.' }),
      ),
    );
    const signer = yield* io(
      () => createKeyPairSignerFromBytes(new Uint8Array(key)),
      'INVALID_CONFIG',
      'Scoped agent key is invalid.',
    );
    const rpc = createSolanaRpc(config.rpcUrl);
    const mint = NETWORKS[card.network].mint;
    const tokenAccount = yield* io(
      () => findTokenAccount(card.vaultAddress, mint),
      'INVALID_CARD',
      'Vault address is invalid.',
    );
    const policyAddress = yield* io(
      () => findBrimPolicyAddress(card.programAddress, card.vaultAddress, signer.address),
      'INVALID_CARD',
      'Agent policy address is invalid.',
    );
    const vault = Effect.gen(function* () {
      const genesis = yield* io(
        (signal) => rpc.getGenesisHash().send({ abortSignal: signal }),
        'RPC_UNAVAILABLE',
        'RPC is unavailable.',
      );
      if (genesis.slice(0, 32) !== NETWORKS[card.network].genesisHash)
        return yield* fail('INVALID_CONFIG', 'RPC network does not match this card.');
      const account = (yield* io(
        (signal) =>
          rpc
            .getAccountInfo(address(card.vaultAddress), {
              encoding: 'base64',
              commitment: 'confirmed',
            })
            .send({ abortSignal: signal }),
        'RPC_UNAVAILABLE',
        'Vault cannot be read.',
      )).value;
      if (!account || account.owner !== card.programAddress || account.executable)
        return yield* fail('INVALID_ACCOUNT', 'Vault is unavailable.');
      return yield* attempt(
        () => {
          const data = decodeBytes(account.data);
          if (
            data.length < 110 ||
            readAddress(data, 40) !== mint ||
            readAddress(data, 72) !== tokenAccount ||
            data[108] > 1
          )
            throw new Error();
          return { paused: data[108] === 1 };
        },
        'INVALID_ACCOUNT',
        'Vault data is invalid.',
      );
    });
    const balance = Effect.gen(function* () {
      const state = yield* vault;
      const result = yield* io(
        (signal) =>
          rpc
            .getTokenAccountBalance(address(tokenAccount), { commitment: 'confirmed' })
            .send({ abortSignal: signal }),
        'RPC_UNAVAILABLE',
        'USDC balance cannot be read.',
      );
      if (result.value.decimals !== 6)
        return yield* fail('INVALID_ACCOUNT', 'USDC account is invalid.');
      return { balance: usdc(BigInt(result.value.amount)), currency: 'USDC', paused: state.paused };
    });
    const policy = Effect.gen(function* () {
      const state = yield* vault;
      const account = (yield* io(
        (signal) =>
          rpc
            .getAccountInfo(address(policyAddress), { encoding: 'base64', commitment: 'confirmed' })
            .send({ abortSignal: signal }),
        'RPC_UNAVAILABLE',
        'Agent policy cannot be read.',
      )).value;
      if (!account || account.owner !== card.programAddress || account.executable)
        return yield* fail('INVALID_ACCOUNT', 'Agent policy is unavailable.');
      const value = yield* attempt(
        () => decodeAgentPolicy(decodeBytes(account.data)),
        'INVALID_ACCOUNT',
        'Agent policy is invalid.',
      );
      if (value.vault !== card.vaultAddress || value.agentKey !== signer.address)
        return yield* fail('INVALID_ACCOUNT', 'This agent key is not assigned to the card.');
      return {
        frozen: value.isFrozen,
        vaultPaused: state.paused,
        currency: 'USDC',
        maxPerPayment: usdc(value.maxPerTx),
        windowBudget: usdc(value.windowLimit),
        recordedWindowSpend: usdc(value.windowSpent),
        windowSeconds: value.windowDuration.toString(),
        windowStartedAt: value.windowStart.toString(),
        minimumSecondsBetweenPayments: value.minTxInterval.toString(),
        strictVendorAllowlist: value.allowlistEnabled,
        approvedRecipients: value.allowlist,
      };
    });
    return { balance, policy, network: card.network };
  });
}
