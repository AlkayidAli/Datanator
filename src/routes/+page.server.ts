import type { PageServerLoad } from './$types';
import DB from '$lib/common/DB_Postgresql';

type MiniPreview = {
    columns: string[];
    rows: any[][];
} | null;

type FileInfo = {
    file_id: string;
    name: string;
    original_filename: string | null;
    updated_at: string;
};

type MiniViz = {
    viz_id: string;
    name: string;
    description?: string | null;
    title?: string | null; // from spec
    updated_at: string;
    thumbnail_mime?: string | null;
    mark?: string | null;
    file_name?: string | null;
};

type ProjectCard = {
    project_id: string;
    name: string;
    created_at: string;
    updated_at: string;
    file_count: number;
    viz_count: number;
    files: FileInfo[];
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
        // Fetch all files in this project
        const { rows: filesData } = await db.query(
            `SELECT file_id, name, original_filename, updated_at 
             FROM data.project_files 
             WHERE project_id = $1 
             ORDER BY updated_at DESC 
             LIMIT 10`,
            [p.project_id]
        );
        const files: FileInfo[] = filesData.map((f: any) => ({
            file_id: f.file_id,
            name: f.name,
            original_filename: f.original_filename ?? null,
            updated_at: f.updated_at
        }));

        // Latest file for data preview (larger: 6 rows)
        let preview: MiniPreview = null;
        if (files.length) {
            const fileId = files[0].file_id;
            const { rows: snap } = await db.query(
                `SELECT snapshot FROM data.file_snapshots WHERE file_id = $1 ORDER BY seq DESC LIMIT 1`,
                [fileId]
            );
            if (snap.length && snap[0].snapshot) {
                try {
                    const s = snap[0].snapshot as any;
                    // Handle both 'columns' and 'headers' field names
                    const cols: string[] = Array.isArray(s?.columns)
                        ? (s.columns as string[])
                        : (Array.isArray(s?.headers) ? (s.headers as string[]) : []);
                    
                    // Handle both array-based and object-based rows
                    const rawRows = Array.isArray(s?.rows) ? s.rows : [];
                    const takeCols = cols.slice(0, 5);
                    
                    // Convert rows to array format (handle both array and object rows)
                    const projRows = rawRows.slice(0, 6).map((r: any) => {
                        if (Array.isArray(r)) {
                            // Row is already an array
                            return takeCols.map((_, i) => r[i]);
                        } else if (typeof r === 'object' && r !== null) {
                            // Row is an object, extract values by column names
                            return takeCols.map(col => r[col]);
                        }
                        return [];
                    });
                    
                    preview = { columns: takeCols, rows: projRows };
                } catch (e) {
                    console.error('Preview error:', e);
                    preview = null;
                }
            }
        }

        // Recent visualizations with full details
        const { rows: viz } = await db.query(
            `SELECT v.viz_id, v.name, v.description, v.updated_at, v.spec, v.thumbnail_mime, v.file_id,
                    f.name as file_name
             FROM data.visualizations v
             LEFT JOIN data.project_files f ON f.file_id = v.file_id
             WHERE v.project_id = $1
             ORDER BY v.updated_at DESC
             LIMIT 5`,
            [p.project_id]
        );

        const recent_viz: MiniViz[] = (viz as any[]).map((v: any) => ({
            viz_id: v.viz_id,
            name: v.name,
            description: v.description ?? null,
            title: (typeof v.spec === 'object' && v.spec && 'title' in v.spec) ? (v.spec.title as string) : null,
            updated_at: v.updated_at,
            thumbnail_mime: v.thumbnail_mime ?? null,
            mark: typeof v.spec === 'object' && v.spec && 'mark' in v.spec ? (v.spec.mark as string) : null,
            file_name: v.file_name ?? null
        }));

        cards.push({
            project_id: p.project_id,
            name: p.name,
            created_at: p.created_at,
            updated_at: p.updated_at,
            file_count: Number(p.file_count ?? 0),
            viz_count: Number(p.viz_count ?? 0),
            files,
            preview,
            recent_viz
        });
    }

    return { user, projects: cards };
};