import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const db = DB();
  // check membership via project_files -> projects -> project_members
  const { rows: access } = await db.query(
    `SELECT 1
     FROM data.project_files f
     JOIN data.project_members m ON m.project_id = f.project_id
     WHERE f.file_id = $1 AND m.user_id = $2`,
    [params.fileId, userId]
  );
  if (!access.length) return new Response('Not found', { status: 404 });

  const since = Number(url.searchParams.get('since') ?? 0);

  const { rows: snap } = await db.query(
    `SELECT seq, snapshot FROM data.file_snapshots
     WHERE file_id = $1
     ORDER BY seq DESC
     LIMIT 1`,
    [params.fileId]
  );
  const fromSeq = snap.length ? Number(snap[0].seq) : 0;

  const { rows: ops } = await db.query(
    `SELECT seq, op_type, payload, inverse, created_at
     FROM data.file_ops
     WHERE file_id = $1 AND seq > $2
     ORDER BY seq ASC`,
    [params.fileId, Math.max(since, fromSeq)]
  );

  return new Response(JSON.stringify({
    snapshot: snap[0]?.snapshot ?? null,
    fromSeq,
    ops
  }), { headers: { 'content-type': 'application/json' } });
};