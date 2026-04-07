import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Flag, Plus, Check, Settings2, Link as LinkIcon, Link2Off
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { CalloutItem } from '@/store/types';
import { SearchField } from '../Search/SearchField';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { PremiumLabel } from '../Inspector/InspectorShared';

export const CalloutAddDropdown = ({ 
  isOpen, 
  onOpenChange 
}: { 
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { 
    addItem, selectItem, playheadTime, 
    editingRoutePoint, setEditingRoutePoint,
    draftCallout, setDraftCallout
  } = useProjectStore();
  
  const [lngLat, setLngLat] = useState<[number, number]>([0, 0]);
  const [locationName, setLocationName] = useState('');
  const [title, setTitle] = useState('New Callout');
  const [variant, setVariant] = useState<CalloutItem['style']['variant']>('topo');
  const [linkTitle, setLinkTitle] = useState(true);
  
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync internal state from store drafts (map picks)
  useEffect(() => {
    if (draftCallout) {
      setLngLat(draftCallout.lngLat);
      setLocationName(draftCallout.name);
      if (linkTitle) setTitle(draftCallout.name);
      setDraftCallout(null); // consume it
    }
  }, [draftCallout, setDraftCallout, linkTitle]);

  const handleSelect = (coords: [number, number], name: string) => {
    setLngLat(coords);
    setLocationName(name);
    if (linkTitle) setTitle(name);
  };

  const handleAdd = () => {
    if (lngLat[0] === 0) {
      toast.error('Set a location first');
      return;
    }

    const id = nanoid();
    const item: CalloutItem = {
      kind: 'callout',
      id,
      title,
      subtitle: '',
      imageUrl: null,
      lngLat,
      anchor: 'bottom',
      startTime: playheadTime,
      endTime: playheadTime + 5,
      animation: {
        enter: 'slideUp',
        exit: 'slideDown',
        enterDuration: 0.6,
        exitDuration: 0.4,
      },
      style: {
        bgColor: '#ffffff',
        textColor: '#ffffff',
        accentColor: '#3b82f6',
        borderRadius: 8,
        shadow: true,
        maxWidth: 240,
        fontFamily: 'Inter',
        variant,
        showMetadata: true,
      },
      linkTitleToLocation: linkTitle,
      altitude: 100,
      poleVisible: true,
      poleColor: '#94a3b8',
    };

    addItem(item);
    selectItem(id);
    setLngLat([0, 0]);
    setLocationName('');
    setTitle('New Callout');
    onOpenChange(false);
    toast.success('Callout added to timeline');
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 w-8 px-0 transition-all duration-300 ${isOpen ? 'text-primary bg-primary/10 scale-110 shadow-lg' : 'text-foreground hover:text-primary hover:bg-primary/5'}`}
          title="Add Callout"
        >
          <Flag size={18} className={isOpen ? 'animate-pulse' : ''} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={isMobile ? "center" : "start"}
        collisionPadding={16}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[calc(100vw-32px)] md:w-[320px] bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-4 border-b border-border/50 bg-secondary/10 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Flag size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Add Callout</h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Place a 3D label on the map</p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-hidden min-h-0">
          <div className="p-4 space-y-6">
            <div className="space-y-4">
              <PremiumLabel>Target Location</PremiumLabel>
              <SearchField 
                label="Search location..."
                value={lngLat}
                name={locationName}
                onSelect={handleSelect}
                isPicking={editingRoutePoint === 'callout'}
                onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'callout' ? null : 'callout')}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <PremiumLabel>Label Title</PremiumLabel>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{linkTitle ? 'Linked' : 'Manual'}</span>
                  <Switch 
                    checked={linkTitle} 
                    onCheckedChange={setLinkTitle}
                    className="scale-75"
                  />
                </div>
              </div>
              <div className="relative group">
                <Input 
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setLinkTitle(false); 
                  }}
                  placeholder="Callout title"
                  className="h-9 text-xs bg-secondary/20 border-transparent focus:border-border/50 transition-all"
                />
                {linkTitle && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/50 group-hover:text-primary transition-colors">
                    <LinkIcon size={12} />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <PremiumLabel>Design Variant</PremiumLabel>
              <div className="bg-secondary/40 p-1 rounded-xl grid grid-cols-4 gap-1">
                {(['default', 'modern', 'news', 'topo'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setVariant(v)}
                    className={`py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${variant === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border/50 bg-secondary/5 shrink-0">
          <Button 
            variant="default"
            size="sm" 
            onClick={handleAdd}
            disabled={lngLat[0] === 0}
            className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-xl shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={16} /> Create Callout
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

