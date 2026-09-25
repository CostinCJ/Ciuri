/** No 0/O, 1/I/L to avoid confusion when codes are read aloud or typed. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}
