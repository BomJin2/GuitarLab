export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function isNumberWithin(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
export function isSafeUnsigned(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return isNumberWithin(value, 0, max) && Number.isSafeInteger(value);
}
