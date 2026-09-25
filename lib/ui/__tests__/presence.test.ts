import { describe, expect, it } from 'vitest';
import { isOffline } from '../seats';

describe('isOffline', () => {
  it('shows nobody as offline until the first presence sync', () => {
    expect(isOffline(null, 'u1')).toBe(false);
    expect(isOffline(null, undefined)).toBe(false);
  });

  it('uses the presence set once known', () => {
    const online = new Set(['u1']);
    expect(isOffline(online, 'u1')).toBe(false);
    expect(isOffline(online, 'u2')).toBe(true);
    expect(isOffline(online, undefined)).toBe(true);
  });
});
