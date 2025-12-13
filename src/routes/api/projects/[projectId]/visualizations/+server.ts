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

// POST /api/projects/:projectId/visualizations
// Creates a new visualization in the project
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userId = locals.user?.user_id;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const projectId = params.projectId;

  const body = await request.json();
  const { file_id, name, description, spec } = body;

  if (!name || !spec) {
    return new Response('Missing required fields: name, spec', { status: 400 });
  }

  const db = DB();
  
  // Check membership
  const { rows: membership } = await db.query(
    `SELECT 1 FROM data.project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  
  if (!membership.length) {
    return new Response('Not found or not a member', { status: 404 });
  }

  // Insert visualization
  const { rows } = await db.query(
    `INSERT INTO data.visualizations 
     (project_id, file_id, name, description, spec, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING viz_id, project_id, file_id, name, description, spec, 
               thumbnail_mime, is_template, version, created_at, updated_at`,
    [projectId, file_id ?? null, name, description ?? null, JSON.stringify(spec), userId]
  );

  return new Response(JSON.stringify(rows[0]), {
    headers: { 'content-type': 'application/json' },
    status: 201
  });
};
