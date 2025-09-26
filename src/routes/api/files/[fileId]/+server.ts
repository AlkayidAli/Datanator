import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

// DELETE /api/files/:fileId  (remove a file + cascades)
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const db = DB();

  // Ensure user is a member of the project owning this file
  const { rows } = await db.query(
    `SELECT f.project_id, f.name
     FROM data.project_files f
     JOIN data.project_members m ON m.project_id = f.project_id
     WHERE f.file_id = $1 AND m.user_id = $2
     LIMIT 1`,
    [params.fileId, userId]
  );
  if (!rows.length) return new Response('Not found', { status: 404 });

  await db.query(`DELETE FROM data.project_files WHERE file_id = $1`, [params.fileId]);
  // Cascades remove snapshots & ops via FK ON DELETE CASCADE
  return new Response(null, { status: 204 });
};