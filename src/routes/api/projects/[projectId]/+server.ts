import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const db = DB();

  // Ensure the user is the owner
  const { rows } = await db.query(
    `SELECT owner_user_id FROM data.projects WHERE project_id = $1`,
    [params.projectId]
  );
  if (!rows.length) return new Response('Not found', { status: 404 });
  if (rows[0].owner_user_id !== userId) return new Response('Forbidden', { status: 403 });

  await db.query(
    `DELETE FROM data.projects WHERE project_id = $1 AND owner_user_id = $2`,
    [params.projectId, userId]
  );

  return new Response(null, { status: 204 });
};