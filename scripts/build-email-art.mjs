// Renders the Mappo PNGs used by the email templates in supabase/*.html.
// Usage: node scripts/build-email-art.mjs   (needs chromium; writes public/email/*.png at 2x, transparent)
// Mirrors the face paths in src/components/Mappo/Mappo.tsx. Email clients strip SVG, hence PNG.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const INK = '#122d56', BLUE = '#1c6bde', CREAM = '#fdf8ec', BLUSH = '#f28b9b', GOLD = '#f5b942';
const out = new URL('../public/email/', import.meta.url).pathname;
const tmp = join(homedir(), 'mappo-email-art-tmp');
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });

const PIN = 'M618.1 956.5C603.5 952.4 594.5 944.4 563.5 907.4C543.2 883.3 495.7 823.6 471.3 791.5C466.3 784.9 456.5 772.3 449.6 763.5C402.6 703.7 387.5 678.9 373.4 637.7C343.5 550.6 360.8 451.1 417.3 385.5C466.3 328.5 546.1 295.7 636.0 295.7C787.4 295.6 887.3 385.6 896.0 530.1C900.5 605.4 879.5 667.2 825.4 737.6C793.1 779.7 741.0 844.7 706.6 885.9C650.4 953.3 639.0 962.3 618.1 956.5Z';
const FACE = 'M579.5 708.0C541.8 705.7 511.3 695.1 490.0 676.8C440.0 633.9 422.5 531.2 454.3 467.1C466.8 442.0 487.7 422.1 516.5 408.0C567.3 383.1 645.7 374.3 701.5 387.2C766.3 402.2 801.1 444.3 813.1 522.5C815.2 535.9 814.7 570.2 812.1 584.5C800.9 648.4 761.5 682.6 679.3 700.0C645.5 707.1 610.8 709.9 579.5 708.0Z';
const L = { x: 523, y: 562 }, R = { x: 693, y: 540 };
const st = `fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"`;
const eyes = `<ellipse cx="${L.x}" cy="${L.y}" rx="23" ry="40" fill="${INK}"/><ellipse cx="${R.x}" cy="${R.y}" rx="23" ry="40" fill="${INK}"/>`;
const sparkle = (x, y) => `<path fill="${INK}" d="M${x} ${y-44} Q${x+6} ${y-6} ${x+40} ${y} Q${x+6} ${y+6} ${x} ${y+44} Q${x-6} ${y+6} ${x-40} ${y} Q${x-6} ${y-6} ${x} ${y-44}Z"/>`;
const blush = `<ellipse cx="${L.x-18}" cy="${L.y+62}" rx="34" ry="20" fill="${BLUSH}" opacity=".55"/><ellipse cx="${R.x+18}" cy="${R.y+62}" rx="34" ry="20" fill="${BLUSH}" opacity=".55"/>`;
const openSmile = `<path d="M580 592 Q616 650 652 592 Q616 606 580 592Z" fill="${INK}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>`;
const smallSmile = `<path d="M588 600 Q616 620 644 598" ${st}/>`;
const brow = (x, y, t) => `<path d="M${x-30} ${y+t} L${x+30} ${y-t}" ${st.replace('stroke-width="15"','stroke-width="13"')}/>`;
const faces = {
  happy: eyes + openSmile,
  curious: eyes + smallSmile,
  sparkle: sparkle(L.x, L.y - 6) + sparkle(R.x, R.y - 6) + blush + openSmile,
  blush: eyes + blush + `<path d="M584 598 Q600 624 616 603 Q632 624 648 598" ${st}/>`,
  inquisitive: eyes + brow(R.x, R.y - 66, 10) + `<ellipse cx="622" cy="608" rx="13" ry="11" fill="${INK}"/>`,
};

const arm = (d) => `<path d="${d}" fill="none" stroke="${BLUE}" stroke-width="40" stroke-linecap="round"/>`;
const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="30" fill="${BLUE}" stroke="${INK}" stroke-width="8"/>`;
const envelope = (cx, cy, rot, seal = BLUSH) => `<g transform="rotate(${rot} ${cx} ${cy})">
  <rect x="${cx-150}" y="${cy-100}" width="300" height="200" rx="18" fill="${CREAM}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M${cx-146} ${cy-92} L${cx} ${cy+20} L${cx+146} ${cy-92}" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M${cx-142} ${cy+92} L${cx-40} ${cy-6} M${cx+142} ${cy+92} L${cx+40} ${cy-6}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" opacity=".45"/>
  <circle cx="${cx}" cy="${cy+18}" r="28" fill="${seal}" stroke="${INK}" stroke-width="7"/>
  <path d="M${cx} ${cy+31} C${cx-22} ${cy+16} ${cx-14} ${cy+2} ${cx} ${cy+11} C${cx+14} ${cy+2} ${cx+22} ${cy+16} ${cx} ${cy+31}Z" fill="${CREAM}"/></g>`;
const star = (x, y, s, c = GOLD) => `<path transform="translate(${x} ${y}) scale(${s})" fill="${c}" stroke="${INK}" stroke-width="${6/s}" stroke-linejoin="round" d="M0 -40 L11 -12 L40 -10 L17 8 L25 36 L0 20 L-25 36 L-17 8 L-40 -10 L-11 -12Z"/>`;
const key = (cx, cy, rot) => `<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${cx+30}" y="${cy-18}" width="190" height="36" rx="10" fill="${GOLD}" stroke="${INK}" stroke-width="9"/><rect x="${cx+150}" y="${cy+14}" width="26" height="46" rx="6" fill="${GOLD}" stroke="${INK}" stroke-width="9"/><rect x="${cx+190}" y="${cy+14}" width="22" height="34" rx="6" fill="${GOLD}" stroke="${INK}" stroke-width="9"/><circle cx="${cx}" cy="${cy}" r="56" fill="${GOLD}" stroke="${INK}" stroke-width="10"/><circle cx="${cx}" cy="${cy}" r="22" fill="${CREAM}" stroke="${INK}" stroke-width="8"/></g>`;
const flag = (x, y) => `<g><path d="M${x} ${y} L${x} ${y-330}" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M${x+6} ${y-326} L${x+150} ${y-276} L${x+6} ${y-216}Z" fill="${BLUSH}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/></g>`;
const lock = (cx, cy) => `<g><path d="M${cx-60} ${cy-60} V${cy-100} a60 60 0 0 1 120 0 V${cy-60}" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/><rect x="${cx-95}" y="${cy-70}" width="190" height="150" rx="26" fill="${GOLD}" stroke="${INK}" stroke-width="10"/><circle cx="${cx}" cy="${cy-6}" r="18" fill="${INK}"/><rect x="${cx-7}" y="${cy-6}" width="14" height="46" rx="6" fill="${INK}"/></g>`;

// holder (right-hand arm) + prop per asset
const items = {
  'mappo-letter': { mood: 'happy', front: arm('M850 735 Q905 770 925 800') + envelope(950, 840, 9) + hand(890, 770) + hand(1010, 878), extra: star(1040, 700, .9) + star(350, 480, .6, '#ffffff') },
  'mappo-magic': { mood: 'sparkle', front: arm('M850 735 Q910 700 950 640') + `<path d="M955 632 L1010 548" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>` + star(1020, 530, 1.5) + hand(955, 632) , extra: star(1050, 760, .7) + star(380, 360, .8) + star(1070, 470, .55, '#ffffff') },
  'mappo-key': { mood: 'curious', front: arm('M850 735 Q900 780 925 815') + key(965, 800, -50) + hand(925, 815) , extra: star(400, 330, .6, '#ffffff') },
  'mappo-invite': { mood: 'blush', front: arm('M850 735 Q920 770 940 800') + flag(965, 955) + hand(948, 800), extra: star(400, 330, .7) },
  'mappo-change': { mood: 'inquisitive', front: arm('M850 735 Q905 770 925 800') + envelope(950, 840, -8, '#ffffff') + hand(890, 770) + hand(1010, 878), extra: star(1040, 700, .7, '#ffffff') },
  'mappo-code': { mood: 'curious', front: arm('M850 735 Q900 775 925 800') + lock(985, 790) + hand(925, 805), extra: star(1050, 600, .6) },
  'mappo-mark': { mood: null, mark: true },
};

for (const [name, it] of Object.entries(items)) {
  const face = it.mark ? '' : faces[it.mood];
  const eyesDefault = it.mark ? `<path fill="${INK}" fill-rule="evenodd" d="M596.8 621.9C585.3 619.2 578.0 613.2 578.0 606.4C578.0 596.3 585.6 593.0 597.0 598.0C608.9 603.2 621.4 601.0 629.4 592.3C631.1 590.4 633.7 587.6 635.2 585.9C640.5 580.1 651.7 582.9 653.6 590.4C656.1 600.6 640.8 616.1 623.1 621.4C617.2 623.1 603.1 623.4 596.8 621.9ZM517.5 598.7C513.2 596.7 508 591.2 505.9 586.4C503.3 580.6 499.7 556.8 500.3 549.5C502.2 524.7 531 519.9 541.2 542.7C544.4 550 547.7 575.7 546.2 582.6C543.4 596.1 529.2 604 517.5 598.7ZM687.5 569.1C682.8 566.9 679 563 676.1 557.5C673.9 553.1 670 531 670 522.4C670 496.6 700.6 489.6 710.9 513C714.2 520.6 717.6 546.7 716.1 553.4C713 567.4 699.6 574.7 687.5 569.1Z"/>` : '';
  const vb = it.mark ? '351 287 553 678' : '310 230 860 770';
  const [, , w, h] = vb.split(' ').map(Number);
  const shadow = it.mark ? '' : `<ellipse cx="640" cy="965" rx="230" ry="22" fill="#122d56" opacity=".14"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${shadow}${it.extra || ''}<path fill="${BLUE}" d="${PIN}"/><path fill="${CREAM}" fill-rule="evenodd" d="${FACE}"/>${face}${eyesDefault}${it.front || ''}</svg>`;
  const svgPath = join(tmp, `${name}.svg`);
  const htmlPath = join(tmp, `${name}.html`);
  const outW = it.mark ? 160 : 440, outH = Math.round(outW * h / w);
  writeFileSync(svgPath, svg);
  writeFileSync(htmlPath, `<html><body style="margin:0;background:transparent"><img src="${name}.svg" width="${outW}" height="${outH}" style="display:block"></body></html>`);
  const png = join(tmp, `${name}.png`);
  execFileSync('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--force-device-scale-factor=2', `--window-size=${outW},${outH}`, `--screenshot=${png}`, `file://${htmlPath}`], { stdio: 'ignore' });
  copyFileSync(png, join(out, `${name}.png`));
  console.log(name, `${outW}x${outH} css px (2x png)`);
}
rmSync(tmp, { recursive: true, force: true });
