import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { seq, snapshot } = await request.json();
  if (typeof seq !== 'number' || !snapshot) return new Response('Invalid payload', { status: 400 });
  const db = DB();
  await db.query(
    `INSERT INTO data.file_snapshots (file_id, seq, snapshot)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (file_id, seq) DO UPDATE SET snapshot = EXCLUDED.snapshot`,
    [params.fileId, seq, JSON.stringify(snapshot)]
  );
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};