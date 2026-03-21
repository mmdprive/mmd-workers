export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isIsoLike(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return out.length ? out : undefined;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}
