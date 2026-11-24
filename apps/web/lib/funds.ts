import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

export type FundsMode = 'deposit' | 'withdraw';

export class DemoFundsError extends Data.TaggedError('DemoFundsError')<{
  message: string;
}> {}

const AmountText = Schema.String.check(Schema.isPattern(/^\d+(\.\d{1,2})?$/));
const AmountValue = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(1000000),
);

/** Validate the simulation command before a React state update. */
export const prepareDemoTransfer = (mode: FundsMode, amount: string, balance: number) =>
  Effect.gen(function* () {
    const text = yield* Schema.decodeUnknownEffect(AmountText)(amount);
    const value = yield* Schema.decodeUnknownEffect(AmountValue)(text);
    if (mode === 'withdraw' && value > balance) {
      return yield* Effect.fail(
        new DemoFundsError({
          message: 'That amount exceeds your demo balance.',
        }),
      );
    }
    return value;
  }).pipe(
    Effect.mapError((error) =>
      error._tag === 'DemoFundsError'
        ? error
        : new DemoFundsError({
            message: 'Enter an amount between $0.01 and $1,000,000.',
          }),
    ),
  );

/** Promise boundary keeps financial form validation in its deferred operation chunk. */
export const validateDemoTransfer = (mode: FundsMode, amount: string, balance: number) =>
  Effect.runPromise(
    prepareDemoTransfer(mode, amount, balance).pipe(
      Effect.match({
        onSuccess: (value) => ({ success: true as const, value }),
        onFailure: (error) => ({ success: false as const, message: error.message }),
      }),
    ),
  );

/** Parse USDC directly to base units; wallet transfers never round through a float. */
export function parseLiveTransfer(amount: string) {
  if (!/^(?:\d{1,14}(?:\.\d{1,6})?|\.\d{1,6})$/.test(amount)) return undefined;
  const [whole = '', fraction = ''] = amount.split('.');
  const units = BigInt(whole + fraction.padEnd(6, '0'));
  return units > 0n && units <= 0xffff_ffff_ffff_ffffn ? units : undefined;
}
