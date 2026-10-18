import React, { useId } from 'react';

/*
 * Drawn scenes for PinDropHero. Everything sits in a 760 × 196 frame whose middle (380) is the
 * middle of the popup; Mappo's tip lands at (380, 150). Keep scene pieces between x 210 and 550
 * and y 46 and 172 so they show on a phone and in the compact hero too.
 */

const C = {
  bg: 'hsl(var(--background))',
  fg: 'hsl(var(--foreground))',
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
  primary: 'hsl(var(--primary))',
  danger: 'hsl(var(--destructive))',
  wish: 'hsl(var(--wish))',
  ok: '#2fbf6c',
  gold: '#f6b83d',
  ink: '#122d56',
};

const lift = { filter: 'drop-shadow(0 2px 4px rgba(18, 45, 86, 0.18))' };

/** A city by the water: land with a street grid, parks, a highway and a bridge over the inlet. 1400 wide. */
function BaseMap() {
  const id = useId();
  const grid = `${id}-grid`;
  const land =
    'M-50 78 C60 60 150 34 250 46 C330 56 380 92 410 128 C428 150 452 156 470 140 C500 112 540 86 610 76 C700 64 760 88 850 62 C930 40 1010 36 1080 58 C1150 80 1200 104 1270 84 C1330 66 1390 58 1450 62 L1450 220 L-50 220Z';
  return (
    <g>
      <defs>
        <pattern id={grid} width={34} height={34} patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
          <path d="M0 0 H34 M0 0 V34" stroke="var(--map-street)" strokeWidth={2} fill="none" />
        </pattern>
      </defs>
      <rect x={-50} y={-20} width={1500} height={240} fill="var(--map-water)" />
      <path d={land} fill="var(--map-land)" />
      <path d={land} fill={`url(#${grid})`} />
      <path d="M500 34 C520 14 590 8 630 20 C660 30 650 48 620 52 C580 58 520 56 500 34Z" fill="var(--map-land)" />
      <path d="M1150 26 C1170 12 1230 14 1240 30 C1246 42 1210 50 1180 46 C1160 44 1144 36 1150 26Z" fill="var(--map-land)" />
      <ellipse cx={230} cy={148} rx={58} ry={22} fill="var(--map-park)" />
      <path d="M720 128 C740 110 800 112 820 128 C836 142 800 160 760 158 C730 156 708 142 720 128Z" fill="var(--map-park)" />
      <ellipse cx={1090} cy={126} rx={62} ry={18} fill="var(--map-park)" />
      <ellipse cx={575} cy={33} rx={26} ry={9} fill="var(--map-park)" />
      {[
        'M-50 168 C200 150 300 182 450 172 S700 122 900 138 S1200 176 1450 152',
        'M120 220 C140 150 200 96 262 56',
        'M600 220 C618 160 676 116 724 90',
        'M980 220 C1000 160 1040 124 1104 90',
      ].map((d) => (
        <g key={d}>
          <path d={d} stroke="var(--map-road-casing)" strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d={d} stroke="var(--map-road)" strokeWidth={5.5} fill="none" strokeLinecap="round" />
        </g>
      ))}
      <path d="M392 118 L506 100" stroke="var(--map-road-casing)" strokeWidth={9} strokeLinecap="round" />
      <path d="M392 118 L506 100" stroke="var(--map-road)" strokeWidth={5.5} strokeLinecap="round" />
      <path d="M424 113 V100 M474 105 V92" stroke="var(--map-road-casing)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/* ---------- small UI pieces ---------- */

function Card({ x, y, w, h, r = 8, dashed = false }: { x: number; y: number; w: number; h: number; r?: number; dashed?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={r}
      fill={C.bg}
      stroke={dashed ? C.muted : C.border}
      strokeWidth={dashed ? 1.6 : 1.2}
      strokeDasharray={dashed ? '4 4' : undefined}
    />
  );
}

function Line({ x, y, w, o = 0.6, h = 5 }: { x: number; y: number; w: number; o?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={C.fg} opacity={o} />;
}

function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y} l0 17 l4.6 -4.4 l3.2 7 l3.2 -1.4 l-3.1 -6.8 l6.2 -0.4Z`}
      fill={C.fg}
      stroke={C.bg}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  );
}

function Check({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={C.ok} stroke={C.bg} strokeWidth={2} />
      <path d={`M${x - 4} ${y} l2.8 2.8 l5 -5.4`} stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function MiniMap({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--map-water)" />
      <path d={`M${x} ${y + h * 0.55} C${x + w * 0.3} ${y + h * 0.3} ${x + w * 0.6} ${y + h * 0.7} ${x + w} ${y + h * 0.4} V${y + h} H${x}Z`} fill="var(--map-land)" />
      <path d={`M${x + w * 0.15} ${y + h * 0.8} C${x + w * 0.4} ${y + h * 0.5} ${x + w * 0.6} ${y + h * 0.9} ${x + w * 0.85} ${y + h * 0.6}`} stroke={C.primary} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ---------- scenes ---------- */

/** The editor doesn't fit a phone: its toolbar and timeline spill out of the frame. A laptop fits it all. */
function MobileScene() {
  const spill = { stroke: C.danger, strokeWidth: 1.4, strokeDasharray: '3 3', fill: 'none' };
  return (
    <g>
      <g style={lift}>
        <rect x={238} y={50} width={52} height={96} rx={10} fill={C.bg} stroke={C.fg} strokeWidth={2.4} />
        <MiniMap x={243} y={66} w={42} h={56} />
        {[245, 256, 267, 278].map((x) => <rect key={x} x={x} y={56} width={8} height={7} rx={2} fill={C.fg} opacity={0.55} />)}
        <rect x={244} y={128} width={40} height={8} rx={3} fill={C.primary} opacity={0.75} />
      </g>
      {/* What doesn't fit */}
      <rect x={289} y={56} width={8} height={7} rx={2} {...spill} />
      <rect x={300} y={56} width={8} height={7} rx={2} {...spill} />
      <rect x={284} y={128} width={26} height={8} rx={3} {...spill} />
      <g style={lift}>
        <rect x={448} y={70} width={76} height={50} rx={6} fill={C.bg} stroke={C.fg} strokeWidth={2.4} />
        <path d="M440 120 H532 L527 127 H445Z" fill={C.fg} opacity={0.85} />
        {[453, 462, 471, 480, 489].map((x) => <rect key={x} x={x} y={75} width={6} height={5} rx={1.5} fill={C.fg} opacity={0.5} />)}
        <rect x={453} y={84} width={14} height={24} rx={2} fill={C.fg} opacity={0.12} />
        <MiniMap x={470} y={84} w={49} h={24} />
        <rect x={453} y={110} width={66} height={6} rx={2} fill={C.primary} opacity={0.75} />
      </g>
      <Check x={520} y={70} />
    </g>
  );
}

/** Where the tour starts: the Route button in the toolbar, then Export. A trip runs to where Mappo lands. */
function TourScene() {
  return (
    <g>
      <path d="M236 132 C268 92 306 168 344 150 S370 146 380 150" stroke={C.primary} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray="0.1 9" />
      <circle cx={236} cy={132} r={6} fill={C.bg} stroke={C.primary} strokeWidth={3.5} />
      <g style={lift}>
        <rect x={214} y={50} width={124} height={30} rx={15} fill={C.bg} stroke={C.border} strokeWidth={1.2} />
        {[230, 252, 296, 318].map((x) => <rect key={x} x={x - 5} y={60} width={10} height={10} rx={3} fill={C.fg} opacity={0.4} />)}
      </g>
      <circle className="pin-drop-pulse" cx={274} cy={65} r={16} fill="none" stroke={C.primary} strokeWidth={2} />
      <circle cx={274} cy={65} r={11} fill={C.primary} />
      <path d="M268 69 C271 61 276 70 280 61" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Cursor x={280} y={74} />
      <g style={lift}>
        <rect x={446} y={52} width={78} height={26} rx={13} fill={C.primary} />
        <text x={485} y={69} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff" fontFamily="inherit">Export</text>
      </g>
    </g>
  );
}

/** A trip card on its way to the bin. */
function DeleteScene() {
  return (
    <g>
      <g transform="rotate(-7 268 100)" style={lift}>
        <Card x={222} y={60} w={92} h={76} />
        <MiniMap x={228} y={66} w={80} h={38} />
        <Line x={228} y={112} w={58} o={0.7} />
        <Line x={228} y={122} w={38} o={0.35} />
      </g>
      <g style={lift}>
        <path d="M466 96 H514 L509 146 H471Z" fill={C.bg} stroke={C.fg} strokeWidth={2.4} strokeLinejoin="round" />
        <path d="M480 106 L482 136 M490 106 V136 M500 106 L498 136" stroke={C.fg} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        <g transform="rotate(-20 466 90)">
          <rect x={462} y={84} width={56} height={8} rx={3} fill={C.danger} />
          <rect x={482} y={78} width={16} height={7} rx={2} fill={C.danger} />
        </g>
      </g>
    </g>
  );
}

/** Every cloud slot is taken and one more project wants in. */
function CloudSlotsScene() {
  const cloud = (x: number, y: number) => (
    <path d={`M${x - 8} ${y + 5} a5 5 0 0 1 1 -10 a7 7 0 0 1 13 1 a4.5 4.5 0 0 1 2 9Z`} fill={C.primary} />
  );
  return (
    <g>
      <g style={lift}>
        <Card x={222} y={78} w={64} h={52} dashed />
        <path d="M254 116 V96 M246 104 L254 96 L262 104" stroke={C.muted} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {[446, 482, 518].map((x) => (
        <g key={x} style={lift}>
          <Card x={x} y={74} w={30} h={40} r={6} />
          {cloud(x + 15, 90)}
          <Line x={x + 6} y={102} w={18} o={0.35} h={4} />
        </g>
      ))}
      <text x={498} y={130} textAnchor="middle" fontSize={11} fontWeight={600} fill={C.fg} fontFamily="inherit" opacity={0.75}>3 of 3</text>
    </g>
  );
}

/** A fresh 16:9 frame around the spot. */
function NewProjectScene() {
  const b = (d: string) => <path d={d} stroke={C.primary} strokeWidth={3} fill="none" strokeLinecap="round" />;
  return (
    <g>
      <rect x={284} y={54} width={192} height={108} fill={C.primary} opacity={0.07} />
      {b('M284 70 V54 H300')}
      {b('M460 54 H476 V70')}
      {b('M284 146 V162 H300')}
      {b('M460 162 H476 V146')}
      <g style={lift}>
        <rect x={292} y={61} width={36} height={18} rx={5} fill={C.bg} />
        <text x={310} y={74} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={C.fg} fontFamily="inherit">16:9</text>
      </g>
    </g>
  );
}

/** Past trips around town. */
function LibraryScene() {
  const trip = (d: string, color: string, end: [number, number]) => (
    <g>
      <path d={d} stroke={color} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeDasharray="0.1 8" />
      <circle cx={end[0]} cy={end[1]} r={6.5} fill={color} stroke={C.bg} strokeWidth={2.5} />
    </g>
  );
  return (
    <g>
      {trip('M218 136 C236 104 266 122 292 88', C.wish, [292, 88])}
      {trip('M450 92 C474 70 508 104 538 74', 'hsl(var(--item-route))', [538, 74])}
      {trip('M458 158 C486 146 516 166 546 140', 'hsl(var(--item-boundary))', [546, 140])}
    </g>
  );
}

/** Not built yet: a barrier on the road and a sign. */
function SoonScene() {
  const id = useId();
  const stripes = `${id}-stripes`;
  const cone = (x: number) => (
    <g key={x}>
      <path d={`M${x - 9} 146 L${x - 3} 118 H${x + 3} L${x + 9} 146Z`} fill={C.wish} />
      <rect x={x - 6.5} y={128} width={13} height={5} fill="#fff" />
      <rect x={x - 13} y={145} width={26} height={4} rx={2} fill={C.fg} opacity={0.7} />
    </g>
  );
  return (
    <g>
      <defs>
        <pattern id={stripes} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={7} height={14} fill={C.wish} />
          <rect x={7} width={7} height={14} fill="#fff" />
        </pattern>
      </defs>
      {cone(236)}
      {cone(266)}
      <g style={lift}>
        <path d="M462 116 L456 148 M532 116 L538 148" stroke={C.fg} strokeWidth={3} strokeLinecap="round" />
        <rect x={448} y={100} width={96} height={18} rx={3} fill={`url(#${stripes})`} stroke={C.fg} strokeWidth={1.4} />
        <rect x={472} y={70} width={48} height={20} rx={5} fill={C.fg} />
        <text x={496} y={84} textAnchor="middle" fontSize={10.5} fontWeight={700} letterSpacing={1} fill={C.bg} fontFamily="inherit">SOON</text>
        <path d="M496 90 V100" stroke={C.fg} strokeWidth={2.5} />
      </g>
    </g>
  );
}

/** What the Wanderer plan unlocks, behind a gold padlock. */
function UpgradeScene() {
  const chip = (x: number, y: number, w: number, label: string) => (
    <g style={lift}>
      <rect x={x} y={y} width={w} height={22} rx={11} fill={C.bg} stroke={C.border} strokeWidth={1.2} />
      <text x={x + w / 2} y={y + 15} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.fg} fontFamily="inherit">{label}</text>
    </g>
  );
  return (
    <g>
      {chip(222, 66, 40, '4K')}
      {chip(232, 98, 62, '60 FPS')}
      {chip(220, 130, 60, 'No mark')}
      <g style={lift}>
        <path d="M478 104 V92 a14 14 0 0 1 28 0 V104" stroke={C.ink} strokeWidth={6} fill="none" />
        <rect x={466} y={102} width={52} height={42} rx={9} fill={C.gold} stroke={C.ink} strokeWidth={3} />
        <circle cx={492} cy={119} r={5} fill={C.ink} />
        <rect x={489.5} y={121} width={5} height={12} rx={2} fill={C.ink} />
      </g>
    </g>
  );
}

/** Finished videos, and one still rendering. */
function RendersScene() {
  const thumb = (x: number, y: number, r: number) => (
    <g transform={`rotate(${r} ${x + 30} ${y + 20})`} style={lift}>
      <Card x={x} y={y} w={60} h={40} r={6} />
      <MiniMap x={x + 4} y={y + 4} w={52} h={32} />
      <path d={`M${x + 26} ${y + 13} l10 7 l-10 7Z`} fill="#fff" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
    </g>
  );
  return (
    <g>
      {thumb(222, 66, -8)}
      {thumb(240, 104, 5)}
      <g style={lift}>
        <Card x={444} y={82} w={104} h={36} />
        <circle cx={456} cy={94} r={4} fill="#ff3b30" />
        <Line x={464} y={91} w={40} o={0.6} />
        <rect x={452} y={104} width={88} height={6} rx={3} fill={C.primary} opacity={0.2} />
        <rect x={452} y={104} width={60} height={6} rx={3} fill={C.primary} />
      </g>
    </g>
  );
}

/** Coins for cloud rendering credits. */
function CreditsScene() {
  const stack = (x: number, n: number) => (
    <g key={x} style={lift}>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <ellipse cx={x} cy={146 - i * 7} rx={16} ry={6} fill={C.gold} stroke={C.ink} strokeWidth={1.6} />
        </g>
      ))}
      <ellipse cx={x} cy={146 - (n - 1) * 7} rx={8} ry={3} fill="none" stroke={C.ink} strokeWidth={1.2} opacity={0.6} />
    </g>
  );
  return <g>{[stack(232, 4), stack(268, 6), stack(486, 7), stack(524, 3)]}</g>;
}

/** Your account: a settings card with switches. */
function SettingsScene() {
  const row = (y: number, on: boolean) => (
    <g key={y}>
      <Line x={456} y={y + 3} w={44} o={0.55} />
      <rect x={512} y={y} width={24} height={13} rx={6.5} fill={on ? C.primary : C.border} />
      <circle cx={on ? 529 : 519} cy={y + 6.5} r={4.5} fill="#fff" />
    </g>
  );
  return (
    <g>
      <g style={lift}>
        <circle cx={252} cy={104} r={18} fill="none" stroke={C.fg} strokeWidth={8} strokeDasharray="5.6 3.8" opacity={0.8} />
        <circle cx={252} cy={104} r={11} fill={C.bg} stroke={C.fg} strokeWidth={3} opacity={0.9} />
      </g>
      <g style={lift}>
        <Card x={444} y={62} w={104} h={76} />
        {row(72, true)}
        {row(94, false)}
        {row(116, true)}
      </g>
    </g>
  );
}

/** Check in for the trip: a sign-in card and a suitcase. */
function SignInScene() {
  return (
    <g>
      <g style={lift}>
        <rect x={226} y={100} width={50} height={44} rx={7} fill={C.wish} />
        <path d="M242 100 V92 a4 4 0 0 1 4 -4 h10 a4 4 0 0 1 4 4 V100" stroke={C.fg} strokeWidth={3} fill="none" />
        <path d="M240 100 V144 M262 100 V144" stroke="#fff" strokeWidth={3} opacity={0.8} />
      </g>
      <g style={lift}>
        <Card x={444} y={56} w={104} h={86} />
        <Line x={454} y={66} w={44} o={0.7} />
        <rect x={454} y={78} width={84} height={14} rx={4} fill="none" stroke={C.border} strokeWidth={1.4} />
        <rect x={454} y={98} width={84} height={14} rx={4} fill="none" stroke={C.border} strokeWidth={1.4} />
        <rect x={454} y={120} width={84} height={14} rx={4} fill={C.primary} />
      </g>
    </g>
  );
}

/** An AI agent reaching into the project: a chat bubble and the tools it can use. */
function ConnectScene() {
  const tool = (x: number, y: number, glyph: React.ReactNode) => (
    <g style={lift}>
      <rect x={x} y={y} width={26} height={26} rx={8} fill={C.bg} stroke={C.border} strokeWidth={1.2} />
      {glyph}
    </g>
  );
  return (
    <g>
      <g style={lift}>
        <path d="M222 58 h86 a8 8 0 0 1 8 8 v34 a8 8 0 0 1 -8 8 h-60 l-12 10 v-10 h-14 a8 8 0 0 1 -8 -8 v-34 a8 8 0 0 1 8 -8Z" fill={C.bg} stroke={C.border} strokeWidth={1.2} />
        <path d="M238 70 q1.5 6 7.5 7.5 q-6 1.5 -7.5 7.5 q-1.5 -6 -7.5 -7.5 q6 -1.5 7.5 -7.5Z" fill={C.primary} />
        <Line x={252} y={74} w={52} o={0.6} />
        <Line x={252} y={86} w={36} o={0.35} />
      </g>
      {tool(448, 66, <path d="M455 85 C460 73 467 86 472 74" stroke={C.primary} strokeWidth={2.2} fill="none" strokeLinecap="round" />)}
      {tool(484, 92, <><rect x={490} y={100} width={11} height={9} rx={2} fill={C.fg} opacity={0.7} /><path d="M501 103 l4 -2 v8 l-4 -2Z" fill={C.fg} opacity={0.7} /></>)}
      {tool(516, 62, <rect x={522} y={70} width={14} height={10} rx={3} fill={C.wish} />)}
      <Cursor x={472} y={84} />
    </g>
  );
}

const SCENES = {
  mobile: { center: 520, Scene: MobileScene },
  tour: { center: 330, Scene: TourScene },
  delete: { center: 760, Scene: DeleteScene },
  cloudSlots: { center: 980, Scene: CloudSlotsScene },
  newProject: { center: 640, Scene: NewProjectScene },
  library: { center: 1050, Scene: LibraryScene },
  soon: { center: 430, Scene: SoonScene },
  upgrade: { center: 900, Scene: UpgradeScene },
  renders: { center: 600, Scene: RendersScene },
  credits: { center: 1000, Scene: CreditsScene },
  settings: { center: 1040, Scene: SettingsScene },
  signIn: { center: 820, Scene: SignInScene },
  connect: { center: 360, Scene: ConnectScene },
};

export type PinDropSceneName = keyof typeof SCENES;

/** The stylised map, slid so the scene's part of town sits in the middle, with the scene drawn on top. */
export function PinDropScene({ scene }: { scene: PinDropSceneName }) {
  const { center, Scene } = SCENES[scene];
  return (
    <>
      <g transform={`translate(${380 - center} 0)`}>
        <BaseMap />
      </g>
      <Scene />
    </>
  );
}
