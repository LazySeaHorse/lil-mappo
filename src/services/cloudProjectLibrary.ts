import { supabase } from '@/lib/supabase';
import type { Project } from '@/store/types';
import { useAuthStore } from '@/store/useAuthStore';
import { parseProjectDocument, toProjectDocument } from '@/store/projectDocument';

export interface CloudProjectInfo {
  id: string;
  name: string;
  /** Unix milliseconds — converted from Supabase timestamptz */
  updatedAt: number;
}

export class CloudProjectLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Cloud save limit reached (free accounts can save up to ${limit} projects)`);
    this.name = 'CloudProjectLimitError';
  }
}

/** Hard ceiling enforced by the database; per-tier limits are enforced by the RPC. */
export const CLOUD_PROJECT_MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export class CloudProjectSizeError extends Error {
  constructor(
    public readonly limitBytes: number,
    public readonly sizeBytes?: number
  ) {
    super(
      `Project is too large for cloud sync${sizeBytes ? ` (${formatBytes(sizeBytes)})` : ''}; ` +
        `the limit is ${formatBytes(limitBytes)}. Remove large images to reduce its size.`
    );
    this.name = 'CloudProjectSizeError';
  }
}

/**
 * Upserts a project to Supabase cloud_projects.
 * Inserts on first save; updates on subsequent saves.
 *
 * Goes through the upsert_cloud_project RPC rather than a direct table write
 * so the free-tier 3-save limit is enforced atomically (advisory lock prevents
 * concurrent inserts from racing past the COUNT check).
 */
export async function saveProjectToCloud(
  project: Project,
  updatedAt = Date.now()
): Promise<{ updatedAt: number }> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('Not authenticated');

  const document = toProjectDocument(project);

  // Cheap pre-flight against the hard ceiling so a huge payload never leaves
  // the browser. The RPC still applies the tighter per-tier limit.
  const sizeBytes = new TextEncoder().encode(JSON.stringify(document)).length;
  if (sizeBytes > CLOUD_PROJECT_MAX_BYTES) {
    throw new CloudProjectSizeError(CLOUD_PROJECT_MAX_BYTES, sizeBytes);
  }

  const { data, error } = await supabase.rpc('upsert_cloud_project', {
    p_project_id: document.id,
    p_user_id: userId,
    p_name: document.name,
    p_data: document as unknown as Record<string, unknown>,
    p_updated_at: new Date(updatedAt).toISOString(),
  });

  if (error) throw error;

  const result = data as {
    error?: string;
    limit?: number;
    limit_bytes?: number;
    size_bytes?: number;
  } | null;
  if (result?.error === 'too_large') {
    throw new CloudProjectSizeError(result.limit_bytes ?? CLOUD_PROJECT_MAX_BYTES, result.size_bytes);
  }
  if (result?.error === 'limit_exceeded') {
    throw new CloudProjectLimitError(result.limit ?? 3);
  }
  return { updatedAt };
}

/**
 * Returns the list of cloud projects for the current user (metadata only).
 */
export async function listCloudProjects(): Promise<CloudProjectInfo[]> {
  const { data, error } = await supabase
    .from('cloud_projects')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

/**
 * Fetches the full project data for a single cloud project.
 */
export async function loadProjectFromCloud(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from('cloud_projects')
    .select('data')
    .eq('id', id)
    .single();

  if (error) throw error;
  return parseProjectDocument(data.data);
}

/**
 * Returns the number of cloud projects the current user has saved.
 * Used to enforce the free-tier 3-save limit in the UI.
 */
export async function getCloudSaveCount(): Promise<number> {
  const { count, error } = await supabase
    .from('cloud_projects')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  return count ?? 0;
}

/**
 * Deletes a cloud project by ID.
 */
export async function deleteProjectFromCloud(id: string): Promise<void> {
  const { error } = await supabase
    .from('cloud_projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
