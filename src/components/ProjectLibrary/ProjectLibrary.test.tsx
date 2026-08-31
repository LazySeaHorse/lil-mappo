import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { CloudStatusBadge } from './components/CloudStatusBadge';
import { ProjectRow } from './components/ProjectRow';
import { CloudSlotQuotaDialog } from './components/CloudSlotQuotaDialog';
import { DeleteProjectDialog } from './components/DeleteProjectDialog';
import { showUploadResult } from './useProjectLibrary';
import { toast } from 'sonner';
import type { LibraryProject } from '@/services/projectLibraryCoordinator';

describe('ProjectLibrary Sub-components', () => {
  const baseProject: LibraryProject = {
    id: 'proj-1',
    name: 'My Road Trip',
    updatedAt: 1700000000000,
    local: {
      id: 'proj-1',
      name: 'My Road Trip',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
    cloud: null,
    syncState: 'in-sync',
  };

  it('renders CloudStatusBadge correctly for different sync states', () => {
    // Local only
    const { container: localContainer } = render(<CloudStatusBadge project={baseProject} />);
    expect(localContainer.firstChild).toBeNull();

    // Cloud backup
    const cloudProject: LibraryProject = {
      ...baseProject,
      cloud: {
        id: 'proj-1',
        user_id: 'user-1',
        name: 'My Road Trip',
        created_at: '2026-08-31',
        updated_at: '2026-08-31',
        document: {} as any,
      },
    };
    const { container: cloudContainer } = render(<CloudStatusBadge project={cloudProject} />);
    expect(cloudContainer.querySelector('svg')).toBeDefined();

    // Pending upload
    const pendingProject: LibraryProject = {
      ...baseProject,
      syncState: 'pending-upload',
    };
    const { container: pendingContainer } = render(<CloudStatusBadge project={pendingProject} />);
    expect(pendingContainer.querySelector('svg')).toBeDefined();
  });

  it('calls onLoad, onDelete, and onUpload when ProjectRow buttons are clicked', () => {
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    const onUpload = vi.fn();

    render(
      <ProjectRow
        project={baseProject}
        showUpload={true}
        onLoad={onLoad}
        onDelete={onDelete}
        onUpload={onUpload}
      />
    );

    expect(screen.getByText('My Road Trip')).toBeDefined();

    fireEvent.click(screen.getByText('Load'));
    expect(onLoad).toHaveBeenCalledTimes(1);

    const deleteBtn = screen.getByTitle('Delete project');
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);

    const uploadBtn = screen.getByTitle('Upload to cloud');
    fireEvent.click(uploadBtn);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('renders CloudSlotQuotaDialog and responds to remove and upload action', () => {
    const onCancel = vi.fn();
    const onReplaceAndUpload = vi.fn();
    const cloudProject: LibraryProject = {
      ...baseProject,
      id: 'cloud-proj',
      name: 'Existing Cloud Map',
      cloud: {
        id: 'cloud-proj',
        user_id: 'user-1',
        name: 'Existing Cloud Map',
        created_at: '2026-08-31',
        updated_at: '2026-08-31',
        document: {} as any,
      },
    };

    render(
      <CloudSlotQuotaDialog
        pendingProject={baseProject}
        projects={[cloudProject]}
        onCancel={onCancel}
        onReplaceAndUpload={onReplaceAndUpload}
      />
    );

    expect(screen.getByText('Cloud project limit reached')).toBeDefined();
    expect(screen.getByText('Existing Cloud Map')).toBeDefined();

    const replaceBtn = screen.getByText('Remove and upload');
    fireEvent.click(replaceBtn);
    expect(onReplaceAndUpload).toHaveBeenCalledWith(cloudProject);

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handles confirmation in DeleteProjectDialog', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteProjectDialog
        project={baseProject}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('Delete project')).toBeDefined();
    expect(screen.getByText(/My Road Trip/)).toBeDefined();

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('handles cancellation in DeleteProjectDialog', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteProjectDialog
        project={baseProject}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows appropriate toast for showUploadResult outcomes', () => {
    showUploadResult({ status: 'uploaded', project: {} as any });
    expect(toast.success).toHaveBeenCalledWith('Uploaded to cloud');

    showUploadResult({ status: 'cloud-failed', error: new Error('Network error') });
    expect(toast.error).toHaveBeenCalledWith('Cloud upload failed. The local project is preserved and pending sync.');

    showUploadResult({ status: 'local-failed', error: new Error('Read error') });
    expect(toast.error).toHaveBeenCalledWith('Cannot upload because the local project could not be read.');
  });
});
