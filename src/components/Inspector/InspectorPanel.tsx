import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { TimelineItem, RouteItem, BoundaryItem, CalloutItem, CameraItem, EasingName } from '@/store/types';
import { searchBoundary } from '@/services/nominatim';
import { toast } from 'sonner';
import React, { useState } from 'react';
import { Trash2, Search, Crosshair, Check } from 'lucide-react';
import FontPicker from 'react-fontpicker-ts';
import 'react-fontpicker-ts/dist/index.css';
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-sm"
    />
  );
}

function InputNumber({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="h-8 text-sm font-mono-time"
    />
  );
}

function InputColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer shrink-0" />
      <Input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 h-8 font-mono-time text-xs" />
    </div>
  );
}

function SliderField({ value, onChange, min, max, step = 0.1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <Field label={`${label}: ${value}`}>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} className="w-full" />
    </Field>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 mb-2 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-xs font-medium">{label}</span>
    </label>
  );
}

function EasingSelect({ value, onChange }: { value: EasingName; onChange: (v: EasingName) => void }) {
  const options: EasingName[] = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'easeInOutSine'];
  return (
    <Field label="Easing">
      <Select value={value} onValueChange={(v) => onChange(v as EasingName)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="destructive" size="sm" onClick={onClick} className="mt-4 w-full h-8 flex items-center justify-center gap-1.5 text-xs">
      <Trash2 size={14} /> Delete
    </Button>
  );
}

// Project settings
function ProjectSettings() {
  const [activeTab, setActiveTab] = useState<'general' | 'map'>('general');
  const { 
    name, duration, fps, resolution, terrainExaggeration, projection, lightPreset, mapLanguage,
    showRoadLabels, showPlaceLabels, showPointOfInterestLabels, showTransitLabels,
    show3dLandmarks, show3dTrees, show3dFacades, starIntensity, fogColor,
    setProjectName, setDuration, setFps, setResolution, setTerrainExaggeration,
    setProjection, setLightPreset, setMapLanguage, setLabelVisibility, set3dDetails, setAtmosphere,
    mapStyle
  } = useProjectStore();

  return (
    <PanelWrapper title="Project Settings">
      <div className="flex border-b border-border mb-4">
        <button 
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          General
        </button>
        <button 
          onClick={() => setActiveTab('map')}
          className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'map' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Map
        </button>
      </div>

      {activeTab === 'general' ? (
        <>
          <Field label="Name"><InputText value={name} onChange={setProjectName} /></Field>
          <Field label="Duration (s)"><InputNumber value={duration} onChange={setDuration} min={1} max={600} /></Field>
          <Field label="FPS">
            <Select value={fps.toString()} onValueChange={(v) => setFps(Number(v) as 30 | 60)}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="60">60</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Resolution">
            <Select value={resolution.join('x')} onValueChange={(v) => { const [w, h] = v.split('x').map(Number); setResolution([w, h]); }}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1920x1080">1920 × 1080</SelectItem>
                <SelectItem value="2560x1440">2560 × 1440</SelectItem>
                <SelectItem value="3840x2160">3840 × 2160</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      ) : (
        <>
          <SectionTitle>Environment</SectionTitle>
          <Field label="Projection">
            <Select value={projection} onValueChange={(v) => setProjection(v as any)}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="globe">Globe</SelectItem>
                <SelectItem value="mercator">Mercator (Flat)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          
          {mapStyle === 'standard' && (
            <Field label="Lighting Preset">
              <Select value={lightPreset} onValueChange={(v) => setLightPreset(v as any)}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                  <SelectItem value="dusk">Dusk</SelectItem>
                  <SelectItem value="dawn">Dawn</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          <SliderField label="Terrain Exaggeration" value={terrainExaggeration} onChange={setTerrainExaggeration} min={1} max={3} step={0.1} />

          <SectionTitle>Atmosphere</SectionTitle>
          <SliderField label="Star Intensity" value={starIntensity} onChange={(v) => setAtmosphere({ starIntensity: v })} min={0} max={1} step={0.01} />
          <Field label="Fog Color">
            <div className="flex gap-2 items-center">
              <InputColor 
                value={fogColor || (
                  mapStyle === 'satellite' || mapStyle === 'satelliteStreets' ? '#DC9F71' : 
                  mapStyle === 'dark' ? '#171717' : 
                  '#BAD2EB'
                )} 
                onChange={(v) => setAtmosphere({ fogColor: v })} 
              />
              <Button 
                onClick={() => setAtmosphere({ fogColor: null })}
                variant="secondary"
                size="sm"
                className="text-[10px] px-2 h-7"
                title="Reset to Style Default"
              >
                Reset
              </Button>
            </div>
          </Field>

          <SectionTitle>Labels</SectionTitle>
          <div className="grid grid-cols-2 gap-x-4">
            <Toggle checked={showRoadLabels} onChange={(v) => setLabelVisibility('road', v)} label="Roads" />
            <Toggle checked={showPlaceLabels} onChange={(v) => setLabelVisibility('place', v)} label="Places" />
            <Toggle checked={showPointOfInterestLabels} onChange={(v) => setLabelVisibility('poi', v)} label="POIs" />
            <Toggle checked={showTransitLabels} onChange={(v) => setLabelVisibility('transit', v)} label="Transit" />
          </div>

          <SectionTitle>3D Details</SectionTitle>
          <Toggle checked={show3dLandmarks} onChange={(v) => set3dDetails('landmarks', v)} label="Landmarks" />
          <Toggle checked={show3dTrees} onChange={(v) => set3dDetails('trees', v)} label="Trees" />
          <Toggle checked={show3dFacades} onChange={(v) => set3dDetails('facades', v)} label="Facades" />
          
          <SectionTitle>Localization</SectionTitle>
          <Field label="Map Language">
            <Select value={mapLanguage} onValueChange={(v) => setMapLanguage(v)}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="ja">Japanese</SelectItem>
                <SelectItem value="ko">Korean</SelectItem>
                <SelectItem value="zh-Hans">Chinese (Simplified)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
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
        <Select value={item.style.dashPattern ? 'dashed' : 'solid'} onValueChange={(v) => us({ dashPattern: v === 'dashed' ? [8, 4] : v === 'dotted' ? [2, 4] : null })}>
          <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
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
          <Input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="flex-1 h-8 text-sm" placeholder="e.g. Central Park" />
          <Button onClick={handleSearch} disabled={searching} variant="outline" size="sm" className="h-8 w-8 p-0">
            <Search size={14} />
          </Button>
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
            <Select 
              value={item.style.animationStyle || 'draw'} 
              onValueChange={(v) => us({ animationStyle: v as any })} 
            >
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fade">Fade (Basic)</SelectItem>
                <SelectItem value="draw">Draw (Perimeter)</SelectItem>
                <SelectItem value="trace">Trace (Comet)</SelectItem>
              </SelectContent>
            </Select>
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
        <Button
          onClick={() => setMoveModeActive(!isMoveModeActive)}
          size="sm"
          variant={isMoveModeActive ? "default" : "secondary"}
          className={`h-7 px-3 text-[10px] uppercase font-bold tracking-tight rounded-full transition-all ${isMoveModeActive ? "shadow-lg scale-105" : ""}`}
        >
          {isMoveModeActive ? <Check size={12} /> : <Crosshair size={12} />}
          {isMoveModeActive ? 'Done' : 'Move'}
        </Button>
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
        <Select value={item.animation.enter} onValueChange={(v) => ua({ enter: v as any })}>
          <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fadeIn">Fade In</SelectItem>
            <SelectItem value="scaleUp">Scale Up</SelectItem>
            <SelectItem value="slideUp">Slide Up</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Exit">
        <Select value={item.animation.exit} onValueChange={(v) => ua({ exit: v as any })}>
          <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fadeOut">Fade Out</SelectItem>
            <SelectItem value="scaleDown">Scale Down</SelectItem>
            <SelectItem value="slideDown">Slide Down</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <SliderField label="Enter Duration" value={item.animation.enterDuration} onChange={(v) => ua({ enterDuration: v })} min={0.1} max={2} step={0.1} />
      <SliderField label="Exit Duration" value={item.animation.exitDuration} onChange={(v) => ua({ exitDuration: v })} min={0.1} max={2} step={0.1} />
      <SectionTitle>Style</SectionTitle>
      <Field label="BG Color"><InputColor value={item.style.bgColor} onChange={(v) => us({ bgColor: v })} /></Field>
      <Field label="Text Color"><InputColor value={item.style.textColor} onChange={(v) => us({ textColor: v })} /></Field>
      <SliderField label="Max Width" value={item.style.maxWidth} onChange={(v) => us({ maxWidth: v })} min={150} max={400} step={10} />
      <Field label="Font Family" key={item.id}>
        <FontPicker
          autoLoad={false}
          defaultValue={item.style.fontFamily}
          value={(font) => {
            const fontName = typeof font === 'string' ? font : (font as any).family;
            us({ fontFamily: fontName });
          }}
        />
      </Field>
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
          <Select value={kf.followRoute || 'none'} onValueChange={(v) => u({ followRoute: v === 'none' ? null : v })}>
            <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      <DeleteButton onClick={() => { removeCameraKeyframe(kf.id); selectKeyframe(null); }} />
    </PanelWrapper>
  );
}

function PanelWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 bg-background/85 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl overflow-y-auto pointer-events-auto flex flex-col">
      <div className="p-4 border-b border-border/50 shrink-0">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-3">
        {children}
      </div>
    </div>
  );
}
