import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './errors';

/** Runs a route body and maps errors to JSON responses with Romanian messages. */
export async function handle(run: () => Promise<unknown>): Promise<Response> {
  try {
    const body = await run();
    return NextResponse.json(body ?? { ok: true });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Eroare de server' }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Cerere invalidă');
  }
}
