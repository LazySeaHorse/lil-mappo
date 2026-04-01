import type { CalloutItem } from '@/store/types';

interface Props {
  callout: CalloutItem;
  phase: 'enter' | 'visible' | 'exit';
  progress: number;
}

export default function CalloutCard({ callout, phase, progress }: Props) {
  let opacity = 1;
  let transform = 'none';

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

  return (
    <div className="flex flex-col items-center">
      <div
        style={{
          opacity,
          transform,
          backgroundColor: callout.style.bgColor,
          color: callout.style.textColor,
          borderRadius: callout.style.borderRadius,
          maxWidth: callout.style.maxWidth,
          boxShadow: callout.style.shadow ? '0 4px 20px rgba(0,0,0,0.15)' : 'none',
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
        <div className="font-semibold text-sm leading-tight">{callout.title}</div>
        {callout.subtitle && (
          <div className="text-xs mt-0.5 opacity-70">{callout.subtitle}</div>
        )}
      </div>
      {callout.poleVisible && (
        <div
          style={{
            width: 2,
            height: Math.max(callout.altitude * 0.5, 10),
            backgroundColor: callout.poleColor,
            opacity,
          }}
        />
      )}
    </div>
  );
}
