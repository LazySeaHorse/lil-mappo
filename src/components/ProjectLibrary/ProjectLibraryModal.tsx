import React, { useState, useEffect } from 'react';
import { X, Library, Trash2, Clock, UploadCloud } from 'lucide-react';
import { 
  SavedProjectInfo, 
  listSavedProjects, 
  loadProjectFromLibrary, 
  deleteProjectFromLibrary 
} from '@/services/projectLibrary';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";

interface ProjectLibraryModalProps {
  onClose: () => void;
}

export default function ProjectLibraryModal({ onClose }: ProjectLibraryModalProps) {
  const [projects, setProjects] = useState<SavedProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load projects list on mount
  useEffect(() => {
    refreshList();
  }, []);

  const refreshList = async () => {
    setIsLoading(true);
    try {
      const list = await listSavedProjects();
      setProjects(list);
    } catch (e: any) {
      toast.error('Failed to load project library');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async (id: string, name: string) => {
    try {
      const fullProject = await loadProjectFromLibrary(id);
      useProjectStore.getState().loadFullProject(fullProject);
      toast.success(`Loaded project: ${name}`);
      onClose();
    } catch (e: any) {
      toast.error('Failed to load this project. It might be corrupted.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      await deleteProjectFromLibrary(id);
      toast.success(`Deleted project: ${name}`);
      await refreshList(); // Update the list
    } catch (e: any) {
      toast.error('Failed to delete project');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[500px] overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Library size={18} className="text-primary" />
            <h2 className="text-sm font-semibold">My Projects Library</h2>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:bg-secondary"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <span className="text-sm">Loading library...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground gap-4 border border-dashed border-border rounded-lg bg-secondary/10">
              <img src="/logo.svg" className="w-16 h-16 opacity-20 grayscale brightness-125" alt="li'l Mappo Logo" />
              <div>
                <p className="text-sm font-medium text-foreground">Your library is empty</p>
                <p className="text-xs mt-1">Save a project from the toolbar to see it here.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <div 
                  key={p.id} 
                  className="flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/30 hover:bg-secondary/30 transition-all group"
                >
                  <div className="flex flex-col overflow-hidden mr-4">
                    <span className="text-sm font-medium text-foreground truncate">{p.name || 'Untitled Project'}</span>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <Clock size={12} />
                      {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      onClick={() => handleLoad(p.id, p.name)}
                      size="sm"
                      className="h-8 px-3 text-xs font-medium"
                    >
                      Load
                    </Button>
                    <Button
                      onClick={() => handleDelete(p.id, p.name)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete Project"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-border bg-secondary/30 shrink-0">
          <Button
            onClick={onClose}
            variant="outline"
            className="h-9 px-4 text-sm font-medium"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
