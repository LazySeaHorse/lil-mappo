import React from 'react';
import {
  Library, Cloud, RefreshCw, CloudOff, Lock, FolderArchive,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useProjectStore } from '@/store/useProjectStore';
import { FREE_CLOUD_SAVE_LIMIT } from '@/lib/cloudAccess';
import { Button } from "@/components/ui/button";
import { IconButton } from '@/components/ui/icon-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useProjectLibrary } from './useProjectLibrary';
import { ProjectRow } from './components/ProjectRow';
import { CloudSlotQuotaDialog } from './components/CloudSlotQuotaDialog';
import { DeleteProjectDialog } from './components/DeleteProjectDialog';

interface ProjectLibraryModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ProjectLibraryModal({ open, onClose }: ProjectLibraryModalProps) {
  const setShowNewProjectModal = useProjectStore((s) => s.setShowNewProjectModal);

  const {
    projects,
    isLoading,
    isSyncing,
    isMutating,
    cloudSaveCount,
    cloudEnabled,
    autoSyncEnabled,
    user,
    pendingUploadProject,
    setPendingUploadProject,
    projectToDelete,
    setProjectToDelete,
    handleRefresh,
    handleUploadToCloud,
    handleDeleteAndRetryUpload,
    handleLoad,
    handleDelete,
    handleConfirmDelete,
  } = useProjectLibrary(open, onClose);

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
      <CloudSlotQuotaDialog
        pendingProject={pendingUploadProject}
        projects={projects}
        isMutating={isMutating}
        onCancel={() => setPendingUploadProject(null)}
        onReplaceAndUpload={handleDeleteAndRetryUpload}
      />

      {/* Delete confirmation dialog */}
      <DeleteProjectDialog
        project={projectToDelete}
        isMutating={isMutating}
        onCancel={() => setProjectToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
