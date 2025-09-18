import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const db = DB();
  const { rows } = await db.query(
    `SELECT p.project_id, p.name, p.created_at, p.updated_at
     FROM data.projects p
     JOIN data.project_members m ON m.project_id = p.project_id
     WHERE m.user_id = $1
     ORDER BY p.updated_at DESC`,
    [userId]
  );
  return new Response(JSON.stringify({ projects: rows }), { headers: { 'content-type': 'application/json' } });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { name } = await request.json();
  if (!name?.trim()) return new Response('Project name required', { status: 400 });
  const db = DB();
  const { rows } = await db.query(
    `WITH p AS (
       INSERT INTO data.projects (owner_user_id, name) VALUES ($1, $2)
       RETURNING project_id, name, created_at, updated_at
     )
     INSERT INTO data.project_members (project_id, user_id, role)
     SELECT project_id, $1, 'owner' FROM p
     RETURNING (SELECT row_to_json(p) FROM p) AS project`,
    [userId, name.trim()]
  );
  return new Response(JSON.stringify(rows[0].project), { headers: { 'content-type': 'application/json' } });
};