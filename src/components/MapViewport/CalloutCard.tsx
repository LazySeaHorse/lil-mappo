import type { CalloutItem } from '@/store/types';
import { hexToRgba } from '@/utils/colors';

interface Props {
  callout: CalloutItem;
  phase: 'enter' | 'visible' | 'exit';
  progress: number;
  altitudeOffset?: number;
}

export default function CalloutCard({ callout, phase, progress, altitudeOffset = 0 }: Props) {
  const variant = callout.style.variant || 'default';
  const textColor = callout.style.textColor;

  const accentColor = callout.style.accentColor;
  const fontFamily = callout.style.fontFamily || 'Outfit';

  const backgroundColor = callout.style.bgColor;

  // --- ANIMATION CALCULATION ---
  const animStyles = (() => {
    const isEntering = phase === 'enter';
    const isExiting = phase === 'exit';
    const p = Math.min(progress, 1);

    let transform = '';
    let opacity = 1;

    if (isEntering) {
      if (callout.animation.enter === 'fadeIn') opacity = p;
      else if (callout.animation.enter === 'scaleUp') { opacity = p; transform = `scale(${0.5 + 0.5 * p})`; }
      else if (callout.animation.enter === 'slideUp') { opacity = p; transform = `translateY(${20 * (1 - p)}px)`; }
    } else if (isExiting) {
      if (callout.animation.exit === 'fadeOut') opacity = 1 - p;
      else if (callout.animation.exit === 'scaleDown') { opacity = 1 - p; transform = `scale(${1 - 0.5 * p})`; }
      else if (callout.animation.exit === 'slideDown') { opacity = 1 - p; transform = `translateY(${20 * p}px)`; }
    }

    return { transform, opacity };
  })();

  const commonStyles = {
    opacity: animStyles.opacity,
    transform: `perspective(1000px) rotateX(2deg) ${animStyles.transform}`,
    transformOrigin: 'bottom center',
    fontFamily: `'${fontFamily}', sans-serif`,
    transition: 'opacity 0.2s ease-out',
    color: textColor,
  };

  // --- VARIANT RENDERER ---
  const renderCard = () => {
    switch (variant) {
      case 'modern':
        return (
          <div
            style={{
              ...commonStyles,
              // Always 87% opacity as requested
              backgroundColor: hexToRgba(backgroundColor, 0.87),
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '100px',
              padding: '8px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
              position: 'relative',
            }}
          >
            <div style={{ 
              width: '10px', 
              height: '10px', 
              backgroundColor: accentColor, 
              borderRadius: '50%', 
              boxShadow: `0 0 12px ${accentColor}`,
              flexShrink: 0
            }} />
            <div style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>{callout.title}</div>
          </div>
        );

      case 'news':
        return (
          <div
            style={{
              ...commonStyles,
              backgroundColor: backgroundColor,
              padding: '8px 16px',
              fontWeight: 900,
              fontSize: '16px',
              borderLeft: `5px solid ${accentColor}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            {callout.title}
          </div>
        );

      case 'topo':
        return (
          <div
            style={{
              ...commonStyles,
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              paddingLeft: '12px',
              letterSpacing: '0.02em',
            }}
          >
            {callout.style.showMetadata && (
              <div style={{ color: accentColor, fontSize: '9px', marginBottom: '4px', letterSpacing: '0.05em', fontWeight: 700 }}>
                {callout.lngLat[1].toFixed(4)}° N, {callout.lngLat[0].toFixed(4)}° W
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>{callout.title}</div>
            {callout.style.showMetadata && (
              <div style={{ opacity: 0.5, fontSize: '10px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
                ELEV: {Math.round(callout.altitude)}ft
              </div>
            )}
            <div style={{ width: '4px', height: '4px', border: `1px solid ${accentColor}`, position: 'absolute', bottom: '-2px', left: '-2.5px' }} />
          </div>
        );

      case 'default':
      default:
        // Original style - Pruned to Title Only
        return (
          <div
            style={{
              ...commonStyles,
              backgroundColor: callout.style.bgColor,
              borderRadius: '0px',
              maxWidth: `${callout.style.maxWidth}px`,
              border: '1px solid rgba(255,255,255,0.2)',
            }}
            className="px-3 py-2 text-sm"
          >
            <div className="font-semibold text-sm leading-tight whitespace-nowrap">{callout.title}</div>
          </div>
        );
    }
  };

  const poleHeight = callout.poleVisible ? Math.max(altitudeOffset, 0) : 0;

  return (
    <div 
      className="flex flex-col items-center pointer-events-auto"
      style={{
        filter: callout.style.shadow ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))' : 'none',
        overflow: 'visible'
      }}
    >
      {renderCard()}
      
      {callout.poleVisible && (
        <svg width="2" height={poleHeight + 4} style={{ opacity: animStyles.opacity }} className="overflow-visible">
          <line x1="1" y1="0" x2="1" y2={poleHeight} stroke={callout.poleColor} strokeWidth="2" strokeDasharray="4 2" />
          <circle cx="1" cy={poleHeight} r="3" fill={callout.poleColor} opacity="0.8" />
        </svg>
      )}
    </div>
  );
}
