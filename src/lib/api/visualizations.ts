import type { ChartSpec, VisualizationRecord } from '$lib/types/visualization';

export async function createVisualization(params: {
    projectId: string;
    fileId: string | null;
    name: string;
    description?: string;
    spec: ChartSpec;
}) {
    const res = await fetch(`/api/projects/${params.projectId}/visualizations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            file_id: params.fileId,
            name: params.name,
            description: params.description ?? null,
            spec: params.spec
        })
    });
    if (!res.ok) throw new Error('Failed to create visualization');
    return (await res.json()) as VisualizationRecord;
}

export async function listVisualizations(projectId: string) {
    const res = await fetch(`/api/projects/${projectId}/visualizations`, {
        credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to list visualizations');
    return (await res.json()) as VisualizationRecord[];
}