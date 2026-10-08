import type { CSSProperties } from 'react';
import { brandMarkUrl, mapboxLogoUrl } from './assets';
import { OVERLAY_LAYOUT as L, SYSTEM_FONT } from './layout';
import type { OverlayAnchor, OverlayLayer } from './types';

// CSS blur radii are ~2x canvas shadowBlur for drop-shadow, so halve it to match drawOverlays.
const DROP_SHADOW = `drop-shadow(0 ${L.shadow.offsetY}px ${L.shadow.blur / 2}px ${L.shadow.color})`;
const TEXT_SHADOW = `0 ${L.shadow.offsetY}px ${L.shadow.blur}px ${L.shadow.color}`;

/** Inset from the viewport edge; never less than the safe area on notched phones. */
const inset = (side: 'top' | 'right' | 'bottom' | 'left') =>
  `max(${L.margin}px, env(safe-area-inset-${side}))`;

function anchorStyle(anchor: OverlayAnchor): CSSProperties {
  return {
    position: 'absolute',
    [anchor.startsWith('top') ? 'top' : 'bottom']: inset(anchor.startsWith('top') ? 'top' : 'bottom'),
    [anchor.endsWith('left') ? 'left' : 'right']: inset(anchor.endsWith('left') ? 'left' : 'right'),
  };
}

function LayerContent({ layer }: { layer: OverlayLayer }) {
  switch (layer.kind) {
    case 'mapbox-logo':
      return <img src={mapboxLogoUrl} alt="Mapbox" width={L.mapboxLogo.width} height={L.mapboxLogo.height} draggable={false} />;
    case 'attribution':
      return (
        <span style={{ color: 'white', fontFamily: SYSTEM_FONT, fontSize: L.attribution.fontSize, lineHeight: 1, textShadow: TEXT_SHADOW }}>
          {layer.text}
        </span>
      );
    case 'brand': {
      const markH = L.brand.markHeight;
      return (
        <span
          className="flex items-center whitespace-nowrap"
          style={{
            gap: L.brand.gap,
            color: 'white',
            fontSize: L.brand.fontSize,
            fontWeight: L.brand.fontWeight,
            fontFamily: `${L.brand.fontFamily}, ${SYSTEM_FONT}`,
            lineHeight: 1,
            textShadow: TEXT_SHADOW,
          }}
        >
          <img
            src={brandMarkUrl}
            alt=""
            aria-hidden="true"
            width={markH * L.brand.markAspect}
            height={markH}
            draggable={false}
            style={{ filter: DROP_SHADOW }}
          />
          li'l Mappo
        </span>
      );
    }
  }
}

/**
 * DOM backend for the overlay layers (hide-UI mode), mirroring `drawOverlays` at
 * scale 1. Static and non-interactive so it never gets in the way of the map.
 */
export function SystemOverlays({ layers }: { layers: OverlayLayer[] }) {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none overflow-hidden" data-testid="system-overlays">
      {layers.map((layer) => (
        <div key={layer.id} data-overlay={layer.id} data-anchor={layer.anchor} style={anchorStyle(layer.anchor)}>
          <LayerContent layer={layer} />
        </div>
      ))}
    </div>
  );
}
