import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Flag, Plus, Link as LinkIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { CalloutItem } from '@/store/types';
import { SearchField } from '../Search/SearchField';
import { Switch } from "@/components/ui/switch";

import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SectionLabel, Field } from '@/components/ui/field';
import { StatusPill } from '@/components/ui/pro-badge';

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
        enter: 'fadeIn',
        exit: 'fadeOut',
        enterDuration: 0.4,
        exitDuration: 0.3,
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

  const trigger = (
    <IconButton
      variant={isOpen ? "toolbar-active" : "toolbar"}
      size="sm"
      title="Add Callout"
    >
      <Flag size={18} className={isOpen ? 'animate-pulse' : ''} />
    </IconButton>
  );

  const header = (
    <PanelHeader 
      icon={<Flag size={16} />} 
      title="Add Callout" 
      subtitle="Place a 3D label on the map"
    />
  );

  const footer = (
    <Button 
      variant="default"
      size="sm" 
      onClick={handleAdd}
      disabled={lngLat[0] === 0}
      className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-xl shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
    >
      <Plus size={16} /> Create Callout
    </Button>
  );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
      footer={footer}
    >
      <div className="space-y-4">
        <SectionLabel>Target Location</SectionLabel>
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
          <SectionLabel className="mb-0 px-0">Label Title</SectionLabel>
          <div className="flex items-center gap-2">
            <StatusPill>{linkTitle ? 'Linked' : 'Manual'}</StatusPill>
            <Switch 
              checked={linkTitle} 
              onCheckedChange={setLinkTitle}
              className="scale-75"
            />
          </div>
        </div>
        <Field label="" className="mb-0">
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
        </Field>
      </div>

      <div className="space-y-3">
        <SectionLabel>Design Variant</SectionLabel>
        <SegmentedControl
          options={[
            { value: 'default', label: 'Default' },
            { value: 'modern', label: 'Modern' },
            { value: 'news', label: 'News' },
            { value: 'topo', label: 'Topo' },
          ]}
          value={variant}
          onValueChange={setVariant}
        />
      </div>
    </ToolbarDropdownPanel>
  );
};
