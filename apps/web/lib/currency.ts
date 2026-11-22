const balanceFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});
const paymentFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export const dollars = (amount: number) => balanceFormat.format(amount);
/** USDC micropayments must not misleadingly round a nonzero charge to $0.00. */
export const paymentDollars = (amount: number) => paymentFormat.format(amount);
