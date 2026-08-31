import React from 'react';
import { Clock, CloudUpload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import type { LibraryProject } from '@/services/projectLibraryCoordinator';
import { CloudStatusBadge } from './CloudStatusBadge';

interface ProjectRowProps {
  project: LibraryProject;
  showUpload?: boolean;
  uploadDisabledReason?: string;
  disabled?: boolean;
  onLoad: () => void;
  onDelete: () => void;
  onUpload?: () => void;
}

export function ProjectRow({
  project,
  showUpload,
  uploadDisabledReason,
  disabled,
  onLoad,
  onDelete,
  onUpload,
}: ProjectRowProps) {
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
