import { supabase } from '@/lib/supabase';
import type { Project } from '@/store/types';

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
  const { error } = await supabase
    .from('cloud_projects')
    .upsert(
      {
        id: project.id,
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
 * Deletes a cloud project by ID.
 */
export async function deleteProjectFromCloud(id: string): Promise<void> {
  const { error } = await supabase
    .from('cloud_projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
