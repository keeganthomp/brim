import { describe, expect, it, vi } from 'vitest';
import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from '@solana/kit';
import { ExactSvmScheme as FacilitatorScheme } from '@x402/svm/exact/facilitator';
import { toFacilitatorSvmSigner } from '@x402/svm';
import {
  createBrimVaultConfig,
  createBrimFetch,
  validatePaymentRequirements,
} from '../src/index.js';
import { createSolanaPaymentAdapter, findTokenAccount } from '../src/solana.js';
import {
  config,
  req,
  fixture,
  paymentRequired,
  OWNER,
  SPONSOR,
  MERCHANT,
} from './sharedfixtures.js';

describe('real kit transaction construction with RPC fixtures', () => {
  it('signs a v0 program payment with an isolated unsigned sponsor and no approval', async () => {
    const f = await fixture();
    const wire = await createSolanaPaymentAdapter(f.config).createTransaction(
      validatePaymentRequirements(f.config, req),
    );
    const tx = getTransactionDecoder().decode(Uint8Array.from(atob(wire), (c) => c.charCodeAt(0)));
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    expect(message.version).toBe(0);
    expect(message.staticAccounts[0]).toBe(SPONSOR);
    expect(tx.signatures[f.signer.address]).toHaveLength(64);
    expect(tx.signatures[SPONSOR]).toBeNull();
    const programIndex = message.staticAccounts.indexOf(address(config.programAddress));
    const instruction = message.instructions.find((i) => i.programAddressIndex === programIndex)!;
    expect([...instruction.data!]).toEqual([
      86, 4, 7, 7, 120, 139, 232, 139, 64, 156, 0, 0, 0, 0, 0, 0,
    ]);
    expect(instruction.accountIndices).toHaveLength(8);
    expect(instruction.accountIndices!.map((index) => message.staticAccounts[index])).toEqual([
      f.signer.address,
      f.config.vaultAddress,
      f.policyAddress,
      req.asset,
      await findTokenAccount(f.config.vaultAddress, req.asset),
      MERCHANT,
      await findTokenAccount(MERCHANT, req.asset),
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ]);
    expect(instruction.accountIndices).not.toContain(0);
    expect(message.instructions).toHaveLength(4);
  });
  it('is accepted by the real current x402 verifier only with opt-in simulation and a matching CPI transfer', async () => {
    const f = await fixture();
    const wire = await createSolanaPaymentAdapter(f.config).createTransaction(
      validatePaymentRequirements(f.config, req),
    );
    const sponsor = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(3));
    let destination = await findTokenAccount(MERCHANT, req.asset);
    const simulator = {
      ...toFacilitatorSvmSigner(sponsor),
      simulateTransactionWithInnerInstructions: async () => ({
        innerInstructions: [
          {
            index: 2,
            instructions: [
              {
                programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                parsed: {
                  type: 'transferChecked',
                  info: {
                    mint: req.asset,
                    destination,
                    authority: f.config.vaultAddress,
                    tokenAmount: { amount: req.amount },
                  },
                },
              },
            ],
          },
        ],
      }),
    };
    const payload = { x402Version: 2, accepted: req, payload: { transaction: wire } };
    expect((await new FacilitatorScheme(simulator).verify(payload, req)).isValid).toBe(false);
    const verifier = new FacilitatorScheme(simulator, undefined, {
      enableSmartWalletVerification: true,
      smartWalletAllowedPrograms: [config.programAddress],
    });
    expect(await verifier.verify(payload, req)).toMatchObject({
      isValid: true,
      payer: f.config.vaultAddress,
    });
    destination = OWNER;
    expect((await verifier.verify(payload, req)).isValid).toBe(false);
  });
  it('preserves POST bytes, disables redirects and attempts payment once', async () => {
    const f = await fixture();
    const requests: Request[] = [];
    const transport = vi.fn(async (input) => {
      const request = input as Request;
      requests.push(request.clone());
      return requests.length === 1 ? paymentRequired() : new Response('paid');
    });
    const response = await createBrimFetch({ ...f.config, fetch: transport })(
      'https://merchant.test/api',
      { method: 'POST', body: '{"query":"test"}' },
    );
    expect(await response.text()).toBe('paid');
    expect(requests).toHaveLength(2);
    expect(await requests[0].text()).toBe(await requests[1].text());
    expect(requests[1].headers.has('PAYMENT-SIGNATURE')).toBe(true);
    expect(requests[1].redirect).toBe('error');
  });
  it('uses vault config setup with an explicit RPC override and snapshots its scoped key before caller mutation', async () => {
    const f = await fixture();
    const scopedKey = f.config.agentSecretKey as Uint8Array;
    const vaultConfig = createBrimVaultConfig({
      vaultAddress: f.config.vaultAddress,
      programAddress: f.config.programAddress,
      network: f.config.network,
      facilitatorFeePayers: f.config.facilitator.feePayers,
    });
    const requests: Request[] = [];
    const transport = vi.fn(async (input) => {
      requests.push((input as Request).clone());
      return requests.length === 1 ? paymentRequired() : new Response('paid with vault config');
    });
    const fetchWithCard = createBrimFetch({
      vaultConfig,
      agentKey: scopedKey,
      rpcUrl: f.config.rpcUrl,
      fetch: transport,
    });
    scopedKey.fill(0);
    const response = await fetchWithCard('https://merchant.test/api', {
      method: 'POST',
      body: 'original bytes',
    });
    expect(await response.text()).toBe('paid with vault config');
    expect(await requests[0].text()).toBe(await requests[1].text());
    const payload = JSON.parse(atob(requests[1].headers.get('PAYMENT-SIGNATURE')!));
    const transaction = getTransactionDecoder().decode(
      Uint8Array.from(atob(payload.payload.transaction), (c) => c.charCodeAt(0)),
    );
    expect(transaction.signatures[f.signer.address]).toHaveLength(64);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('rejects frozen policies before blockhash fetch or signing', async () => {
    const f = await fixture();
    f.policyData[72] = 1;
    await expect(
      createSolanaPaymentAdapter(f.config).createTransaction(
        validatePaymentRequirements(f.config, req),
      ),
    ).rejects.toMatchObject({ code: 'AGENT_FROZEN' });
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('does not create a fresh authorization after a rejected payment', async () => {
    const f = await fixture();
    const transport = vi.fn(async () => paymentRequired());
    await expect(
      createBrimFetch({ ...f.config, fetch: transport })('https://merchant.test/api'),
    ).rejects.toMatchObject({ code: 'PAYMENT_REJECTED' });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(f.rpc).toHaveBeenCalledTimes(3);
  });
});
