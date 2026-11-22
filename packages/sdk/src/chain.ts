import {
  address,
  createSolanaRpc,
  getAddressEncoder,
  getProgramDerivedAddress,
  type KeyPairSigner,
} from '@solana/kit';
import { Effect } from 'effect';
import {
  accountDiscriminator,
  decodeAgentPolicy,
  decodeData,
  findBrimPolicyAddress,
  findTokenAccount,
  readAddress,
  readInteger,
  sameBytes,
} from './accounts.js';
import { NETWORKS } from './constants.js';
import { attempt, fromPromise } from './effects.js';
import { BrimPolicyViolationError, fail } from './errors.js';
import { checkPolicy } from './policy.js';
import type { ResolvedBrimConfig, ValidatedPayment } from './types.js';

const RPC_MESSAGE =
  'Solana RPC is unavailable. Check SOLANA_RPC_URL and try again before sending payment.';
export function loadPaymentState(
  config: ResolvedBrimConfig,
  signer: KeyPairSigner,
  payment: ValidatedPayment,
  rpc: ReturnType<typeof createSolanaRpc>,
) {
  return Effect.gen(function* () {
    if (payment.feePayer === signer.address)
      return yield* new BrimPolicyViolationError(
        'UNTRUSTED_FEE_PAYER',
        'Facilitator fee payer must be separate from the agent.',
      );
    const genesis = yield* fromPromise(
      (signal) => rpc.getGenesisHash().send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      RPC_MESSAGE,
    );
    if (genesis.slice(0, 32) !== NETWORKS[config.network].genesisHash)
      return yield* new BrimPolicyViolationError(
        'INVALID_CONFIG',
        'RPC is on a different network. Use the network configured by your operator.',
      );
    const policyAddress = yield* fromPromise(
      () => findBrimPolicyAddress(config.programAddress, config.vaultAddress, signer.address),
      'INVALID_CONFIG',
      'Card addresses are invalid. Ask your operator for a new card.',
    );
    const { value: accounts } = yield* fromPromise(
      (signal) =>
        rpc
          .getMultipleAccounts(
            [
              address(config.vaultAddress),
              address(policyAddress),
              address('SysvarC1ock11111111111111111111111111111111'),
            ],
            { encoding: 'base64', commitment: 'confirmed' },
          )
          .send({ abortSignal: signal }),
      'RPC_UNAVAILABLE',
      RPC_MESSAGE,
    );
    const discs = yield* fromPromise(
      () => Promise.all([accountDiscriminator('Vault'), accountDiscriminator('AgentPolicy')]),
      'INVALID_ACCOUNT',
      'Account validation failed.',
    );
    const decoded = yield* attempt(
      () => {
        const [vaultAccount, policyAccount, clockAccount] = accounts;
        if (
          !vaultAccount ||
          !policyAccount ||
          !clockAccount ||
          vaultAccount.owner !== config.programAddress ||
          policyAccount.owner !== config.programAddress ||
          vaultAccount.executable ||
          policyAccount.executable
        )
          fail(
            'INVALID_ACCOUNT',
            'Vault or policy is missing. Ask your operator to finish card setup.',
          );
        const vaultData = decodeData(vaultAccount.data);
        const policyData = decodeData(policyAccount.data);
        const clockData = decodeData(clockAccount.data);
        if (
          vaultData.length < 110 ||
          clockData.length < 40 ||
          !sameBytes(vaultData.slice(0, 8), discs[0]) ||
          !sameBytes(policyData.slice(0, 8), discs[1])
        )
          fail('INVALID_ACCOUNT', 'Card accounts have an unexpected format.');
        const policy = decodeAgentPolicy(policyData);
        if (policy.vault !== config.vaultAddress || policy.agentKey !== signer.address)
          fail(
            'INVALID_ACCOUNT',
            'This agent key is not assigned to the card. Ask your operator to issue a policy.',
          );
        return {
          vaultData,
          clockData,
          policy,
          owner: readAddress(vaultData, 8),
          mint: readAddress(vaultData, 40),
          vaultTokenAccount: readAddress(vaultData, 72),
        };
      },
      'INVALID_ACCOUNT',
      'Card account data is invalid.',
    );
    const encoder = getAddressEncoder();
    const [expectedVault, vaultBump] = yield* fromPromise(
      () =>
        getProgramDerivedAddress({
          programAddress: address(config.programAddress),
          seeds: [
            new TextEncoder().encode('vault'),
            encoder.encode(address(decoded.owner)),
            encoder.encode(address(decoded.mint)),
          ],
        }),
      'INVALID_ACCOUNT',
      'Vault address validation failed.',
    );
    const expectedAta = yield* fromPromise(
      () => findTokenAccount(config.vaultAddress, decoded.mint),
      'INVALID_ACCOUNT',
      'Vault token account validation failed.',
    );
    yield* attempt(
      () => {
        if (
          decoded.mint !== payment.asset ||
          expectedVault !== config.vaultAddress ||
          decoded.vaultData[109] !== vaultBump ||
          decoded.vaultTokenAccount !== expectedAta ||
          decoded.vaultData[108] > 1
        )
          fail('INVALID_ACCOUNT', 'Vault does not match the configured card or USDC account.');
        checkPolicy(
          decoded.policy,
          payment.amount,
          payment.recipient,
          readInteger(decoded.clockData, 32, true),
          decoded.vaultData[108] === 1,
        );
      },
      'INVALID_ACCOUNT',
      'Card policy validation failed.',
    );
    return { policyAddress, vaultTokenAccount: decoded.vaultTokenAccount };
  });
}
