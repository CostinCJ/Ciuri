/**
 * A random id for realtime channel topics. `crypto.randomUUID` exists only in secure contexts
 * (https or localhost), so plain-http LAN addresses fall back to `getRandomValues`.
 */
export function uniqueId(source: Crypto = globalThis.crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID().replaceAll('-', '');
  const bytes = source.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
