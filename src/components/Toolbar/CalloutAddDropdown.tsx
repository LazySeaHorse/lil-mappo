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
  MessageSquare, Plus, Check, Settings2, Link as LinkIcon, Link2Off
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { CalloutItem } from '@/store/types';
import { SearchField } from '../Search/SearchField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const CalloutAddDropdown = () => {
  const { 
    addItem, selectItem, playheadTime, 
    editingRoutePoint, setEditingRoutePoint,
    draftCallout, setDraftCallout
  } = useProjectStore();
  
  const [isOpen, setIsOpen] = useState(false);
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
    setIsOpen(false);
    toast.success('Callout added');
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-8 w-8 px-0 transition-colors ${isOpen ? 'text-primary bg-primary/5' : 'text-foreground hover:text-primary'}`}
          title="Add Callout"
        >
          <MessageSquare size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={isMobile ? "center" : "start"}
        collisionPadding={16}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[calc(100vw-32px)] md:w-[300px] bg-background/95 border border-border rounded-2xl shadow-xl !overflow-visible flex flex-col max-h-[80vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="p-4 flex flex-col gap-5 w-full !overflow-visible">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Location</h3>
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
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Title</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground">{linkTitle ? 'Linked' : 'Manual'}</span>
                <Switch 
                  checked={linkTitle} 
                  onCheckedChange={setLinkTitle}
                  className="scale-75"
                />
              </div>
            </div>
            <div className="relative">
              <Input 
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setLinkTitle(false); // break link if manually edited
                }}
                placeholder="Callout title"
                className="h-9 text-sm bg-secondary/30 border-transparent focus:border-border"
              />
              {linkTitle && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-primary">
                  <LinkIcon size={12} />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 px-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Style</h3>
            <div className="grid grid-cols-2 gap-2">
              {(['default', 'modern', 'news', 'topo'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${variant === v ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-secondary/50 text-muted-foreground border-transparent hover:border-border'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <Button 
            variant="default"
            size="sm" 
            onClick={handleAdd}
            disabled={lngLat[0] === 0}
            className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-xl"
          >
            <Plus size={16} /> Create Callout
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
