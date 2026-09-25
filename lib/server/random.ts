/** Uniform number in [0, 1) from the platform CSPRNG; used for shuffling and room codes in production. */
export function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
