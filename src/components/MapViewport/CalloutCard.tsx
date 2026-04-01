import type { CalloutItem } from '@/store/types';

interface Props {
  callout: CalloutItem;
  phase: 'enter' | 'visible' | 'exit';
  progress: number;
  altitudeOffset?: number;
}

export default function CalloutCard({ callout, phase, progress, altitudeOffset = 0 }: Props) {
  let opacity = 1;
  let transform = '';

  if (phase === 'enter') {
    const p = Math.min(progress, 1);
    if (callout.animation.enter === 'fadeIn') {
      opacity = p;
    } else if (callout.animation.enter === 'scaleUp') {
      opacity = p;
      transform = `scale(${0.5 + 0.5 * p})`;
    } else if (callout.animation.enter === 'slideUp') {
      opacity = p;
      transform = `translateY(${20 * (1 - p)}px)`;
    }
  } else if (phase === 'exit') {
    const p = Math.min(progress, 1);
    if (callout.animation.exit === 'fadeOut') {
      opacity = 1 - p;
    } else if (callout.animation.exit === 'scaleDown') {
      opacity = 1 - p;
      transform = `scale(${1 - 0.5 * p})`;
    } else if (callout.animation.exit === 'slideDown') {
      opacity = 1 - p;
      transform = `translateY(${20 * p}px)`;
    }
  }

  // Add 3D perspective transform to make the card feel like it's in the map space
  // This gives a subtle tilt that makes it feel 3D, similar to the route line
  const perspectiveTransform = `perspective(800px) rotateX(2deg)`;
  const fullTransform = [perspectiveTransform, transform].filter(Boolean).join(' ');

  const poleHeight = callout.poleVisible ? Math.max(altitudeOffset, 20) : 0;

  return (
    <div
      className="flex flex-col items-center pointer-events-auto"
      style={{
        filter: callout.style.shadow ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))' : 'none',
      }}
    >
      <div
        style={{
          opacity,
          transform: fullTransform,
          transformOrigin: 'bottom center',
          backgroundColor: callout.style.bgColor,
          color: callout.style.textColor,
          borderRadius: callout.style.borderRadius,
          maxWidth: callout.style.maxWidth,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
        className="px-3 py-2 text-sm"
      >
        {callout.imageUrl && (
          <img
            src={callout.imageUrl}
            alt=""
            className="w-full h-24 object-cover rounded mb-2"
          />
        )}
        <div className="font-semibold text-sm leading-tight whitespace-nowrap">{callout.title}</div>
        {callout.subtitle && (
          <div className="text-xs mt-0.5 opacity-70 whitespace-nowrap">{callout.subtitle}</div>
        )}
      </div>
      {callout.poleVisible && (
        <svg
          width="2"
          height={poleHeight}
          style={{ opacity }}
          className="overflow-visible"
        >
          {/* Vertical pole line */}
          <line
            x1="1" y1="0" x2="1" y2={poleHeight}
            stroke={callout.poleColor}
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          {/* Ground dot */}
          <circle
            cx="1" cy={poleHeight}
            r="3"
            fill={callout.poleColor}
            opacity="0.8"
          />
        </svg>
      )}
    </div>
  );
}
