/** Real x402 verification and settlement; the facilitator runs in-process for local development. */
import { Effect } from 'effect';
import { x402Facilitator } from '@x402/core/facilitator';
import {
  x402HTTPResourceServer,
  x402ResourceServer,
  type FacilitatorClient,
} from '@x402/core/server';
import { ExactSvmScheme as ExactFacilitator } from '@x402/svm/exact/facilitator';
import { ExactSvmScheme as ExactServer } from '@x402/svm/exact/server';
import { toFacilitatorSvmSigner } from '@x402/svm';
import { LocalSetupError } from '../../../scripts/local/config.ts';
import { MINT } from '../surfpool/config.ts';
import { PAYMENT_AMOUNT, type LocalContext } from './context.ts';

export function createLocalResource(context: LocalContext) {
  return Effect.gen(function* () {
    const facilitator = new x402Facilitator().register(
      context.network,
      new ExactFacilitator(
        toFacilitatorSvmSigner(context.facilitatorSigner, { defaultRpcUrl: context.rpcUrl }),
        undefined,
        {
          enableSmartWalletVerification: true,
          smartWalletAllowedPrograms: [context.programAddress],
          smartWalletMaxComputeUnits: 200_000,
          smartWalletMaxPriorityFeeMicroLamports: 1,
          maxRequiredSignatures: 2,
          transactionVersions: [0],
        },
      ),
    );
    const client: FacilitatorClient = {
      verify: (payment, requirements) => facilitator.verify(payment, requirements),
      settle: (payment, requirements) => facilitator.settle(payment, requirements),
      getSupported: async () => {
        const supported = facilitator.getSupported();
        return {
          ...supported,
          kinds: supported.kinds.map(({ extra, ...kind }) => ({
            ...kind,
            network: context.network,
            ...(extra === undefined ? {} : { extra }),
          })),
        };
      },
    };
    const core = new x402ResourceServer(client).register(
      context.network,
      new ExactServer({ rpcUrl: context.rpcUrl }),
    );
    const resource = new x402HTTPResourceServer(core, {
      'GET /report': {
        accepts: {
          scheme: 'exact',
          network: context.network,
          payTo: context.merchantAddress,
          price: { amount: PAYMENT_AMOUNT.toString(), asset: MINT },
          maxTimeoutSeconds: 60,
        },
        description: 'A local Brim paid report',
        mimeType: 'application/json',
      },
    });
    yield* Effect.tryPromise({
      try: () => resource.initialize(),
      catch: () =>
        new LocalSetupError({
          message: 'Could not initialize the local x402 resource and facilitator.',
        }),
    });
    return resource;
  });
}
