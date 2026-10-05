import React from 'react';
import type { MappoMood } from './moods';

const INK = '#122d56';
const BLUSH = '#f28b9b';

interface MappoProps {
  mood?: MappoMood;
  className?: string;
  title?: string;
}

// Eye centres and mouth anchor taken from public/logo-mark.svg (viewBox 351 287 553 678).
const EYE_L = { x: 523, y: 562 };
const EYE_R = { x: 693, y: 540 };

const stroke = { fill: 'none', stroke: INK, strokeWidth: 15, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** The two open eyes from the logo mark. */
const OpenEyes = () => (
  <>
    <ellipse cx={EYE_L.x} cy={EYE_L.y} rx={23} ry={40} fill={INK} />
    <ellipse cx={EYE_R.x} cy={EYE_R.y} rx={23} ry={40} fill={INK} />
  </>
);

const ClosedEyes = () => (
  <>
    <path d={`M${EYE_L.x - 26} ${EYE_L.y} Q${EYE_L.x} ${EYE_L.y + 26} ${EYE_L.x + 26} ${EYE_L.y}`} {...stroke} />
    <path d={`M${EYE_R.x - 26} ${EYE_R.y} Q${EYE_R.x} ${EYE_R.y + 26} ${EYE_R.x + 26} ${EYE_R.y}`} {...stroke} />
  </>
);

const Sparkle = ({ x, y }: { x: number; y: number }) => (
  <path
    fill={INK}
    d={`M${x} ${y - 44} Q${x + 6} ${y - 6} ${x + 40} ${y} Q${x + 6} ${y + 6} ${x} ${y + 44} Q${x - 6} ${y + 6} ${x - 40} ${y} Q${x - 6} ${y - 6} ${x} ${y - 44}Z`}
  />
);

const Blush = () => (
  <>
    <ellipse cx={EYE_L.x - 18} cy={EYE_L.y + 62} rx={34} ry={20} fill={BLUSH} opacity={0.55} />
    <ellipse cx={EYE_R.x + 18} cy={EYE_R.y + 62} rx={34} ry={20} fill={BLUSH} opacity={0.55} />
  </>
);

const Brow = ({ x, y, tilt }: { x: number; y: number; tilt: number }) => (
  <path d={`M${x - 30} ${y + tilt} L${x + 30} ${y - tilt}`} {...stroke} strokeWidth={13} />
);

/** Cat-style "w" smile used once the account is signed in. */
const CuteMouth = () => (
  <path d="M584 598 Q600 624 616 603 Q632 624 648 598" {...stroke} />
);

const OpenSmile = () => (
  <path d="M580 592 Q616 650 652 592 Q616 606 580 592Z" fill={INK} stroke={INK} strokeWidth={10} strokeLinejoin="round" />
);

const SmallSmile = () => <path d="M588 600 Q616 620 644 598" {...stroke} />;

const FeaturesFor: Record<Exclude<MappoMood, 'explorer'>, () => React.ReactElement> = {
  default: () => (
    <path
      fill={INK}
      fillRule="evenodd"
      d="M596.8 621.9C585.3 619.2 578.0 613.2 578.0 606.4C578.0 596.3 585.6 593.0 597.0 598.0C608.9 603.2 621.4 601.0 629.4 592.3C631.1 590.4 633.7 587.6 635.2 585.9C640.5 580.1 651.7 582.9 653.6 590.4C656.1 600.6 640.8 616.1 623.1 621.4C617.2 623.1 603.1 623.4 596.8 621.9ZM517.5 598.7C513.2 596.7 508.0 591.2 505.9 586.4C503.3 580.6 499.7 556.8 500.3 549.5C502.2 524.7 531.0 519.9 541.2 542.7C544.4 550.0 547.7 575.7 546.2 582.6C543.4 596.1 529.2 604.0 517.5 598.7ZM687.5 569.1C682.8 566.9 679.0 563.0 676.1 557.5C673.9 553.1 670.0 531.0 670.0 522.4C670.0 496.6 700.6 489.6 710.9 513.0C714.2 520.6 717.6 546.7 716.1 553.4C713.0 567.4 699.6 574.7 687.5 569.1Z"
    />
  ),
  sleepy: () => (
    <>
      <ClosedEyes />
      <ellipse cx={616} cy={606} rx={13} ry={10} fill={INK} />
      <text x={760} y={410} fontSize={84} fontWeight={700} fill={INK} opacity={0.55} fontFamily="inherit">z</text>
      <text x={810} y={350} fontSize={58} fontWeight={700} fill={INK} opacity={0.4} fontFamily="inherit">z</text>
    </>
  ),
  inquisitive: () => (
    <>
      <OpenEyes />
      <Brow x={EYE_R.x} y={EYE_R.y - 66} tilt={10} />
      <ellipse cx={622} cy={608} rx={13} ry={11} fill={INK} />
    </>
  ),
  curious: () => (
    <>
      <OpenEyes />
      <SmallSmile />
    </>
  ),
  happy: () => (
    <>
      <OpenEyes />
      <OpenSmile />
    </>
  ),
  blush: () => (
    <>
      <OpenEyes />
      <Blush />
      <CuteMouth />
    </>
  ),
  sparkle: () => (
    <>
      <Sparkle x={EYE_L.x} y={EYE_L.y - 6} />
      <Sparkle x={EYE_R.x} y={EYE_R.y - 6} />
      <Blush />
      <OpenSmile />
    </>
  ),
  worried: () => (
    <>
      <OpenEyes />
      <Brow x={EYE_L.x} y={EYE_L.y - 66} tilt={10} />
      <Brow x={EYE_R.x} y={EYE_R.y - 66} tilt={-10} />
      <path d="M588 612 Q602 596 616 610 Q630 624 644 606" {...stroke} />
    </>
  ),
};

/** Khaki safari hat perched on top of the pin, tilted a touch. Paid accounts only. */
const ExplorerCap = () => (
  <g transform="translate(0 22) rotate(-6 640 330)">
    <path d="M510 336 C506 250 560 186 640 186 C720 186 774 250 770 336Z" fill="#c79a57" />
    <path d="M508 318 C560 336 720 336 772 318 L770 340 C720 356 560 356 510 340Z" fill="#7a4a22" />
    <path d="M600 192 C620 182 660 182 680 192 C670 206 610 206 600 192Z" fill="#a97a3e" />
    <ellipse cx={640} cy={344} rx={212} ry={30} fill="#d9ad6b" />
    <ellipse cx={640} cy={344} rx={212} ry={30} fill="none" stroke="#a97a3e" strokeWidth={7} />
  </g>
);

/**
 * li'l Mappo, the map-pin mascot. Mood swaps the face; the pin and face shell never change.
 * The explorer cap overflows the viewBox, so the svg is `overflow-visible`.
 */
export function Mappo({ mood = 'default', className, title }: MappoProps) {
  const Features = FeaturesFor[mood === 'explorer' ? 'blush' : mood];
  return (
    <svg
      viewBox="351 287 553 678"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: 'visible' }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-mood={mood}
    >
      <path
        fill="#1c6bde"
        d="M618.1 956.5C603.5 952.4 594.5 944.4 563.5 907.4C543.2 883.3 495.7 823.6 471.3 791.5C466.3 784.9 456.5 772.3 449.6 763.5C402.6 703.7 387.5 678.9 373.4 637.7C343.5 550.6 360.8 451.1 417.3 385.5C466.3 328.5 546.1 295.7 636.0 295.7C787.4 295.6 887.3 385.6 896.0 530.1C900.5 605.4 879.5 667.2 825.4 737.6C793.1 779.7 741.0 844.7 706.6 885.9C650.4 953.3 639.0 962.3 618.1 956.5Z"
      />
      <path
        fill="#fdf8ec"
        fillRule="evenodd"
        d="M579.5 708.0C541.8 705.7 511.3 695.1 490.0 676.8C440.0 633.9 422.5 531.2 454.3 467.1C466.8 442.0 487.7 422.1 516.5 408.0C567.3 383.1 645.7 374.3 701.5 387.2C766.3 402.2 801.1 444.3 813.1 522.5C815.2 535.9 814.7 570.2 812.1 584.5C800.9 648.4 761.5 682.6 679.3 700.0C645.5 707.1 610.8 709.9 579.5 708.0Z"
      />
      <Features />
      {mood === 'explorer' && <ExplorerCap />}
    </svg>
  );
}
