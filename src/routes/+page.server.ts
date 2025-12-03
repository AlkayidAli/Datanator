import type { PageServerLoad } from './$types';
import DB from '$lib/common/DB_Postgresql';

type MiniPreview = {
    columns: string[];
    rows: any[][];
} | null;

type MiniViz = {
    viz_id: string;
    name: string;
    updated_at: string;
    thumbnail_mime?: string | null;
    mark?: string | null; // derived from spec.mark when present
};

type ProjectCard = {
    project_id: string;
    name: string;
    created_at: string;
    updated_at: string;
    file_count: number;
    viz_count: number;
    preview: MiniPreview;
    recent_viz: MiniViz[];
};

export const load: PageServerLoad = async ({ locals }) => {
    const user = locals.user ?? null;
    if (!user) {
        return { user: null, projects: [] satisfies ProjectCard[] };
    }

    const db = DB();
    // List projects for this user with file/viz counts
    const { rows: projects } = await db.query(
        `SELECT p.project_id, p.name, p.created_at, p.updated_at,
                        COALESCE(f.cnt, 0) AS file_count,
                        COALESCE(v.cnt, 0) AS viz_count
         FROM data.projects p
         JOIN data.project_members m ON m.project_id = p.project_id AND m.user_id = $1
         LEFT JOIN (
             SELECT project_id, COUNT(*) AS cnt FROM data.project_files GROUP BY project_id
         ) f ON f.project_id = p.project_id
         LEFT JOIN (
             SELECT project_id, COUNT(*) AS cnt FROM data.visualizations GROUP BY project_id
         ) v ON v.project_id = p.project_id
         ORDER BY p.updated_at DESC`,
        [user.user_id]
    );

    const cards: ProjectCard[] = [];
    for (const p of projects) {
        // Latest file for a tiny data preview
        const { rows: latestFile } = await db.query(
            `SELECT file_id FROM data.project_files WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
            [p.project_id]
        );

        let preview: MiniPreview = null;
        if (latestFile.length) {
            const fileId = latestFile[0].file_id as string;
            const { rows: snap } = await db.query(
                `SELECT snapshot FROM data.file_snapshots WHERE file_id = $1 ORDER BY seq DESC LIMIT 1`,
                [fileId]
            );
            if (snap.length && snap[0].snapshot) {
                try {
                    const s = snap[0].snapshot as any;
                    // Expecting { columns: string[], rows: any[][] } or a similar shape
                    const cols: string[] = Array.isArray(s?.columns)
                        ? (s.columns as string[])
                        : (Array.isArray(s?.headers) ? (s.headers as string[]) : []);
                    const rows: any[][] = Array.isArray(s?.rows) ? (s.rows as any[][]) : [];
                    const takeCols = cols.slice(0, 3);
                    const projRows = rows.slice(0, 3).map((r) => takeCols.map((_, i) => r[i]));
                    preview = { columns: takeCols, rows: projRows };
                } catch {
                    preview = null;
                }
            }
        }

        // Recent visualizations (top 3)
            const { rows: viz } = await db.query(
            `SELECT viz_id, name, updated_at, spec, thumbnail_mime
             FROM data.visualizations
             WHERE project_id = $1
             ORDER BY updated_at DESC
             LIMIT 3`,
            [p.project_id]
        );

            const recent_viz: MiniViz[] = (viz as any[]).map((v: any) => ({
            viz_id: v.viz_id,
            name: v.name,
            updated_at: v.updated_at,
            thumbnail_mime: v.thumbnail_mime ?? null,
            mark: typeof v.spec === 'object' && v.spec && 'mark' in v.spec ? (v.spec.mark as string) : null
        }));

        cards.push({
            project_id: p.project_id,
            name: p.name,
            created_at: p.created_at,
            updated_at: p.updated_at,
            file_count: Number(p.file_count ?? 0),
            viz_count: Number(p.viz_count ?? 0),
            preview,
            recent_viz
        });
    }

    return { user, projects: cards };
};