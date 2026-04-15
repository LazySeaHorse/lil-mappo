import { supabase } from '@/lib/supabase';
import type { Project } from '@/store/types';
import { useAuthStore } from '@/store/useAuthStore';

export interface CloudProjectInfo {
  id: string;
  name: string;
  /** Unix milliseconds — converted from Supabase timestamptz */
  updatedAt: number;
}

/**
 * Upserts a project to Supabase cloud_projects.
 * Inserts on first save; updates on subsequent saves.
 * RLS ensures the user can only write their own rows.
 */
export async function saveProjectToCloud(project: Project): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('cloud_projects')
    .upsert(
      {
        id: project.id,
        user_id: userId,
        name: project.name,
        data: project as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) throw error;
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
  return data.data as unknown as Project;
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
