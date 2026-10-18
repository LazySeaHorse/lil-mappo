import React from 'react';
import { cn } from '@/lib/utils';
import type { MappoMood, PoseMood } from './moods';

const INK = '#122d56';
const BLUSH = '#f28b9b';

interface MappoProps {
  mood?: MappoMood;
  className?: string;
  title?: string;
  /** Moves the pose's parts: the wave, the reel, the balloon, the confetti. Off by default. */
  animated?: boolean;
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

const KEY_GOLD = '#f6b83d';

/** A raised arm ending in a fist that holds a gold key. It reaches past the right edge of the usual frame. */
const KeyInHand = () => {
  const outline = { stroke: INK, strokeLinejoin: 'round' as const };
  return (
    <>
      <path d="M868 650 Q930 650 962 566" stroke="#1c6bde" strokeWidth={44} strokeLinecap="round" fill="none" />
      <g transform="translate(980 520) rotate(-62)">
        <rect x={38} y={-14} width={150} height={28} rx={8} fill={KEY_GOLD} strokeWidth={12} {...outline} />
        <rect x={130} y={12} width={22} height={40} rx={6} fill={KEY_GOLD} strokeWidth={12} {...outline} />
        <rect x={164} y={12} width={22} height={30} rx={6} fill={KEY_GOLD} strokeWidth={12} {...outline} />
        <circle cx={0} cy={0} r={52} fill={KEY_GOLD} strokeWidth={14} {...outline} />
        <circle cx={0} cy={0} r={19} fill="#fdf8ec" strokeWidth={10} {...outline} />
        <circle cx={-8} cy={8} r={32} fill="#1c6bde" strokeWidth={14} {...outline} />
      </g>
    </>
  );
};


const BLUE = '#1c6bde';
const CREAM = '#fdf8ec';
const PAPER = '#efe3c4';
const WISH = '#e0457b';
const SKY = '#cfe3ff';
const outline = { stroke: INK, strokeLinejoin: 'round' as const };

/** An arm in the pin's own blue. Arms are drawn over the pin, so they read as reaching out from its side. */
const Arm = ({ d }: { d: string }) => <path d={d} stroke={BLUE} strokeWidth={44} strokeLinecap="round" fill="none" />;

const Fist = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={30} fill={BLUE} strokeWidth={14} {...outline} />;

/** The open eyes, glancing toward (dx, dy). */
const LookEyes = ({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) => (
  <g transform={`translate(${dx} ${dy})`}>
    <OpenEyes />
  </g>
);

/** Narrowed eyes for reading something too small. */
const SquintEyes = () => (
  <>
    <ellipse cx={EYE_L.x} cy={EYE_L.y + 6} rx={24} ry={11} fill={INK} />
    <ellipse cx={EYE_R.x} cy={EYE_R.y + 6} rx={24} ry={11} fill={INK} />
  </>
);

/** An upturned "^" eye, closed with joy. */
const JoyEye = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x - 28} ${y + 12} Q${x} ${y - 26} ${x + 28} ${y + 12}`} {...stroke} strokeWidth={16} />
);

const SpiralEye = ({ x, y }: { x: number; y: number }) => (
  <path
    d={`M${x} ${y} a6 6 0 0 1 12 0 a12 12 0 0 1 -24 0 a18 18 0 0 1 36 0 a24 24 0 0 1 -48 0`}
    {...stroke}
    strokeWidth={9}
  />
);

const WobblyMouth = () => <path d="M588 612 Q602 596 616 610 Q630 624 644 606" {...stroke} />;

const BigSmile = () => (
  <path d="M568 588 Q616 672 664 588 Q616 610 568 588Z" fill={INK} stroke={INK} strokeWidth={10} strokeLinejoin="round" />
);

/** A sideways grin with the tongue poking out, for concentrating. */
const TongueOut = () => (
  <>
    <path d="M622 610 q2 26 18 22 q12 -4 4 -26" fill={BLUSH} strokeWidth={8} {...outline} />
    <path d="M588 604 Q614 618 648 600" {...stroke} />
  </>
);

const SweatDrop = ({ x, y }: { x: number; y: number }) => (
  <path
    d={`M${x} ${y - 34} C${x + 4} ${y - 20} ${x + 20} ${y - 4} ${x + 20} ${y + 8} A20 20 0 1 1 ${x - 20} ${y + 8} C${x - 20} ${y - 4} ${x - 4} ${y - 20} ${x} ${y - 34}Z`}
    fill={SKY}
    strokeWidth={9}
    {...outline}
  />
);

/** A film strip: a dark band with cream sprocket holes, along any path. */
const FilmStrip = ({ d }: { d: string }) => (
  <>
    <path d={d} stroke={INK} strokeWidth={40} fill="none" />
    <path d={d} stroke={CREAM} strokeWidth={7} strokeDasharray="9 15" fill="none" />
  </>
);

/** Holds a phone up close, too small to read comfortably. */
const PhoneInHand = () => (
  <>
    <Arm d="M872 662 Q948 660 954 596" />
    <g transform="rotate(-10 958 500)">
      <rect x={922} y={436} width={72} height={124} rx={14} fill={INK} />
      <rect x={931} y={449} width={54} height={92} rx={6} fill={SKY} />
      <path d="M940 528 C952 500 966 520 976 470" stroke={BLUE} strokeWidth={5} strokeLinecap="round" strokeDasharray="1 9" fill="none" />
    </g>
    <Fist x={948} y={586} />
  </>
);

/** A wind-up film camera with two reels, held beside the head. */
const CameraInHand = () => (
  <>
    <Arm d="M874 662 Q928 654 938 604" />
    <g transform="rotate(-8 990 520)">
      <circle cx={942} cy={438} r={40} fill={CREAM} strokeWidth={12} {...outline} />
      <circle cx={942} cy={438} r={9} fill={INK} />
      <circle cx={1022} cy={430} r={46} fill={CREAM} strokeWidth={12} {...outline} />
      <circle cx={1022} cy={430} r={10} fill={INK} />
      <rect x={898} y={470} width={152} height={102} rx={16} fill={INK} />
      <path d="M1050 498 L1098 480 L1098 562 L1050 544Z" fill="#2c4f86" strokeWidth={10} {...outline} />
      <circle cx={922} cy={494} r={8} fill="#f2655d" />
    </g>
    <Fist x={934} y={592} />
  </>
);

/** A three-panel paper map, held open with a dotted route on it. */
const OpenMap = () => (
  <g transform="translate(630 740) scale(1.3) translate(-630 -740)">
    <path d="M470 676 L577 664 L577 800 L470 812Z" fill={CREAM} strokeWidth={10} {...outline} />
    <path d="M577 664 L684 680 L684 816 L577 800Z" fill={PAPER} strokeWidth={10} {...outline} />
    <path d="M684 680 L791 668 L791 804 L684 816Z" fill={CREAM} strokeWidth={10} {...outline} />
    <path d="M504 780 C540 722 600 762 640 724 S724 700 752 716" stroke={WISH} strokeWidth={9} strokeLinecap="round" strokeDasharray="1 17" fill="none" />
    <circle cx={756} cy={714} r={11} fill={BLUE} />
    <Fist x={474} y={742} />
    <Fist x={788} y={736} />
  </g>
);

const WavingArm = () => (
  <g data-part="arm">
    <path d="M262 468 Q248 500 262 534" {...stroke} strokeWidth={11} opacity={0.45} />
    <path d="M232 450 Q212 500 232 552" {...stroke} strokeWidth={11} opacity={0.3} />
    <Arm d="M398 664 Q330 640 322 548" />
    <circle cx={300} cy={540} r={13} fill={BLUE} strokeWidth={10} {...outline} />
    <ellipse cx={322} cy={520} rx={30} ry={36} fill={BLUE} strokeWidth={14} {...outline} />
  </g>
);

const CONFETTI: Array<[number, number, string, number]> = [
  [300, 340, KEY_GOLD, 20], [388, 270, BLUSH, -30], [470, 312, '#3fcf7f', 45], [566, 256, KEY_GOLD, -15],
  [700, 262, '#7cc4ff', 25], [800, 300, BLUSH, 30], [884, 268, '#3fcf7f', -40], [952, 352, KEY_GOLD, 15],
  [318, 440, '#7cc4ff', 60], [958, 462, BLUSH, -20],
];

const Confetti = () => (
  <g data-part="confetti">
    {CONFETTI.map(([x, y, fill, r]) => (
      <rect key={`${x}-${y}`} x={x - 13} y={y - 7} width={26} height={14} rx={4} fill={fill} transform={`rotate(${r} ${x} ${y})`} />
    ))}
  </g>
);

const CheeringArms = () => (
  <>
    <Arm d="M402 640 Q332 580 352 470" />
    <Fist x={352} y={458} />
    <Arm d="M870 610 Q940 540 912 440" />
    <Fist x={912} y={428} />
  </>
);

/** A film reel, held up while the export runs. The reel is its own part so a page can spin it. */
const ReelInHand = () => {
  const holes: Array<[number, number]> = [[0, -42], [40, -13], [25, 34], [-25, 34], [-40, -13]];
  return (
    <>
      <FilmStrip d="M996 604 C1052 684 978 742 1030 826" />
      <Arm d="M874 664 Q918 660 930 628" />
      <g transform="translate(960 540)">
        <g data-part="reel">
          <circle r={76} fill="#2c4f86" strokeWidth={12} {...outline} />
          {holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={17} fill={CREAM} />)}
          <circle r={12} fill={CREAM} strokeWidth={6} {...outline} />
        </g>
      </g>
      <Fist x={926} y={612} />
    </>
  );
};

const DizzyStar = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y}) scale(0.45)`} opacity={0.5}>
    <Sparkle x={0} y={0} />
  </g>
);

/** Wound up in film after an export failed. */
const TangledFilm = () => (
  <>
    <FilmStrip d="M356 640 C480 742 760 600 896 700" />
    <FilmStrip d="M392 800 C520 720 700 880 850 790 C900 812 918 850 888 884" />
    <DizzyStar x={418} y={360} />
    <DizzyStar x={846} y={346} />
  </>
);

/** A boarding pass held out, for signing in. */
const TicketInHand = () => (
  <>
    <Arm d="M874 660 Q930 650 944 604" />
    <g transform="rotate(-16 1000 530)">
      <rect x={900} y={480} width={192} height={98} rx={12} fill={CREAM} strokeWidth={10} {...outline} />
      <path d="M1044 490 V568" stroke={INK} strokeWidth={5} strokeDasharray="6 8" />
      <path d="M922 534 L956 528 L968 508 L978 508 L972 526 L992 523 L999 513 L1005 513 L1003 530 L1005 547 L999 547 L992 537 L972 534 L978 552 L968 552 L956 532Z" fill={BLUE} />
      <rect x={918} y={556} width={104} height={8} rx={4} fill="#c9d6e8" />
      {[1056, 1064, 1074, 1080, 1086].map((x, i) => <rect key={x} x={x} y={500} width={i % 2 ? 3 : 5} height={58} fill={INK} />)}
    </g>
    <Fist x={940} y={594} />
  </>
);

/** A heart balloon on a string, for votes and wishes. */
const HeartBalloon = () => (
  <>
    <g data-part="balloon">
      <path d="M352 566 C328 506 362 456 332 404" stroke={INK} strokeWidth={5} fill="none" />
      <path d="M330 400 C246 338 248 266 300 260 C318 258 328 270 330 284 C332 270 342 258 360 260 C412 266 414 338 330 400Z" fill={WISH} strokeWidth={10} {...outline} />
      <ellipse cx={298} cy={292} rx={10} ry={17} fill="#fff" opacity={0.45} transform="rotate(-20 298 292)" />
    </g>
    <Arm d="M398 666 Q350 650 360 598" />
    <Fist x={358} y={584} />
  </>
);

/** Two fists gripping an edge, for peeking over the top of a card. */
const GripFists = () => (
  <>
    <Fist x={488} y={664} />
    <Fist x={774} y={652} />
  </>
);

const FeaturesFor: Record<Exclude<MappoMood, 'explorer' | PoseMood>, () => React.ReactElement> = {
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
  key: () => (
    <>
      {/* Glances down at whatever sits below, with a small smile */}
      <g transform="translate(-10 22)">
        <OpenEyes />
        <Blush />
      </g>
      <path d="M574 604 Q596 624 622 606" {...stroke} />
      <KeyInHand />
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


interface Pose {
  face: () => React.ReactElement;
  /** Drawn over the pin and face: arms, props. */
  front?: () => React.ReactElement;
  /** Drawn before the pin, so the pin covers it. */
  behind?: () => React.ReactElement;
  /** Wider frames for props that reach past the pin. */
  viewBox?: string;
  /** Degrees to lean the pin and face, pivoting on the pin's tip. */
  lean?: number;
}

/** Moods with a pose: arms, props, a lean. Each one is made for a moment in the app. */
const POSES: Record<PoseMood, Pose> = {
  phone: {
    face: () => (
      <>
        <SquintEyes />
        <Brow x={EYE_L.x} y={EYE_L.y - 56} tilt={-8} />
        <Brow x={EYE_R.x} y={EYE_R.y - 56} tilt={8} />
        <ellipse cx={618} cy={612} rx={11} ry={9} fill={INK} />
        <SweatDrop x={452} y={468} />
      </>
    ),
    front: PhoneInHand,
    viewBox: '351 287 690 678',
  },
  camera: {
    face: () => (
      <>
        <ellipse cx={EYE_L.x} cy={EYE_L.y} rx={23} ry={40} fill={INK} />
        <JoyEye x={EYE_R.x} y={EYE_R.y} />
        <Blush />
        <OpenSmile />
      </>
    ),
    front: CameraInHand,
    viewBox: '351 287 760 678',
    lean: -4,
  },
  map: {
    face: () => (
      <>
        <LookEyes dx={6} dy={18} />
        <path d="M596 640 Q616 652 636 638" {...stroke} />
      </>
    ),
    front: OpenMap,
  },
  wave: {
    face: () => (
      <>
        <OpenEyes />
        <Blush />
        <OpenSmile />
      </>
    ),
    front: WavingArm,
    viewBox: '211 287 693 678',
    lean: 4,
  },
  cheer: {
    face: () => (
      <>
        <JoyEye x={EYE_L.x} y={EYE_L.y} />
        <JoyEye x={EYE_R.x} y={EYE_R.y} />
        <Blush />
        <BigSmile />
      </>
    ),
    behind: Confetti,
    front: CheeringArms,
    viewBox: '271 237 713 728',
  },
  reel: {
    face: () => (
      <>
        <LookEyes dx={12} />
        <Brow x={EYE_L.x + 12} y={EYE_L.y - 62} tilt={-6} />
        <Brow x={EYE_R.x + 12} y={EYE_R.y - 62} tilt={6} />
        <TongueOut />
      </>
    ),
    front: ReelInHand,
    viewBox: '351 287 720 678',
  },
  tangled: {
    face: () => (
      <>
        <SpiralEye x={EYE_L.x} y={EYE_L.y} />
        <SpiralEye x={EYE_R.x} y={EYE_R.y} />
        <WobblyMouth />
      </>
    ),
    front: TangledFilm,
    lean: 6,
  },
  ticket: {
    face: () => (
      <>
        <LookEyes dx={14} dy={4} />
        <Blush />
        <SmallSmile />
      </>
    ),
    front: TicketInHand,
    viewBox: '351 287 760 678',
  },
  balloon: {
    face: () => (
      <>
        <LookEyes dx={-12} dy={-12} />
        <Blush />
        <SmallSmile />
      </>
    ),
    front: HeartBalloon,
    viewBox: '231 237 673 728',
  },
  peek: {
    face: () => (
      <>
        <LookEyes dy={-16} />
        <SmallSmile />
      </>
    ),
    front: GripFists,
  },
  'peek-worried': {
    face: () => (
      <>
        <LookEyes dy={-10} />
        <Brow x={EYE_L.x} y={EYE_L.y - 70} tilt={10} />
        <Brow x={EYE_R.x} y={EYE_R.y - 70} tilt={-10} />
        <WobblyMouth />
      </>
    ),
    front: GripFists,
  },
  nervous: {
    face: () => (
      <>
        <LookEyes dx={-16} />
        <Brow x={EYE_L.x - 10} y={EYE_L.y - 66} tilt={10} />
        <Brow x={EYE_R.x - 10} y={EYE_R.y - 66} tilt={-10} />
        <path d="M592 612 Q604 602 616 612 Q628 622 640 612" {...stroke} strokeWidth={12} />
        <SweatDrop x={800} y={440} />
      </>
    ),
    lean: -5,
  },
};

const FRAME = '351 287 553 678';
const isPose = (mood: MappoMood): mood is PoseMood => mood in POSES;

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
export function Mappo({ mood = 'default', className, title, animated = false }: MappoProps) {
  const pose: Pose = isPose(mood)
    ? POSES[mood]
    : { face: FeaturesFor[mood === 'explorer' ? 'blush' : mood], viewBox: mood === 'key' ? '351 287 760 678' : FRAME };
  const { face: Face, front: Front, behind: Behind } = pose;
  const pin = (
    <>
      <path
        fill={BLUE}
        d="M618.1 956.5C603.5 952.4 594.5 944.4 563.5 907.4C543.2 883.3 495.7 823.6 471.3 791.5C466.3 784.9 456.5 772.3 449.6 763.5C402.6 703.7 387.5 678.9 373.4 637.7C343.5 550.6 360.8 451.1 417.3 385.5C466.3 328.5 546.1 295.7 636.0 295.7C787.4 295.6 887.3 385.6 896.0 530.1C900.5 605.4 879.5 667.2 825.4 737.6C793.1 779.7 741.0 844.7 706.6 885.9C650.4 953.3 639.0 962.3 618.1 956.5Z"
      />
      <path
        fill={CREAM}
        fillRule="evenodd"
        d="M579.5 708.0C541.8 705.7 511.3 695.1 490.0 676.8C440.0 633.9 422.5 531.2 454.3 467.1C466.8 442.0 487.7 422.1 516.5 408.0C567.3 383.1 645.7 374.3 701.5 387.2C766.3 402.2 801.1 444.3 813.1 522.5C815.2 535.9 814.7 570.2 812.1 584.5C800.9 648.4 761.5 682.6 679.3 700.0C645.5 707.1 610.8 709.9 579.5 708.0Z"
      />
      <Face />
    </>
  );
  return (
    <svg
      viewBox={pose.viewBox ?? FRAME}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animated && 'mappo-animated', className)}
      style={{ overflow: 'visible' }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-mood={mood}
    >
      {Behind && <Behind />}
      {pose.lean ? <g transform={`rotate(${pose.lean} 628 940)`}>{pin}</g> : pin}
      {Front && <Front />}
      {mood === 'explorer' && <ExplorerCap />}
    </svg>
  );
}
