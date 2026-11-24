import { address } from '@solana/kit';
import {
  createInitVaultInstruction,
  createVaultDepositInstructions,
  createVaultWithdrawInstructions,
  createSetAgentFrozenInstruction,
} from '@brim/sdk';
import { Effect } from 'effect';
import { ownerContext, readOwnerPolicy } from './owner-policy-state';
import { signOwnerInstructions, assertOwnerConnection } from './owner-signing';
import { initializedOwnerContext, ownerTokenBalance, treasuryResult } from './owner-treasury-state';
import {
  ownerFailure,
  ownerRpc,
  type OwnerWalletConnection,
  type OwnerWalletConfig,
} from './owner-wallet-types';

const invalid = () =>
  ownerFailure('INVALID_TRANSACTION', 'Review the owner action, agent key, and USDC amount.');
const builder = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.mapError(invalid));

export function initializeOwnerVault(connection: OwnerWalletConnection, config: OwnerWalletConfig) {
  return Effect.gen(function* () {
    const check = Effect.gen(function* () {
      const state = yield* ownerContext(config, connection.ownerAddress);
      yield* assertOwnerConnection(connection, state);
      if (state.initialized)
        return yield* ownerFailure(
          'VAULT_EXISTS',
          'This owner already has a vault. Refresh it to continue.',
        );
      const program = yield* ownerRpc(
        (signal) =>
          state.rpc
            .getAccountInfo(address(state.programAddress), {
              encoding: 'base64',
              commitment: 'confirmed',
            })
            .send({ abortSignal: signal }),
        'RPC_UNAVAILABLE',
        'Could not verify the Brim deployment.',
      );
      if (!program.value?.executable)
        return yield* ownerFailure(
          'PROGRAM_UNAVAILABLE',
          'Brim is not deployed at the configured program address on this network.',
        );
      return state;
    });
    const context = yield* check;
    const built = yield* builder(
      createInitVaultInstruction({
        programAddress: context.programAddress,
        ownerAddress: context.ownerAddress,
        network: context.network,
      }),
    );
    const signature = yield* signOwnerInstructions(
      connection,
      context,
      [built.instruction],
      'TREASURY',
      check.pipe(Effect.asVoid),
    );
    const saved = yield* ownerContext(config, connection.ownerAddress).pipe(
      Effect.mapError(() =>
        ownerFailure(
          'TREASURY_OUTCOME_UNKNOWN',
          'Vault creation was submitted. Reconcile the transaction before another write.',
          signature,
        ),
      ),
    );
    if (!saved.initialized)
      return yield* ownerFailure(
        'TREASURY_READBACK_MISMATCH',
        'The confirmed vault could not be read. Refresh before another write.',
        signature,
      );
    return treasuryResult(saved, signature);
  });
}

function transferOwnerFunds(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  amount: bigint,
  direction: 'deposit' | 'withdraw',
) {
  return Effect.gen(function* () {
    const context = yield* initializedOwnerContext(connection, config);
    const input = {
      programAddress: context.programAddress,
      ownerAddress: context.ownerAddress,
      network: context.network,
      vaultAddress: context.vaultAddress,
      amount,
    };
    const built =
      direction === 'deposit'
        ? yield* builder(createVaultDepositInstructions(input))
        : yield* builder(createVaultWithdrawInstructions(input));
    const check = Effect.gen(function* () {
      const current = yield* initializedOwnerContext(connection, config);
      const available = yield* ownerTokenBalance(
        current,
        direction === 'deposit' ? current.ownerAddress : current.vaultAddress,
      );
      if (available < amount)
        return yield* ownerFailure(
          'INSUFFICIENT_USDC',
          direction === 'deposit'
            ? 'Your wallet does not have enough USDC for this deposit.'
            : 'The vault does not have enough USDC for this withdrawal.',
        );
    });
    yield* check;
    const signature = yield* signOwnerInstructions(
      connection,
      context,
      built.instructions,
      'TREASURY',
      check,
    );
    return treasuryResult(context, signature);
  });
}

export function depositOwnerFunds(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  input: { amount: bigint },
) {
  return transferOwnerFunds(connection, config, input.amount, 'deposit');
}
export function withdrawOwnerFunds(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  input: { amount: bigint },
) {
  return transferOwnerFunds(connection, config, input.amount, 'withdraw');
}

export function setOwnerAgentFrozen(
  connection: OwnerWalletConnection,
  config: OwnerWalletConfig,
  input: { agentKey: string; isFrozen: boolean },
) {
  const reviewed = { ...input };
  return Effect.gen(function* () {
    const context = yield* initializedOwnerContext(connection, config);
    const built = yield* builder(
      createSetAgentFrozenInstruction({
        programAddress: context.programAddress,
        ownerAddress: context.ownerAddress,
        network: context.network,
        vaultAddress: context.vaultAddress,
        ...reviewed,
      }),
    );
    const check = Effect.gen(function* () {
      const policy = yield* readOwnerPolicy(context, built.policyAddress);
      if (!policy || policy.agentKey !== reviewed.agentKey || policy.vault !== context.vaultAddress)
        return yield* ownerFailure(
          'POLICY_MISSING',
          'This agent has no policy in the connected owner vault.',
        );
    });
    yield* check;
    const signature = yield* signOwnerInstructions(
      connection,
      context,
      [built.instruction],
      'TREASURY',
      check,
    );
    const saved = yield* readOwnerPolicy(context, built.policyAddress, signature);
    if (!saved || saved.isFrozen !== reviewed.isFrozen)
      return yield* ownerFailure(
        'TREASURY_READBACK_MISMATCH',
        'The confirmed freeze state differs. Refresh the agent before another write.',
        signature,
      );
    return treasuryResult(context, signature);
  });
}
