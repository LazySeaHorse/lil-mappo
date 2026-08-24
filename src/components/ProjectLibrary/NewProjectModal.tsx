import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useProjectStore } from '@/store/useProjectStore';
import { AspectRatio, ExportResolution } from '@/types/render';
import { nanoid } from 'nanoid';
import { Plus, Smartphone, Monitor, Sparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function NewProjectModal() {
  const showNewProjectModal = useProjectStore((s) => s.showNewProjectModal);
  const setShowNewProjectModal = useProjectStore((s) => s.setShowNewProjectModal);
  const loadFullProject = useProjectStore((s) => s.loadFullProject);
  
  const [projectName, setProjectName] = useState("Untitled Project");
  const [fps, setFps] = useState<30 | 60>(30);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("1080p");
  const [isVertical, setIsVertical] = useState(false);

  const close = () => setShowNewProjectModal(false);

  const handleCreate = () => {
    const newId = nanoid();
    
    const projectPartial: any = {
      id: newId,
      name: projectName.trim() || 'Untitled Project',
      fps,
      aspectRatio,
      exportResolution,
      isVertical,
    };

    if (isVertical) {
      projectPartial.resolution = [1080, 1920];
    }

    loadFullProject(projectPartial);
    toast.success('New project created');
    close();
  };

  return (
    <Dialog open={showNewProjectModal} onOpenChange={setShowNewProjectModal}>
      <DialogContent className="sm:max-w-[760px] rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent border-b border-border/40 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-2xl font-medium tracking-tight flex items-center gap-2">
              <Plus className="text-primary h-6 w-6" /> New project
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Set the project name, video format, and frame rate.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Two column body */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          
          {/* Left Column: Settings */}
          <div className="w-full sm:w-[320px] bg-secondary/10 p-6 flex flex-col overflow-y-auto border-r border-border/40">
            <h3 className="text-xs font-medium text-foreground/80 mb-3">
              Project settings
            </h3>
            
            <div className="space-y-4 flex-1">
              <div className="space-y-1.5">
                <Label htmlFor="projectName" className="text-xs font-medium">Name</Label>
                <Input 
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="h-9 text-sm rounded-lg border-border/50 bg-background"
                  placeholder="Untitled project"
                  autoFocus
                />
              </div>

              <Field label="Orientation">
                <SegmentedControl
                  options={[
                    { value: 'landscape', label: 'Landscape', icon: <Monitor size={14} /> },
                    { value: 'portrait', label: 'Portrait', icon: <Smartphone size={14} /> },
                  ]}
                  value={isVertical ? 'portrait' : 'landscape'}
                  onValueChange={(v) => setIsVertical(v === 'portrait')}
                  className="h-9 w-full"
                />
              </Field>

              <Field label="Aspect ratio">
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 (Standard)</SelectItem>
                    <SelectItem value="21:9">21:9 (Ultrawide)</SelectItem>
                    <SelectItem value="4:3">4:3 (Classic)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Resolution">
                <Select value={exportResolution} onValueChange={(v) => setExportResolution(v as ExportResolution)}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p">480p SD</SelectItem>
                    <SelectItem value="720p">720p HD</SelectItem>
                    <SelectItem value="1080p">1080p FHD</SelectItem>
                    <SelectItem value="1440p">1440p QHD</SelectItem>
                    <SelectItem value="2160p">4K UHD</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Frame rate (FPS)">
                <Select value={fps.toString()} onValueChange={(v) => setFps(Number(v) as 30 | 60)}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 FPS</SelectItem>
                    <SelectItem value="60">60 FPS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Button 
              onClick={() => handleCreate()} 
              className="mt-6 w-full h-11 rounded-lg text-sm font-medium shadow-lg shadow-primary/20 transition-all"
            >
              Create project
            </Button>
          </div>

          {/* Right Column: Templates / Examples */}
          <div className="flex-1 p-6 flex flex-col overflow-y-auto">
            <h3 className="text-xs font-medium text-foreground/80 mb-3">
              Examples
            </h3>
            
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border/50 rounded-xl p-8 text-center bg-secondary/5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Sparkles size={20} />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Example projects are not available yet.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
