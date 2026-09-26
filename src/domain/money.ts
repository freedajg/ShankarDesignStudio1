/** All money is integer paise (1 INR = 100 paise). Never floats. */
export type Paise = number;

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer number of paise`);
  return value;
}

/** value × bps / 10000, rounded half-up to the paise. */
export function applyBps(value: Paise, bps: number): Paise {
  return Math.floor((value * bps + 5000) / 10000);
}

/** Discount by basis points, rounded half-up at the unit level. */
export function discountBps(value: Paise, bps: number): Paise {
  return value - applyBps(value, bps);
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatInr(paise: Paise, opts: { whole?: boolean } = {}): string {
  if (opts.whole && paise % 100 === 0) return inrWhole.format(paise / 100);
  return inr.format(paise / 100);
}
