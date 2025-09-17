import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

export const GET: RequestHandler = async ({ params, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const db = DB();
  const { rows } = await db.query(
    `SELECT f.file_id, f.name, f.original_filename, f.created_at, f.updated_at
     FROM data.project_files f
     JOIN data.project_members m ON m.project_id = f.project_id
     WHERE f.project_id = $1 AND m.user_id = $2
     ORDER BY f.created_at ASC`,
    [params.projectId, userId]
  );
  return new Response(JSON.stringify({ files: rows }), { headers: { 'content-type': 'application/json' } });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { name, originalFilename, snapshot } = await request.json();
  if (!name?.trim() || !snapshot) return new Response('Invalid payload', { status: 400 });

  const db = DB();
  // Create file and store initial snapshot at seq 0
  const { rows } = await db.query(
    `WITH f AS (
       INSERT INTO data.project_files (project_id, name, original_filename)
       SELECT p.project_id, $2, $3
       FROM data.projects p
       JOIN data.project_members m ON m.project_id = p.project_id AND m.user_id = $1
       WHERE p.project_id = $4
       RETURNING file_id, name, original_filename, created_at, updated_at
     )
     INSERT INTO data.file_snapshots (file_id, seq, snapshot)
     SELECT file_id, 0, $5::jsonb FROM f
     RETURNING (SELECT row_to_json(f) FROM f) AS file`,
    [userId, name.trim(), originalFilename ?? null, params.projectId, JSON.stringify(snapshot)]
  );
  if (!rows.length) return new Response('Not found or not a member', { status: 404 });
  return new Response(JSON.stringify(rows[0].file), { headers: { 'content-type': 'application/json' } });
};