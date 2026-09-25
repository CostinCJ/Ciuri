import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { MAX_RETRY_MS, retryDelay, shouldStopTicking } from '../tick-retry';

describe('tick retry policy', () => {
  it('backs off exponentially and caps at 10 s', () => {
    expect(retryDelay(0)).toBe(1500);
    expect(retryDelay(1)).toBe(3000);
    expect(retryDelay(2)).toBe(6000);
    expect(retryDelay(3)).toBe(MAX_RETRY_MS);
    expect(retryDelay(20)).toBe(MAX_RETRY_MS);
    expect(MAX_RETRY_MS).toBe(10_000);
  });

  it('gives up on 401, 403 and 404 but not on other errors', () => {
    expect(shouldStopTicking(new ApiError(401, 'x'))).toBe(true);
    expect(shouldStopTicking(new ApiError(403, 'x'))).toBe(true);
    expect(shouldStopTicking(new ApiError(404, 'x'))).toBe(true);
    expect(shouldStopTicking(new ApiError(500, 'x'))).toBe(false);
    expect(shouldStopTicking(new ApiError(409, 'x'))).toBe(false);
    expect(shouldStopTicking(new TypeError('network'))).toBe(false);
  });
});
