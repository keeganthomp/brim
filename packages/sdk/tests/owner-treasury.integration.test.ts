/** Explicit fake-fund chain integration; never runs against an external RPC. */
import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  getAddressDecoder,
} from '@solana/kit';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
  createInitVaultInstruction,
  createVaultDepositInstructions,
  createVaultWithdrawInstructions,
  createSetAgentFrozenInstruction,
  createUpsertAgentPolicyInstruction,
  decodeAgentPolicy,
} from '../src/index.js';
import {
  assertLocalRpc,
  DEVNET_GENESIS,
  MINT,
  TOKEN,
} from '../../../infra/local/surfpool/config.ts';
import {
  createAta,
  createLocalClient,
  signer,
  u64,
  writable,
} from '../../../infra/local/surfpool/transactions.ts';
import { seedSurfpool } from '../../../infra/local/surfpool/seed.ts';

describe.runIf(process.env.BRIM_TEST_OWNER_TREASURY === '1')(
  'treasury builders on offline Surfpool',
  () => {
    it('initializes, deposits, withdraws with a missing owner ATA, and freezes/resumes on-chain', async () => {
      const rpcUrl = process.env.BRIM_TEST_RPC_URL ?? 'http://127.0.0.1:18899';
      assertLocalRpc(rpcUrl);
      const client = createLocalClient(rpcUrl);
      expect(await client.rpc('getGenesisHash')).toBe(DEVNET_GENESIS);
      await client.rpc('surfnet_getSurfnetInfo');
      await seedSurfpool({ rpcUrl });
      const mintResult = (await client.rpc('getAccountInfo', [MINT, { encoding: 'base64' }])) as {
        value: { data: [string, string]; owner: string };
      };
      expect(mintResult.value.owner).toBe(TOKEN);
      const mintData = Buffer.from(mintResult.value.data[0], 'base64');
      expect(getAddressDecoder().decode(mintData.subarray(4, 36))).toBe(
        'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB',
      );
      const owner = await generateKeyPairSigner();
      const agent = await generateKeyPairSigner();
      const base = {
        programAddress: BRIM_DEVELOPMENT_PROGRAM_ADDRESS,
        ownerAddress: owner.address,
        network: 'devnet' as const,
      };
      const initial = await Effect.runPromise(createInitVaultInstruction(base));
      await client.confirm(
        (await client.rpc('requestAirdrop', [owner.address, 5_000_000_000])) as string,
      );
      await client.send(owner, [initial.instruction]);

      const deposit = await Effect.runPromise(
        createVaultDepositInstructions({
          ...base,
          vaultAddress: initial.vaultAddress,
          amount: 500_000n,
        }),
      );
      await client.send(owner, [
        createAta(owner, owner.address, address(deposit.sourceTokenAccount)),
      ]);
      // Public fixture authority only, after the synthetic-mint check above.
      const authority = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(7));
      await client.send(owner, [
        {
          programAddress: TOKEN,
          accounts: [writable(MINT), writable(deposit.sourceTokenAccount), signer(authority)],
          data: Buffer.concat([new Uint8Array([7]), u64(500_000n)]),
        },
      ]);
      await client.send(owner, deposit.instructions);
      expect(await client.tokenBalance(deposit.sourceTokenAccount)).toBe(0n);
      expect(await client.tokenBalance(initial.vaultTokenAccount)).toBe(500_000n);

      // Close only this empty synthetic source account to verify missing-ATA withdrawal.
      await client.send(owner, [
        {
          programAddress: TOKEN,
          accounts: [writable(deposit.sourceTokenAccount), writable(owner.address), signer(owner)],
          data: new Uint8Array([9]),
        },
      ]);
      const missing = (await client.rpc('getAccountInfo', [deposit.sourceTokenAccount])) as {
        value: unknown;
      };
      expect(missing.value).toBeNull();
      const withdrawal = await Effect.runPromise(
        createVaultWithdrawInstructions({
          ...base,
          vaultAddress: initial.vaultAddress,
          amount: 200_000n,
        }),
      );
      await client.send(owner, withdrawal.instructions);
      expect(await client.tokenBalance(withdrawal.ownerTokenAccount)).toBe(200_000n);
      expect(await client.tokenBalance(initial.vaultTokenAccount)).toBe(300_000n);
      const repeated = await Effect.runPromise(
        createVaultWithdrawInstructions({
          ...base,
          vaultAddress: initial.vaultAddress,
          amount: 100_000n,
        }),
      );
      await client.send(owner, repeated.instructions);
      expect(await client.tokenBalance(repeated.ownerTokenAccount)).toBe(300_000n);

      const policy = await Effect.runPromise(
        createUpsertAgentPolicyInstruction({
          programAddress: base.programAddress,
          ownerAddress: owner.address,
          vaultAddress: initial.vaultAddress,
          agentKey: agent.address,
          limits: {
            maxPerTx: 100_000n,
            windowLimit: 500_000n,
            windowDuration: 86_400n,
            minTxInterval: 0n,
            allowlistEnabled: false,
            allowlist: [],
          },
        }),
      );
      await client.send(owner, [policy.instruction]);
      const first = decodeAgentPolicy(await client.accountBytes(policy.policyAddress));
      for (const isFrozen of [true, false]) {
        const frozen = await Effect.runPromise(
          createSetAgentFrozenInstruction({
            ...base,
            vaultAddress: initial.vaultAddress,
            agentKey: agent.address,
            isFrozen,
          }),
        );
        await client.send(owner, [frozen.instruction]);
        const current = decodeAgentPolicy(await client.accountBytes(frozen.policyAddress));
        expect(current.isFrozen).toBe(isFrozen);
        expect(current.windowStart).toBe(first.windowStart);
        expect(current.windowSpent).toBe(first.windowSpent);
      }
      expect(await client.tokenBalance(initial.vaultTokenAccount)).toBe(200_000n);
    }, 30_000);
  },
);
