import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../errors';
import { handle, readJson } from '../http';

describe('handle', () => {
  it('returns the body as JSON, defaulting to { ok: true }', async () => {
    expect(await (await handle(async () => ({ code: 'ABCD' }))).json()).toEqual({ code: 'ABCD' });
    expect(await (await handle(async () => undefined)).json()).toEqual({ ok: true });
  });

  it('maps HttpError and validation errors to their status with a message', async () => {
    const notFound = await handle(async () => { throw new HttpError(404, 'Camera nu există'); });
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: 'Camera nu există' });

    const invalid = await handle(async () => z.object({ name: z.string().min(2, 'Prea scurt') }).parse({ name: 'a' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Prea scurt' });
  });

  it('hides unexpected errors behind a 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handle(async () => { throw new Error('db down'); });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Eroare de server' });
    spy.mockRestore();
  });
});

describe('readJson', () => {
  it('rejects malformed bodies with 400', async () => {
    const req = new Request('http://x', { method: 'POST', body: '{nope' });
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
  });
});
