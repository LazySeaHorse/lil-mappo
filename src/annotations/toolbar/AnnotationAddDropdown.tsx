/**
 * AnnotationAddDropdown — replaces CalloutAddDropdown.
 *
 * Creates new annotation items using the style registry.
 * Shows a style picker grid instead of a 4-option segmented control.
 */

import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flag, Plus, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import type { CalloutItem } from '@/store/types';
import { SearchField } from '@/components/Search/SearchField';
import { Switch } from "@/components/ui/switch";
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SectionLabel, Field } from '@/components/ui/field';
import { StatusPill } from '@/components/ui/pro-badge';
import { getStyle, getAllStyles } from '@/annotations/registry';
import { StylePicker } from '@/annotations/inspector/StylePicker';

export const AnnotationAddDropdown = ({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const {
    addItem, selectItem, playheadTime,
    activePicker, startPicking, stopPicking,
  } = useProjectStore();

  const [lngLat, setLngLat] = useState<[number, number]>([0, 0]);
  const [locationName, setLocationName] = useState('');
  const [title, setTitle] = useState('New Callout');
  const [styleId, setStyleId] = useState('topo-label');
  const [linkTitle, setLinkTitle] = useState(true);

  const isPicking = activePicker?.id === 'callout-new';

  const handleTogglePick = () => {
    if (isPicking) {
      stopPicking();
    } else {
      startPicking({
        id: 'callout-new',
        prompt: 'Callout',
        onPick: (result) => {
          setLngLat(result.lngLat);
          setLocationName(result.name);
          if (linkTitle) setTitle(result.name);
        },
      });
    }
  };

  // Clean up picker if this component closes or unmounts while picking
  useEffect(() => {
    if (!isOpen) {
      if (useProjectStore.getState().activePicker?.id === 'callout-new') {
        useProjectStore.getState().stopPicking();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (useProjectStore.getState().activePicker?.id === 'callout-new') {
        useProjectStore.getState().stopPicking();
      }
    };
  }, []);

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

    const style = getStyle(styleId);
    if (!style) {
      toast.error('Invalid style selected');
      return;
    }

    const id = nanoid();
    const item: CalloutItem = {
      kind: 'callout',
      id,
      styleId,
      styleVersion: style.version,
      content: {
        title,
      },
      binding: {
        kind: 'geographic',
        lngLat,
        altitude: 100,
      },
      offset: [0, 0],
      anchor: 'bottom',
      startTime: playheadTime,
      endTime: playheadTime + 5,
      transition: {
        enter: style.defaultTransition?.enter ?? 'fade',
        exit: style.defaultTransition?.exit ?? 'fade',
        enterDuration: style.defaultTransition?.enterDuration ?? 0.4,
        exitDuration: style.defaultTransition?.exitDuration ?? 0.3,
      },
      connector: {
        visible: style.defaultConnector?.visible ?? true,
        style: 'dashed',
        color: '#94a3b8',
        width: 2,
        endDot: true,
        endDotRadius: 3,
        ...style.defaultConnector,
      },
      opacity: 1,
      scale: 1,
      settings: { ...style.defaultSettings } as Record<string, unknown>,
      linkTitleToLocation: linkTitle,
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
      data-walkthrough="add-callout"
    >
      <Flag size={18} />
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
      className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg shadow-lg shadow-primary/10 transition-all"
    >
      <Plus size={16} /> Create callout
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
        <SectionLabel>Target location</SectionLabel>
        <SearchField
          label="Search location..."
          value={lngLat}
          name={locationName}
          onSelect={handleSelect}
          isPicking={isPicking}
          onStartPick={handleTogglePick}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <SectionLabel className="mb-0 px-0">Label title</SectionLabel>
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
        <SectionLabel>Style</SectionLabel>
        <StylePicker
          value={styleId}
          onChange={setStyleId}
        />
      </div>
    </ToolbarDropdownPanel>
  );
};
