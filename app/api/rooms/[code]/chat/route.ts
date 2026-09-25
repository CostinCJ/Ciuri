import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { messageBodySchema } from '@/lib/server/schemas';
import { sendMessage } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { text } = messageBodySchema.parse(await readJson(request));
    await sendMessage(serviceDeps(), code, userId, text);
  });
}
