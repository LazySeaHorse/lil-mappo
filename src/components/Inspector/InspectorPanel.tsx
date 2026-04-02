import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { TimelineItem, RouteItem, BoundaryItem, CalloutItem, CameraItem, EasingName } from '@/store/types';
import { searchBoundary } from '@/services/nominatim';
import { toast } from 'sonner';
import React, { useState } from 'react';
import { Trash2, Search, Crosshair, Check } from 'lucide-react';

export default function InspectorPanel() {
  const { selectedItemId, selectedKeyframeId, items } = useProjectStore();

  if (!selectedItemId) return <ProjectSettings />;

  const item = items[selectedItemId];
  if (!item) return <ProjectSettings />;

  switch (item.kind) {
    case 'route': return <RouteInspector item={item} />;
    case 'boundary': return <BoundaryInspector item={item} />;
    case 'callout': return <CalloutInspector item={item} />;
    case 'camera': return <CameraKFInspector item={item} />;
    default: return <ProjectSettings />;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4 first:mt-0">{children}</h3>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function InputText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-8 px-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function InputNumber({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-full h-8 px-2 text-sm border border-border rounded bg-background font-mono-time focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function InputColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 h-8 px-2 text-xs border border-border rounded bg-background font-mono-time" />
    </div>
  );
}

function SliderField({ value, onChange, min, max, step = 0.1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <Field label={`${label}: ${value}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </Field>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 mb-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary" />
      <span className="text-xs">{label}</span>
    </label>
  );
}

function EasingSelect({ value, onChange }: { value: EasingName; onChange: (v: EasingName) => void }) {
  const options: EasingName[] = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'easeInOutSine'];
  return (
    <Field label="Easing">
      <select value={value} onChange={(e) => onChange(e.target.value as EasingName)} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-4 w-full h-8 flex items-center justify-center gap-1.5 text-xs text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors">
      <Trash2 size={14} /> Delete
    </button>
  );
}

// Project settings
function ProjectSettings() {
  const { name, duration, fps, resolution, terrainExaggeration, setProjectName, setDuration, setFps, setResolution, setTerrainExaggeration } = useProjectStore();
  return (
    <PanelWrapper title="Project">
      <Field label="Name"><InputText value={name} onChange={setProjectName} /></Field>
      <Field label="Duration (s)"><InputNumber value={duration} onChange={setDuration} min={1} max={600} /></Field>
      <Field label="FPS">
        <select value={fps} onChange={(e) => setFps(Number(e.target.value) as 30 | 60)} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
          <option value={30}>30</option>
          <option value={60}>60</option>
        </select>
      </Field>
      <Field label="Resolution">
        <select value={resolution.join('x')} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); setResolution([w, h]); }} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
          <option value="1920x1080">1920 × 1080</option>
          <option value="2560x1440">2560 × 1440</option>
          <option value="3840x2160">3840 × 2160</option>
        </select>
      </Field>
      <SliderField label="Terrain Exaggeration" value={terrainExaggeration} onChange={setTerrainExaggeration} min={1} max={3} step={0.1} />
    </PanelWrapper>
  );
}

function RouteInspector({ item }: { item: RouteItem }) {
  const { updateItem, removeItem, selectItem } = useProjectStore();
  const u = (updates: Partial<RouteItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<RouteItem['style']>) => u({ style: { ...item.style, ...updates } });

  return (
    <PanelWrapper title={`Route: ${item.name}`}>
      <Field label="Name"><InputText value={item.name} onChange={(v) => u({ name: v })} /></Field>
      <SectionTitle>Timing</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
        <Field label="End (s)"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
      </div>
      <EasingSelect value={item.easing} onChange={(v) => u({ easing: v })} />
      <SectionTitle>Style</SectionTitle>
      <Field label="Color"><InputColor value={item.style.color} onChange={(v) => us({ color: v })} /></Field>
      <SliderField label="Width" value={item.style.width} onChange={(v) => us({ width: v })} min={1} max={12} step={1} />
      <Toggle checked={item.style.glow} onChange={(v) => us({ glow: v })} label="Glow" />
      {item.style.glow && <Field label="Glow Color"><InputColor value={item.style.glowColor} onChange={(v) => us({ glowColor: v })} /></Field>}
      <Toggle checked={item.style.trailFade} onChange={(v) => us({ trailFade: v })} label="Trail Fade" />
      {item.style.trailFade && <SliderField label="Fade Length" value={item.style.trailFadeLength} onChange={(v) => us({ trailFadeLength: v })} min={0.05} max={1} />}
      <Field label="Dash Pattern">
        <select value={item.style.dashPattern ? 'dashed' : 'solid'} onChange={(e) => us({ dashPattern: e.target.value === 'dashed' ? [8, 4] : e.target.value === 'dotted' ? [2, 4] : null })} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </Field>
      <DeleteButton onClick={() => { removeItem(item.id); selectItem(null); }} />
    </PanelWrapper>
  );
}

function BoundaryInspector({ item }: { item: BoundaryItem }) {
  const { updateItem, removeItem, selectItem } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState(item.placeName);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const u = (updates: Partial<BoundaryItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<BoundaryItem['style']>) => u({ style: { ...item.style, ...updates } });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    u({ placeName: searchQuery, resolveStatus: 'loading' } as any);
    try {
      const res = await searchBoundary(searchQuery);
      if (res.length === 0) {
        toast.error('No boundary polygon available for this place.');
        u({ resolveStatus: 'error' } as any);
      } else {
        setResults(res);
      }
    } catch {
      toast.error('Boundary lookup failed.');
      u({ resolveStatus: 'error' } as any);
    }
    setSearching(false);
  };

  const pickResult = (r: any) => {
    u({ geojson: r.geojson, resolveStatus: 'resolved', placeName: r.display_name.split(',')[0] } as any);
    setResults([]);
    toast.success('Boundary resolved');
  };

  return (
    <PanelWrapper title={`Boundary: ${item.placeName || 'New'}`}>
      <Field label="Place Name">
        <div className="flex gap-1">
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="flex-1 h-8 px-2 text-sm border border-border rounded bg-background" placeholder="e.g. Central Park" />
          <button onClick={handleSearch} disabled={searching} className="h-8 w-8 flex items-center justify-center border border-border rounded hover:bg-secondary">
            <Search size={14} />
          </button>
        </div>
      </Field>
      {results.length > 0 && (
        <div className="border border-border rounded overflow-hidden mb-2">
          {results.map((r, i) => (
            <button key={i} onClick={() => pickResult(r)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary border-b border-border last:border-0 truncate">
              {r.display_name}
            </button>
          ))}
        </div>
      )}
      {item.resolveStatus === 'loading' && <p className="text-xs text-muted-foreground">Searching...</p>}
      {item.resolveStatus === 'resolved' && <p className="text-xs text-primary">✓ Boundary resolved</p>}
      <SectionTitle>Timing</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
        <Field label="End (s)"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
      </div>
      <EasingSelect value={item.easing} onChange={(v) => u({ easing: v })} />
      <SectionTitle>Style</SectionTitle>
      <Field label="Stroke Color"><InputColor value={item.style.strokeColor} onChange={(v) => us({ strokeColor: v })} /></Field>
      <SliderField label="Stroke Width" value={item.style.strokeWidth} onChange={(v) => us({ strokeWidth: v })} min={1} max={15} step={1} />
      <Toggle checked={item.style.glow} onChange={(v) => us({ glow: v })} label="Glow" />
      <Field label="Fill Color"><InputColor value={item.style.fillColor} onChange={(v) => us({ fillColor: v })} /></Field>
      <SliderField label="Fill Opacity" value={item.style.fillOpacity} onChange={(v) => us({ fillOpacity: v })} min={0} max={0.5} step={0.01} />
      <Toggle checked={item.style.animateStroke} onChange={(v) => us({ animateStroke: v })} label="Animate Stroke" />
      {item.style.animateStroke && (
        <>
          <Field label="Animation Style">
            <select 
              value={item.style.animationStyle || 'draw'} 
              onChange={(e) => us({ animationStyle: e.target.value as any })} 
              className="w-full h-8 px-2 text-sm border border-border rounded bg-background"
            >
              <option value="fade">Fade (Basic)</option>
              <option value="draw">Draw (Perimeter)</option>
              <option value="trace">Trace (Comet)</option>
            </select>
          </Field>
          {item.style.animationStyle === 'trace' && (
            <SliderField 
              label="Trace Length" 
              value={item.style.traceLength || 0.1} 
              onChange={(v) => us({ traceLength: v })} 
              min={0.01} 
              max={0.5} 
              step={0.01} 
            />
          )}
        </>
      )}
      <DeleteButton onClick={() => { removeItem(item.id); selectItem(null); }} />
    </PanelWrapper>
  );
}

function CalloutInspector({ item }: { item: CalloutItem }) {
  const { updateItem, removeItem, selectItem, isMoveModeActive, setMoveModeActive } = useProjectStore();
  const u = (updates: Partial<CalloutItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<CalloutItem['style']>) => u({ style: { ...item.style, ...updates } });
  const ua = (updates: Partial<CalloutItem['animation']>) => u({ animation: { ...item.animation, ...updates } });

  return (
    <PanelWrapper title={`Callout: ${item.title}`}>
      <Field label="Title"><InputText value={item.title} onChange={(v) => u({ title: v })} /></Field>
      <Field label="Subtitle"><InputText value={item.subtitle} onChange={(v) => u({ subtitle: v })} /></Field>
      <Field label="Image URL"><InputText value={item.imageUrl || ''} onChange={(v) => u({ imageUrl: v || null })} /></Field>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-muted-foreground block">Position</label>
        <button
          onClick={() => setMoveModeActive(!isMoveModeActive)}
          className={`h-7 px-3 flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-tight rounded-full transition-all ${
            isMoveModeActive 
            ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {isMoveModeActive ? <Check size={12} /> : <Crosshair size={12} />}
          {isMoveModeActive ? 'Done' : 'Move'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 opacity-80 pointer-events-none">
        <Field label="Longitude"><InputNumber value={item.lngLat[0]} onChange={(v) => u({ lngLat: [v, item.lngLat[1]] })} step={0.001} /></Field>
        <Field label="Latitude"><InputNumber value={item.lngLat[1]} onChange={(v) => u({ lngLat: [item.lngLat[0], v] })} step={0.001} /></Field>
      </div>
      <SliderField label="Altitude (m)" value={item.altitude} onChange={(v) => u({ altitude: v })} min={0} max={500} step={5} />
      <Toggle checked={item.poleVisible} onChange={(v) => u({ poleVisible: v })} label="Show Pole" />
      {item.poleVisible && <Field label="Pole Color"><InputColor value={item.poleColor} onChange={(v) => u({ poleColor: v })} /></Field>}
      <SectionTitle>Timing</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
        <Field label="End (s)"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
      </div>
      <SectionTitle>Animation</SectionTitle>
      <Field label="Enter">
        <select value={item.animation.enter} onChange={(e) => ua({ enter: e.target.value as any })} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
          <option value="fadeIn">Fade In</option><option value="scaleUp">Scale Up</option><option value="slideUp">Slide Up</option>
        </select>
      </Field>
      <Field label="Exit">
        <select value={item.animation.exit} onChange={(e) => ua({ exit: e.target.value as any })} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
          <option value="fadeOut">Fade Out</option><option value="scaleDown">Scale Down</option><option value="slideDown">Slide Down</option>
        </select>
      </Field>
      <SliderField label="Enter Duration" value={item.animation.enterDuration} onChange={(v) => ua({ enterDuration: v })} min={0.1} max={2} step={0.1} />
      <SliderField label="Exit Duration" value={item.animation.exitDuration} onChange={(v) => ua({ exitDuration: v })} min={0.1} max={2} step={0.1} />
      <SectionTitle>Style</SectionTitle>
      <Field label="BG Color"><InputColor value={item.style.bgColor} onChange={(v) => us({ bgColor: v })} /></Field>
      <Field label="Text Color"><InputColor value={item.style.textColor} onChange={(v) => us({ textColor: v })} /></Field>
      <SliderField label="Max Width" value={item.style.maxWidth} onChange={(v) => us({ maxWidth: v })} min={150} max={400} step={10} />
      <DeleteButton onClick={() => { removeItem(item.id); selectItem(null); }} />
    </PanelWrapper>
  );
}

function CameraKFInspector({ item }: { item: CameraItem }) {
  const { selectedKeyframeId, updateCameraKeyframe, removeCameraKeyframe, selectKeyframe, items } = useProjectStore();

  const kf = item.keyframes.find((k) => k.id === selectedKeyframeId);
  if (!kf) {
    return (
      <PanelWrapper title="Camera Track">
        <p className="text-xs text-muted-foreground">Select a keyframe on the timeline to edit it.</p>
        <p className="text-xs text-muted-foreground mt-2">{item.keyframes.length} keyframe{item.keyframes.length !== 1 ? 's' : ''}</p>
      </PanelWrapper>
    );
  }

  const u = (updates: Partial<typeof kf>) => updateCameraKeyframe(kf.id, updates);

  // Get available routes for follow route dropdown
  const routes = Object.values(items).filter((i) => i.kind === 'route') as RouteItem[];

  return (
    <PanelWrapper title={`Camera KF @ ${kf.time.toFixed(1)}s`}>
      <Field label="Time (s)"><InputNumber value={kf.time} onChange={(v) => u({ time: v })} min={0} step={0.1} /></Field>
      <SectionTitle>Camera</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Longitude"><InputNumber value={kf.camera.center[0]} onChange={(v) => u({ camera: { ...kf.camera, center: [v, kf.camera.center[1]] } })} step={0.001} /></Field>
        <Field label="Latitude"><InputNumber value={kf.camera.center[1]} onChange={(v) => u({ camera: { ...kf.camera, center: [kf.camera.center[0], v] } })} step={0.001} /></Field>
      </div>
      <SliderField label="Zoom" value={kf.camera.zoom} onChange={(v) => u({ camera: { ...kf.camera, zoom: v } })} min={0} max={22} step={0.1} />
      <SliderField label="Pitch" value={kf.camera.pitch} onChange={(v) => u({ camera: { ...kf.camera, pitch: v } })} min={0} max={85} step={1} />
      <SliderField label="Bearing" value={kf.camera.bearing} onChange={(v) => u({ camera: { ...kf.camera, bearing: v } })} min={0} max={360} step={1} />
      <EasingSelect value={kf.easing} onChange={(v) => u({ easing: v })} />
      {routes.length > 0 && (
        <Field label="Follow Route">
          <select value={kf.followRoute || ''} onChange={(e) => u({ followRoute: e.target.value || null })} className="w-full h-8 px-2 text-sm border border-border rounded bg-background">
            <option value="">None</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      )}
      <DeleteButton onClick={() => { removeCameraKeyframe(kf.id); selectKeyframe(null); }} />
    </PanelWrapper>
  );
}

function PanelWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-80 bg-panel-bg border-l border-border h-full overflow-y-auto">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-3">
        {children}
      </div>
    </div>
  );
}
