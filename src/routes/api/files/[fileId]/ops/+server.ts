import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

type IncomingOp = { type: string; payload?: unknown; inverse?: unknown };

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const body = await request.json();
  const ops: IncomingOp[] = Array.isArray(body?.ops) ? body.ops : [body];

  if (!ops.length) return new Response('No operations', { status: 400 });

  const db = DB();
  // Ensure the user has access (and avoid race on seq by doing it all in one statement)
  const types = ops.map((o) => o.type);
  const payloads = ops.map((o) => JSON.stringify(o.payload ?? o));
  const inverses = ops.map((o) => JSON.stringify(o.inverse ?? null));

  try {
    await db.query(
      `
      WITH auth AS (
        SELECT f.file_id, f.project_id
        FROM data.project_files f
        JOIN data.project_members m ON m.project_id = f.project_id AND m.user_id = $2
        WHERE f.file_id = $1
      ),
      lock AS (
        SELECT pg_advisory_xact_lock(89501, (SELECT hashtextextended($1::text, 42)))  -- lock per file
      ),
      base AS (
        SELECT COALESCE(MAX(seq), 0) AS seq
        FROM data.file_ops
        WHERE file_id = $1
      ),
      ins AS (
        INSERT INTO data.file_ops (file_id, seq, op_type, payload, inverse, author_user_id)
        SELECT
          $1,
          base.seq + t.ord::bigint,
          t.op_type,
          t.payload::jsonb,
          t.inverse::jsonb,
          $2
        FROM base,
             unnest($3::text[], $4::text[], $5::text[]) WITH ORDINALITY AS t(op_type, payload, inverse, ord)
        RETURNING seq
      )
      SELECT MIN(seq) AS first_seq, MAX(seq) AS last_seq FROM ins
      `,
      [params.fileId, userId, types, payloads, inverses]
    );
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
};