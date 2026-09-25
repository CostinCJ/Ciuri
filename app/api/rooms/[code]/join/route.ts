import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { nameBodySchema } from '@/lib/server/schemas';
import { joinRoom } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { name } = nameBodySchema.parse(await readJson(request));
    return { code: await joinRoom(serviceDeps(), code, userId, name) };
  });
}
