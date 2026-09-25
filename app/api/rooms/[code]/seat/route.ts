import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { seatBodySchema } from '@/lib/server/schemas';
import { takeSeat } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { seat } = seatBodySchema.parse(await readJson(request));
    await takeSeat(serviceDeps(), code, userId, seat);
  });
}
