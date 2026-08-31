import React from 'react';
import { Cloud, CloudUpload } from 'lucide-react';
import type { LibraryProject } from '@/services/projectLibraryCoordinator';

interface CloudStatusBadgeProps {
  project: LibraryProject;
}

export function CloudStatusBadge({ project }: CloudStatusBadgeProps) {
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
