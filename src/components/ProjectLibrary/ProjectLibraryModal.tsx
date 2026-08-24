import React, { useState, useEffect, useCallback } from 'react';
import {
  Library, Trash2, Clock, Cloud, CloudUpload, RefreshCw, CloudOff, Lock, FolderArchive,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { loadProjectFromLibrary } from '@/services/projectLibrary';
import { CloudProjectLimitError } from '@/services/cloudProjectLibrary';
import {
  projectLibraryCoordinator,
  type LibraryProject,
  type CloudWriteResult,
} from '@/services/projectLibraryCoordinator';
import { syncProjects } from '@/services/cloudSync';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { canCloudSave, isFreeUser, FREE_CLOUD_SAVE_LIMIT } from '@/lib/cloudAccess';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { IconButton } from '@/components/ui/icon-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ProjectLibraryModalProps {
  open: boolean;
  onClose: () => void;
}

type DisplayProject = LibraryProject;

export default function ProjectLibraryModal({ open, onClose }: ProjectLibraryModalProps) {
  const [projects, setProjects] = useState<DisplayProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  // When free user hits the 3-save limit and tries to upload, show this picker
  const [pendingUploadProject, setPendingUploadProject] = useState<DisplayProject | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<DisplayProject | null>(null);

  const user = useAuthStore((s) => s.user);
  const setShowNewProjectModal = useProjectStore((s) => s.setShowNewProjectModal);
  const { data: subscription } = useSubscription();

  // Presence comes from the cloud listing, not potentially stale local metadata.
  const cloudSaveCount = projects.filter((p) => p.cloud !== null).length;
  const cloudEnabled = canCloudSave(subscription, cloudSaveCount);
  // Wanderer gets auto-sync; free users manage uploads manually
  const autoSyncEnabled = !isFreeUser(subscription);

  const refreshList = useCallback(async () => {
    setIsLoading(true);
    try {
      setProjects(await projectLibraryCoordinator.listProjects(!!user));
    } catch {
      toast.error('Failed to load project library');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      refreshList();
    }
  }, [open, refreshList]);

  const handleRefresh = async () => {
    if (!user) {
      await refreshList();
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncProjects(autoSyncEnabled);
      if (result.offline) {
        toast.error("Cannot sync. You are offline.");
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
    if (isMutating) return;
    if (!cloudEnabled) {
      setPendingUploadProject(project);
      return;
    }

    setIsMutating(true);
    try {
      const result = await projectLibraryCoordinator.uploadLocalProject(
        project.id,
        project.local?.updatedAt
      );
      if (result.status === 'cloud-failed' && result.error instanceof CloudProjectLimitError) {
        setPendingUploadProject(project);
        toast.info('Cloud project limit reached. Remove a cloud copy to continue.');
      } else {
        showUploadResult(result);
      }
      await refreshList();
    } finally {
      setIsMutating(false);
    }
  };

  /** After user deletes a cloud project to free a slot, retry the upload. */
  const handleDeleteAndRetryUpload = async (cloudProjectToDelete: DisplayProject) => {
    const uploadProject = pendingUploadProject;
    if (!uploadProject || isMutating) return;
    setIsMutating(true);
    try {
      const result = await projectLibraryCoordinator.replaceCloudProject(
        cloudProjectToDelete.id,
        uploadProject.id
      );

      if (result.removal.status === 'cloud-failed') {
        toast.error('Could not free the cloud slot. The local project was preserved.');
      } else if (result.upload) {
        if (result.upload.status === 'uploaded' || result.upload.status === 'metadata-repair-needed') {
          setPendingUploadProject(null);
        }
        showUploadResult(result.upload, `Removed "${cloudProjectToDelete.name}" from cloud and uploaded`);
      }

      await refreshList();
    } finally {
      setIsMutating(false);
    }
  };

  const handleLoad = async (project: DisplayProject) => {
    try {
      if (!project.local && project.cloud) {
        const full = await projectLibraryCoordinator.downloadCloudProject(project.cloud);
        useProjectStore.getState().loadFullProject(full);
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

  const handleDelete = (project: DisplayProject) => {
    setProjectToDelete(project);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete || isMutating) return;
    const project = projectToDelete;
    const label = project.local ? 'project' : 'cloud project';
    setProjectToDelete(null);

    setIsMutating(true);
    try {
      const result = await projectLibraryCoordinator.deleteProjectEverywhere(
        project.id,
        project.cloud !== null
      );
      if (result.status === 'deleted') {
        toast.success(`Deleted ${label}: ${project.name}`);
      } else if (result.status === 'pending-retry') {
        toast.error('Deletion is pending and will retry. The project will not be synced.');
      } else {
        toast.error('Failed to record project deletion');
      }
      await refreshList();
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[540px] rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-medium tracking-tight flex items-center gap-2">
              <Library className="text-primary h-6 w-6" /> Projects
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Open, delete, and upload projects.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <span className="text-sm">Loading projects</span>
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderArchive}
              title="No projects"
              description="Save the current project or create a new project."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setShowNewProjectModal(true);
                    onClose();
                  }}
                >
                  Create project
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  showUpload={!!user && !autoSyncEnabled && p.local !== null && p.cloud === null}
                  uploadDisabledReason={!cloudEnabled ? `Cloud project limit reached (${cloudSaveCount}/${FREE_CLOUD_SAVE_LIMIT})` : undefined}
                  disabled={isMutating}
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
          <div className="flex items-center gap-2">
            <IconButton
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isSyncing || isLoading}
              title="Sync and refresh"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            </IconButton>
            {user && !autoSyncEnabled ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Cloud size={12} className={cloudSaveCount >= FREE_CLOUD_SAVE_LIMIT ? 'text-amber-400' : 'text-primary/70'} />
                <span>
                  {cloudSaveCount}/{FREE_CLOUD_SAVE_LIMIT} cloud projects used
                </span>
                {cloudSaveCount >= FREE_CLOUD_SAVE_LIMIT && (
                  <Lock size={10} className="text-amber-400" />
                )}
              </div>
            ) : !user ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CloudOff size={12} />
                Sign in to use cloud projects
              </div>
            ) : null}
          </div>
          <Button
            onClick={onClose}
            variant="outline"
            className="h-10 px-6 rounded-lg text-sm font-medium transition-all"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>

      {/* Delete-to-free-slot dialog */}
      {pendingUploadProject && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-[420px] overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium">Cloud project limit reached</h3>
              <p className="text-xs text-muted-foreground mt-1">
                You used all {FREE_CLOUD_SAVE_LIMIT} cloud project slots. Remove one cloud
                copy, then upload this project. Its local copy will be kept.
              </p>
            </div>
            <div className="px-5 py-4 max-h-64 overflow-y-auto flex flex-col gap-2">
              {projects
                .filter((p) => p.cloud !== null)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border border-border rounded-xl hover:border-destructive/40 hover:bg-destructive/5 transition-all"
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
                      disabled={isMutating}
                    >
                      Remove and upload
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent className="max-w-[420px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">"{projectToDelete?.name || 'Untitled project'}"</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isMutating}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  showUpload,
  uploadDisabledReason,
  disabled,
  onLoad,
  onDelete,
  onUpload,
}: {
  project: DisplayProject;
  showUpload?: boolean;
  uploadDisabledReason?: string;
  disabled?: boolean;
  onLoad: () => void;
  onDelete: () => void;
  onUpload?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-xl hover:border-primary/30 hover:bg-secondary/30 transition-all group">
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
            disabled={disabled}
            title={uploadDisabledReason ?? 'Upload to cloud'}
            className={uploadDisabledReason ? 'text-muted-foreground/40' : 'text-primary/70 hover:text-primary'}
          >
            <CloudUpload size={14} />
          </IconButton>
        )}
        <Button
          onClick={onLoad}
          disabled={disabled}
          size="sm"
          className="h-8 px-3 text-xs font-medium transition-all"
        >
          Load
        </Button>
        <IconButton variant="destructive" size="sm" onClick={onDelete} disabled={disabled} title="Delete project">
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function CloudStatusBadge({ project }: { project: DisplayProject }) {
  if (!project.local && project.cloud) {
    return (
      <span title="Cloud project (not saved locally yet)">
        <Cloud size={12} className="text-primary shrink-0" />
      </span>
    );
  }

  if (project.syncState === 'pending-upload') {
    return (
      <span title="Changes pending cloud sync">
        <CloudUpload size={12} className="text-amber-400 shrink-0" />
      </span>
    );
  }

  if (project.cloud) {
    return (
      <span title="Backed up to cloud">
        <Cloud size={12} className="text-primary/60 shrink-0" />
      </span>
    );
  }

  return null;
}

function showUploadResult(result: CloudWriteResult, successMessage = 'Uploaded to cloud') {
  switch (result.status) {
    case 'uploaded':
      toast.success(successMessage);
      break;
    case 'metadata-repair-needed':
      toast.success(`${successMessage} — sync status will be repaired`);
      break;
    case 'cloud-failed':
      toast.error('Cloud upload failed. The local project is preserved and pending sync.');
      break;
    case 'local-failed':
      toast.error('Cannot upload because the local project could not be read.');
      break;
  }
}
