const DEFAULT_SECRET_LENGTH = 32;
const SECRET_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const fallbackRandomIndex = (max: number): number => {
  return Math.floor(Math.random() * max);
};

/**
 * Generates a printable secret suitable for nauthilus secret_* validators.
 * The output contains no whitespace and has enough entropy for defaults.
 */
export const generateConfigSecret = (length = DEFAULT_SECRET_LENGTH): string => {
  const safeLength = Number.isInteger(length) && length > 0 ? length : DEFAULT_SECRET_LENGTH;
  const values = new Uint8Array(safeLength);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = fallbackRandomIndex(256);
    }
  }

  let result = '';
  for (let index = 0; index < values.length; index += 1) {
    result += SECRET_ALPHABET[values[index] % SECRET_ALPHABET.length];
  }

  return result;
};

/**
 * Mirrors backend secret validation basics:
 * - non-empty
 * - minimum length
 * - no whitespace
 */
export const isValidNauthilusSecret = (value: unknown, minLength = 16): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  if (value.length < minLength) {
    return false;
  }

  return !/\s/.test(value);
};
