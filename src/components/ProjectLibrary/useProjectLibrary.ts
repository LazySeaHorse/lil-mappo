import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
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
import { canCloudSave, isFreeUser } from '@/lib/cloudAccess';

export function showUploadResult(result: CloudWriteResult, successMessage = 'Uploaded to cloud') {
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

export function useProjectLibrary(open: boolean, onClose: () => void) {
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingUploadProject, setPendingUploadProject] = useState<LibraryProject | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<LibraryProject | null>(null);

  const user = useAuthStore((s) => s.user);
  const { data: subscription } = useSubscription();

  const cloudSaveCount = projects.filter((p) => p.cloud !== null).length;
  const cloudEnabled = canCloudSave(subscription, cloudSaveCount);
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
        toast.error('Cannot sync. You are offline.');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
      await refreshList();
    }
  };

  const handleUploadToCloud = async (project: LibraryProject) => {
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

  const handleDeleteAndRetryUpload = async (cloudProjectToDelete: LibraryProject) => {
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

  const handleLoad = async (project: LibraryProject) => {
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

  const handleDelete = (project: LibraryProject) => {
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

  return {
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
    refreshList,
    handleRefresh,
    handleUploadToCloud,
    handleDeleteAndRetryUpload,
    handleLoad,
    handleDelete,
    handleConfirmDelete,
  };
}
