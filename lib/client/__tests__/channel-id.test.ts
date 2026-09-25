import { describe, expect, it } from 'vitest';
import { uniqueId } from '../channel-id';

describe('uniqueId', () => {
  it('returns a different id on every call', () => {
    const ids = new Set(Array.from({ length: 50 }, () => uniqueId()));
    expect(ids.size).toBe(50);
  });

  it('works without crypto.randomUUID (insecure origins such as a LAN IP)', () => {
    const fake = { getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a) } as unknown as Crypto;
    const a = uniqueId(fake);
    const b = uniqueId(fake);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});
