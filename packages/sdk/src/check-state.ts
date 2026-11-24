import { address, createSolanaRpc, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { Effect } from 'effect';
import {
  accountDiscriminator,
  decodeAgentPolicy,
  decodeData,
  findTokenAccount,
  readAddress,
  readInteger,
  sameBytes,
} from './accounts.js';
import { NETWORKS, TOKEN_PROGRAM } from './constants.js';
import { attempt, fromPromise } from './effects.js';
import { BrimPolicyViolationError, fail } from './errors.js';
import type { BrimVaultConfigDetails } from './types.js';
import type { AgentPolicySnapshot } from './policy.js';

const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const SYSVAR = 'Sysvar1111111111111111111111111111111111111';
const RPC_MESSAGE =
  'Solana RPC could not be checked. Check the configured connection and try again.';
type Account = { owner: string; executable: boolean; data: readonly [string, string] };

function bytes(account: Account | null, owner: string, minimum: number): Uint8Array {
  if (!account || account.owner !== owner || account.executable || account.data?.[1] !== 'base64')
    fail(
      'INVALID_ACCOUNT',
      'An expected vault, policy, mint, or token account is missing or invalid.',
    );
  const data = decodeData(account.data);
  if (data.length < minimum) fail('INVALID_ACCOUNT', 'An account has an unexpected format.');
  return data;
}

export interface ConnectionState {
  policyAddress: string;
  vaultTokenAccount: string;
  mint: string;
  balance: bigint;
  vaultPaused: boolean;
  policy: AgentPolicySnapshot | null;
  now: bigint;
}

export function readConnectionState(
  config: BrimVaultConfigDetails,
  agentPublicKey: string,
  rpcUrl: string,
) {
  return Effect.gen(function* () {
    const rpc = createSolanaRpc(rpcUrl);
    const genesis = yield* fromPromise(
      (signal) => rpc.getGenesisHash().send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      RPC_MESSAGE,
    );
    if (genesis.slice(0, 32) !== NETWORKS[config.network].genesisHash)
      return yield* new BrimPolicyViolationError(
        'INVALID_CONFIG',
        'The RPC network does not match the vault config.',
      );
    const mint = NETWORKS[config.network].mint;
    const encoder = getAddressEncoder();
    const [policyAddress, policyBump] = yield* fromPromise(
      () =>
        getProgramDerivedAddress({
          programAddress: address(config.programAddress),
          seeds: [
            new TextEncoder().encode('agent'),
            encoder.encode(address(config.vaultAddress)),
            encoder.encode(address(agentPublicKey)),
          ],
        }),
      'INVALID_CONFIG',
      'The public connection addresses are invalid.',
    );
    const vaultTokenAccount = yield* fromPromise(
      () => findTokenAccount(config.vaultAddress, mint),
      'INVALID_ACCOUNT',
      'The vault token address could not be derived.',
    );
    const { value: accounts } = yield* fromPromise(
      (signal) =>
        rpc
          .getMultipleAccounts(
            [
              address(config.vaultAddress),
              policyAddress,
              address(CLOCK),
              address(vaultTokenAccount),
              address(mint),
              address(config.programAddress),
            ],
            { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 0, length: 700 } },
          )
          .send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      RPC_MESSAGE,
    );
    const discriminator = yield* fromPromise(
      () => accountDiscriminator('Vault'),
      'INVALID_ACCOUNT',
      'The vault format could not be checked.',
    );
    const decoded = yield* attempt(
      () => {
        const [vaultAccount, policyAccount, clockAccount, tokenAccount, mintAccount, program] =
          accounts;
        if (program?.executable !== true)
          fail('INVALID_ACCOUNT', 'The configured Brim program is not deployed.');
        const vault = bytes(vaultAccount, config.programAddress, 110);
        const clock = bytes(clockAccount, SYSVAR, 40);
        const token = bytes(tokenAccount, TOKEN_PROGRAM, 165);
        const mintData = bytes(mintAccount, TOKEN_PROGRAM, 82);
        if (
          !sameBytes(vault.subarray(0, 8), discriminator) ||
          vault[108] > 1 ||
          readAddress(vault, 40) !== mint ||
          readAddress(vault, 72) !== vaultTokenAccount ||
          readAddress(token, 0) !== mint ||
          readAddress(token, 32) !== config.vaultAddress ||
          token[108] !== 1 ||
          mintData[44] !== 6 ||
          mintData[45] !== 1
        )
          fail('INVALID_ACCOUNT', 'The vault or its token account does not match canonical USDC.');
        const now = readInteger(clock, 32, true);
        const policyData = policyAccount ? bytes(policyAccount, config.programAddress, 135) : null;
        const policy = policyData ? decodeAgentPolicy(policyData) : null;
        if (
          now < 0n ||
          (policy &&
            (policy.vault !== config.vaultAddress ||
              policy.agentKey !== agentPublicKey ||
              policyData?.[134 + policy.allowlist.length * 32] !== policyBump ||
              policy.maxPerTx <= 0n ||
              policy.windowLimit < policy.maxPerTx ||
              policy.windowDuration <= 0n ||
              policy.minTxInterval < 0n ||
              policy.windowStart < 0n ||
              policy.lastTxTs < 0n ||
              now < policy.windowStart ||
              now < policy.lastTxTs))
        )
          fail(
            'INVALID_ACCOUNT',
            'The registered policy has inconsistent identity, limits, or timestamps.',
          );
        return {
          vault,
          owner: readAddress(vault, 8),
          now,
          policy,
          balance: readInteger(token, 64),
        };
      },
      'INVALID_ACCOUNT',
      'The connection account data could not be validated.',
    );
    const [expectedVault, bump] = yield* fromPromise(
      () =>
        getProgramDerivedAddress({
          programAddress: address(config.programAddress),
          seeds: [
            new TextEncoder().encode('vault'),
            encoder.encode(address(decoded.owner)),
            encoder.encode(address(mint)),
          ],
        }),
      'INVALID_ACCOUNT',
      'The vault address could not be verified.',
    );
    yield* attempt(
      () => {
        if (expectedVault !== config.vaultAddress || decoded.vault[109] !== bump)
          fail('INVALID_ACCOUNT', 'The vault address or stored bump is not canonical.');
      },
      'INVALID_ACCOUNT',
      'The vault identity could not be validated.',
    );
    return {
      policyAddress,
      vaultTokenAccount,
      mint,
      balance: decoded.balance,
      vaultPaused: decoded.vault[108] === 1,
      policy: decoded.policy,
      now: decoded.now,
    } satisfies ConnectionState;
  });
}
