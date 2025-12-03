import type { RequestHandler } from './$types';
import DB from '$lib/common/DB_Postgresql';

// GET /api/projects/:projectId/visualizations
// Lists visualizations the current user can access within the project
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const projectId = params.projectId;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

  const db = DB();
  // Ensure membership then list visualizations
  const { rows } = await db.query(
    `SELECT v.viz_id, v.project_id, v.file_id, v.name, v.description, v.spec,
            v.thumbnail_mime, v.is_template, v.version, v.created_at, v.updated_at
     FROM data.visualizations v
     JOIN data.project_members m ON m.project_id = v.project_id AND m.user_id = $2
     WHERE v.project_id = $1
     ORDER BY v.updated_at DESC
     LIMIT $3`,
    [projectId, userId, limit]
  );

  return new Response(JSON.stringify(rows), {
    headers: { 'content-type': 'application/json' }
  });
};

// POST intentionally handled elsewhere by client wrapper; implement later if needed
