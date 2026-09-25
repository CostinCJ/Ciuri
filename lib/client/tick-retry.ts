import { ApiError } from './api';

export const BASE_RETRY_MS = 1500;
export const MAX_RETRY_MS = 10_000;

/** Delay before retry number `attempt` (0-based): exponential backoff capped at MAX_RETRY_MS. */
export function retryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
}

/** Errors that retrying cannot fix: not signed in, not a member of the room, or no such room. */
export function shouldStopTicking(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404);
}
