import { requireUserId } from '@/lib/server/auth';
import { handle } from '@/lib/server/http';
import { advance } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const game = await advance(serviceDeps(), code, userId);
    return { changed: game !== null, game };
  });
}
