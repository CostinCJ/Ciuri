import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { nameBodySchema } from '@/lib/server/schemas';
import { createRoom } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request) {
  return handle(async () => {
    const userId = await requireUserId(request);
    const { name } = nameBodySchema.parse(await readJson(request));
    return { code: await createRoom(serviceDeps(), userId, name) };
  });
}
