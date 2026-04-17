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
import { Plus, MonitorPlay, Smartphone, Square, Monitor, Map, Navigation, Plane, Car, Route } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Preset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  svg: React.ReactNode;
  heightClass: string;
}

// These are sample real-world projects that will be bundled later.
const SAMPLE_PROJECTS: Preset[] = [
  {
    id: 'sample-marathon',
    name: 'NYC Marathon',
    description: 'City route with street tracking',
    icon: <Route size={14} />,
    heightClass: 'aspect-[3/4]', 
    svg: (
      <svg viewBox="0 0 100 133" className="w-full h-full text-foreground/20 fill-current" preserveAspectRatio="xMidYMid meet">
        <rect x="10" y="10" width="80" height="113" rx="8" />
        <path d="M25 100 Q 40 60 75 30" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 4" className="text-background" />
        <circle cx="25" cy="100" r="4" className="text-background fill-current" />
        <circle cx="75" cy="30" r="4" className="text-background fill-current" />
      </svg>
    ),
  },
  {
    id: 'sample-flight',
    name: 'Paris to Rome',
    description: '3D flight arc animation',
    icon: <Plane size={14} />,
    heightClass: 'aspect-video',
    svg: (
      <svg viewBox="0 0 160 90" className="w-full h-full text-foreground/20 fill-current" preserveAspectRatio="xMidYMid meet">
        <rect x="15" y="15" width="130" height="60" rx="8" />
        <path d="M35 60 Q 80 10 125 60" fill="none" stroke="currentColor" strokeWidth="2" className="text-background" />
      </svg>
    ),
  },
  {
    id: 'sample-drive',
    name: 'Alpine Drive',
    description: 'Mountain terrain follow-camera',
    icon: <Car size={14} />,
    heightClass: 'aspect-square',
    svg: (
      <svg viewBox="0 0 100 100" className="w-full h-full text-foreground/20 fill-current" preserveAspectRatio="xMidYMid meet">
        <rect x="15" y="15" width="70" height="70" rx="6" />
        <path d="M20 70 L 40 40 L 60 55 L 80 25" fill="none" stroke="currentColor" strokeWidth="2" className="text-background" />
      </svg>
    ),
  },
  {
    id: 'sample-logistics',
    name: 'Global Supply',
    description: 'Multi-point data visualization',
    icon: <Navigation size={14} />,
    heightClass: 'aspect-[21/9]',
    svg: (
      <svg viewBox="0 0 210 90" className="w-full h-full text-foreground/20 fill-current" preserveAspectRatio="xMidYMid meet">
        <rect x="10" y="15" width="190" height="60" rx="4" />
        <circle cx="50" cy="45" r="3" className="text-background fill-current" />
        <circle cx="105" cy="30" r="3" className="text-background fill-current" />
        <circle cx="160" cy="55" r="3" className="text-background fill-current" />
        <path d="M50 45 L 105 30 L 160 55" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" className="text-background" />
      </svg>
    ),
  },
  {
    id: 'sample-tour',
    name: 'Tokyo Highlights',
    description: 'Callout cards & street level',
    icon: <Map size={14} />,
    heightClass: 'aspect-video',
    svg: (
      <svg viewBox="0 0 160 90" className="w-full h-full text-foreground/20 fill-current" preserveAspectRatio="xMidYMid meet">
        <rect x="15" y="15" width="130" height="60" rx="8" />
        <rect x="35" y="30" width="30" height="15" rx="2" className="text-background fill-current" />
        <rect x="95" y="50" width="30" height="15" rx="2" className="text-background fill-current" />
      </svg>
    ),
  },
];

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

  const handleCreate = (sample?: Preset) => {
    const newId = nanoid();
    
    // For sample projects, we will eventually load their bundled JSON.
    // For now, we just create a blank project with their name.
    const projectPartial: any = {
      id: newId,
      name: sample ? sample.name : (projectName.trim() || 'Untitled Project'),
    };

    // If blank project, apply the left-pane settings.
    if (!sample) {
      projectPartial.fps = fps;
      projectPartial.aspectRatio = aspectRatio;
      projectPartial.exportResolution = exportResolution;
      projectPartial.isVertical = isVertical;
      
      // Calculate resolution based on export preset
      // (Simplified logic inline, getExportDimensions handles this properly in the app)
      if (isVertical) {
        projectPartial.resolution = [1080, 1920]; 
      }
    } else {
      // Future: load the sample's JSON here
    }

    loadFullProject(projectPartial);
    toast.success(sample ? `Loaded sample: ${sample.name}` : `New project created`);
    close();
  };

  return (
    <Dialog open={showNewProjectModal} onOpenChange={setShowNewProjectModal}>
      <DialogContent className="sm:max-w-[760px] rounded-3xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent border-b border-border/40 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Plus className="text-primary h-6 w-6" /> Create Viewport
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Configure a new canvas or explore what the engine can do.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Two column body */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          
          {/* Left Column: Settings */}
          <div className="w-full sm:w-[300px] bg-secondary/10 p-6 flex flex-col overflow-y-auto border-r border-border/40">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Project Settings
            </h3>
            
            <div className="space-y-4 flex-1">
              <div className="space-y-1.5">
                <Label htmlFor="projectName" className="text-xs font-semibold">Name</Label>
                <Input 
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="h-9 text-sm rounded-lg border-border/50 bg-background"
                  placeholder="My awesome map"
                  autoFocus
                />
              </div>

              <Field label="Orientation">
                <SegmentedControl
                  options={[
                    { value: 'landscape', label: <div className="flex items-center gap-2"><Monitor size={14}/> Landscape</div> },
                    { value: 'portrait', label: <div className="flex items-center gap-2"><Smartphone size={14}/> Portrait</div> },
                  ]}
                  value={isVertical ? 'portrait' : 'landscape'}
                  onValueChange={(v) => setIsVertical(v === 'portrait')}
                  className="h-9 w-full"
                />
              </Field>

              <Field label="Aspect Ratio">
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

              <Field label="Frame Rate (FPS)">
                <Select value={fps.toString()} onValueChange={(v) => setFps(Number(v) as 30 | 60)}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 FPS (Cinematic)</SelectItem>
                    <SelectItem value="60">60 FPS (Smooth)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Button 
              onClick={() => handleCreate()} 
              className="mt-6 w-full h-11 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
            >
              Start Blank Project
            </Button>
          </div>

          {/* Right Column: Templates / Examples */}
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Explore Examples
            </h3>
            
            <div className="columns-1 md:columns-2 gap-4 space-y-4">
              
              {/* Presets */}
              {SAMPLE_PROJECTS.map(sample => (
                <button
                  key={sample.id}
                  onClick={() => handleCreate(sample)}
                  className="w-full break-inside-avoid text-left relative group overflow-hidden rounded-xl border border-border/40 bg-secondary/10 hover:bg-secondary/30 transition-all hover:scale-[1.02] active:scale-[0.98] outline-primary"
                >
                  <div className={`${sample.heightClass} bg-background/50 m-2 rounded-lg flex items-center justify-center overflow-hidden border border-border/20`}>
                    <div className="w-2/3 h-2/3 flex items-center justify-center transition-transform group-hover:scale-110 opacity-70 group-hover:opacity-100">
                      {sample.svg}
                    </div>
                  </div>
                  <div className="px-3 pb-3 pt-1 flex flex-col">
                    <div className="flex items-center gap-1.5 mb-0.5 text-primary">
                      {sample.icon}
                      <h4 className="font-semibold text-sm text-foreground">{sample.name}</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium leading-snug">
                      {sample.description}
                    </p>
                  </div>
                </button>
              ))}
              
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
