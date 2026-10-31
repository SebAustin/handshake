/**
 * PayPal represents amounts as decimal strings ("12.34"); Handshake keeps money
 * as integer cents everywhere else so no arithmetic ever touches floats.
 */

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function centsToValue(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new RangeError(`Amount must be a positive integer number of cents, got ${cents}`);
  }
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function valueToCents(value: string): number {
  if (!AMOUNT_PATTERN.test(value)) {
    throw new RangeError(`Not a valid PayPal amount: "${value}"`);
  }
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
