import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { actionBodySchema } from '@/lib/server/schemas';
import { act } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { action } = actionBodySchema.parse(await readJson(request));
    return { game: await act(serviceDeps(), code, userId, action) };
  });
}
