import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Library, Trash2, Clock, Cloud, CloudUpload, RefreshCw, CloudOff, Lock,
} from 'lucide-react';
import {
  SavedProjectInfo,
  listSavedProjects,
  loadProjectFromLibrary,
  deleteProjectFromLibrary,
  saveProjectToLibrary,
  updateCloudSyncMeta,
} from '@/services/projectLibrary';
import {
  CloudProjectInfo,
  listCloudProjects,
  loadProjectFromCloud,
  deleteProjectFromCloud,
  saveProjectToCloud,
} from '@/services/cloudProjectLibrary';
import { syncProjects } from '@/services/cloudSync';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { canCloudSave, isFreeUser, FREE_CLOUD_SAVE_LIMIT } from '@/lib/cloudAccess';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { IconButton } from '@/components/ui/icon-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ProjectLibraryModalProps {
  onClose: () => void;
}

/** A unified view entry covering both local and cloud-only projects. */
interface DisplayProject {
  id: string;
  name: string;
  updatedAt: number;
  /** Where to load the full data from. */
  source: 'local' | 'cloud-only';
  /** True if the project has ever been pushed to cloud. */
  isCloudBacked: boolean;
  /** True if local changes haven't been pushed to cloud yet. */
  pendingSync: boolean;
}

function mergeProjects(
  local: SavedProjectInfo[],
  cloud: CloudProjectInfo[]
): DisplayProject[] {
  const localById = new Map(local.map((p) => [p.id, p]));
  const result: DisplayProject[] = local.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    source: 'local' as const,
    isCloudBacked: p.cloudSyncedAt !== null,
    pendingSync: p.pendingSync,
  }));

  // Append cloud-only entries (exist in cloud but not in local)
  for (const cp of cloud) {
    if (!localById.has(cp.id)) {
      result.push({
        id: cp.id,
        name: cp.name,
        updatedAt: cp.updatedAt,
        source: 'cloud-only' as const,
        isCloudBacked: true,
        pendingSync: false,
      });
    }
  }

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function ProjectLibraryModal({ onClose }: ProjectLibraryModalProps) {
  const [projects, setProjects] = useState<DisplayProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // When free user hits the 3-save limit and tries to upload, show this picker
  const [pendingUploadProject, setPendingUploadProject] = useState<DisplayProject | null>(null);

  const user = useAuthStore((s) => s.user);
  const { data: subscription } = useSubscription();

  // Cloud save count = projects that are cloud-backed (source cloud-only or isCloudBacked)
  const cloudSaveCount = projects.filter((p) => p.isCloudBacked || p.source === 'cloud-only').length;
  const cloudEnabled = canCloudSave(subscription, cloudSaveCount);
  // Wanderer gets auto-sync; free users manage uploads manually
  const autoSyncEnabled = !isFreeUser(subscription);

  const refreshList = useCallback(async () => {
    setIsLoading(true);
    try {
      const [localList, cloudList] = await Promise.all([
        listSavedProjects(),
        user ? listCloudProjects().catch(() => []) : Promise.resolve([]),
      ]);
      setProjects(mergeProjects(localList, cloudList));
    } catch {
      toast.error('Failed to load project library');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleRefresh = async () => {
    if (!user) {
      await refreshList();
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncProjects(autoSyncEnabled);
      if (result.offline) {
        toast.error("Couldn't sync — you're offline");
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
      await refreshList();
    }
  };

  /** Upload a local project to cloud (free users, manual). */
  const handleUploadToCloud = async (project: DisplayProject) => {
    if (!user) return;

    // At limit: open the "delete to free a slot" dialog
    if (!cloudEnabled) {
      setPendingUploadProject(project);
      return;
    }

    try {
      const full = await loadProjectFromLibrary(project.id);
      await saveProjectToCloud(full);
      const now = Date.now();
      await updateCloudSyncMeta(project.id, { cloudSyncedAt: now, pendingSync: false });
      toast.success('Uploaded to cloud');
      await refreshList();
    } catch {
      toast.error('Upload failed — check your connection');
    }
  };

  /** After user deletes a cloud project to free a slot, retry the pending upload. */
  const handleDeleteAndRetryUpload = async (cloudProjectToDelete: DisplayProject) => {
    try {
      if (cloudProjectToDelete.source === 'local') {
        await deleteProjectFromLibrary(cloudProjectToDelete.id);
        await deleteProjectFromCloud(cloudProjectToDelete.id).catch(() => {});
      } else {
        await deleteProjectFromCloud(cloudProjectToDelete.id);
      }
      toast.success(`Deleted "${cloudProjectToDelete.name}"`);
    } catch {
      toast.error('Delete failed');
      return;
    }

    // Refresh the list so cloudSaveCount updates, then upload
    await refreshList();
    setPendingUploadProject(null);

    if (!pendingUploadProject) return;
    try {
      const full = await loadProjectFromLibrary(pendingUploadProject.id);
      await saveProjectToCloud(full);
      const now = Date.now();
      await updateCloudSyncMeta(pendingUploadProject.id, { cloudSyncedAt: now, pendingSync: false });
      toast.success('Uploaded to cloud');
      await refreshList();
    } catch {
      toast.error('Upload failed — check your connection');
    }
  };

  const handleLoad = async (project: DisplayProject) => {
    try {
      if (project.source === 'cloud-only') {
        const full = await loadProjectFromCloud(project.id);

        if (cloudEnabled) {
          // Save locally with same ID, marked as synced
          await saveProjectToLibrary(full, {
            cloudSyncedAt: project.updatedAt,
            pendingSync: false,
          });
          useProjectStore.getState().loadFullProject(full);
        } else {
          // No cloud access — fork to a new local ID so the cloud copy stays frozen
          const forked = { ...full, id: nanoid() };
          await saveProjectToLibrary(forked, { cloudSyncedAt: null, pendingSync: false });
          useProjectStore.getState().loadFullProject(forked);
          toast.info('Loaded as a local copy — cloud saves unavailable');
        }
      } else {
        const full = await loadProjectFromLibrary(project.id);
        useProjectStore.getState().loadFullProject(full);
      }

      toast.success(`Loaded: ${project.name}`);
      onClose();
    } catch {
      toast.error('Failed to load this project. It might be corrupted.');
    }
  };

  const handleDelete = async (project: DisplayProject) => {
    const label = project.source === 'cloud-only' ? 'cloud project' : 'project';
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;

    try {
      if (project.source === 'local') {
        await deleteProjectFromLibrary(project.id);
        // If cloud-backed and user has access, also remove from cloud
        if (project.isCloudBacked && cloudEnabled) {
          await deleteProjectFromCloud(project.id).catch(() => {
            // Non-fatal — local is deleted; cloud will be cleaned on next sync
          });
        }
      } else {
        // cloud-only
        await deleteProjectFromCloud(project.id);
      }

      toast.success(`Deleted ${label}: ${project.name}`);
      await refreshList();
    } catch {
      toast.error('Failed to delete project');
    }
  };

  return (
    <>
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] rounded-3xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent flex justify-between items-start">
          <DialogHeader className="text-left flex-1">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Library className="text-primary h-6 w-6" /> My Projects
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Manage your local and cloud-saved projects.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center pt-1 mr-6">
            <IconButton
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isSyncing || isLoading}
              title="Sync and refresh"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            </IconButton>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <span className="text-sm">Loading library…</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground gap-4 border border-dashed border-border rounded-lg bg-secondary/10">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                className="w-16 h-16 opacity-20 grayscale brightness-125"
                alt="li'l Mappo Logo"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Your library is empty</p>
                <p className="text-xs mt-1">Save a project from the toolbar to see it here.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  showUpload={!!user && !autoSyncEnabled && p.source === 'local' && !p.isCloudBacked}
                  uploadDisabledReason={!cloudEnabled ? `Cloud save limit reached (${cloudSaveCount}/${FREE_CLOUD_SAVE_LIMIT})` : undefined}
                  onLoad={() => handleLoad(p)}
                  onDelete={() => handleDelete(p)}
                  onUpload={() => handleUploadToCloud(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-secondary/10 shrink-0">
          {user && autoSyncEnabled ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Cloud size={12} className="text-primary/70" />
              Cloud sync active
            </div>
          ) : user ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Cloud size={12} className={cloudSaveCount >= FREE_CLOUD_SAVE_LIMIT ? 'text-amber-400' : 'text-primary/70'} />
              <span>
                {cloudSaveCount}/{FREE_CLOUD_SAVE_LIMIT} cloud saves used
              </span>
              {cloudSaveCount >= FREE_CLOUD_SAVE_LIMIT && (
                <Lock size={10} className="text-amber-400" />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CloudOff size={12} />
              Sign in for cloud saves
            </div>
          )}
          <Button
            onClick={onClose}
            variant="outline"
            className="h-10 px-6 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>

      {/* Delete-to-free-slot dialog */}
      {pendingUploadProject && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-xl shadow-2xl w-[420px] overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Cloud save limit reached</h3>
              <p className="text-xs text-muted-foreground mt-1">
                You've used all {FREE_CLOUD_SAVE_LIMIT} cloud save slots. Delete an existing
                cloud save to free a slot, then retry the upload.
              </p>
            </div>
            <div className="px-5 py-4 max-h-64 overflow-y-auto flex flex-col gap-2">
              {projects
                .filter((p) => p.isCloudBacked || p.source === 'cloud-only')
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-destructive/40 hover:bg-destructive/5 transition-all"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{p.name || 'Untitled'}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-3 text-xs shrink-0 ml-3"
                      onClick={() => handleDeleteAndRetryUpload(p)}
                    >
                      Delete &amp; use slot
                    </Button>
                  </div>
                ))}
            </div>
            <div className="px-5 py-3 border-t border-border bg-secondary/20 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setPendingUploadProject(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  showUpload,
  uploadDisabledReason,
  onLoad,
  onDelete,
  onUpload,
}: {
  project: DisplayProject;
  showUpload?: boolean;
  uploadDisabledReason?: string;
  onLoad: () => void;
  onDelete: () => void;
  onUpload?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/30 hover:bg-secondary/30 transition-all group">
      <div className="flex flex-col overflow-hidden mr-4 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {project.name || 'Untitled Project'}
          </span>
          <CloudStatusBadge project={project} />
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {new Date(project.updatedAt).toLocaleString()}
        </div>
      </div>

      <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        {showUpload && onUpload && (
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onUpload}
            title={uploadDisabledReason ?? 'Upload to cloud'}
            className={uploadDisabledReason ? 'text-muted-foreground/40' : 'text-primary/70 hover:text-primary'}
          >
            <CloudUpload size={14} />
          </IconButton>
        )}
        <Button
          onClick={onLoad}
          size="sm"
          className="h-8 px-3 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Load
        </Button>
        <IconButton variant="destructive" size="sm" onClick={onDelete} title="Delete project">
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function CloudStatusBadge({ project }: { project: DisplayProject }) {
  if (project.source === 'cloud-only') {
    return (
      <span title="Cloud project (not saved locally yet)">
        <Cloud size={12} className="text-primary shrink-0" />
      </span>
    );
  }

  if (project.pendingSync) {
    return (
      <span title="Changes pending cloud sync">
        <CloudUpload size={12} className="text-amber-400 shrink-0" />
      </span>
    );
  }

  if (project.isCloudBacked) {
    return (
      <span title="Backed up to cloud">
        <Cloud size={12} className="text-primary/60 shrink-0" />
      </span>
    );
  }

  return null;
}
