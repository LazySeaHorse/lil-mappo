#!/usr/bin/env node
/**
 * Callout filmstrip: renders a style's entrance (and optionally exit) as a PNG
 * contact sheet using the real frame pipeline, so you can look at a style's
 * choreography, fonts and legibility without running the app. Dev tool only;
 * not part of CI.
 *
 *   node scripts/callout-filmstrip/run.mjs --style leader-line --out /tmp/strip.png
 *   node scripts/callout-filmstrip/run.mjs --style leader-line --spec scripts/callout-filmstrip/examples/leader-line.json --out /tmp/strip.png
 *
 * Options
 *   --style <id>     registered style id (required unless the spec has styleId)
 *   --out <file>     PNG to write (default ./callout-filmstrip.png)
 *   --spec <file>    JSON overriding any FilmstripSpec field (see harness.ts):
 *                    variants [{name, content, settings?, offset?, altitude?, scale?, ground?}],
 *                    backgrounds {name: colour}, samples, exit, cellWidth, cellHeight, showBounds
 *   --exit           also sample the exit
 *
 * Every variant is drawn on every background: one row each; columns are
 * entrance samples, a settled frame, then exit samples. Dashed red boxes are the
 * frame bounds (the canvas the app would allocate); anything outside them would
 * be cropped in the app.
 *
 * Needs Playwright's Chromium (set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use another
 * browser). Fonts are the @fontsource files imported in src/index.css.
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

function parseArgs(argv) {
  const args = { out: 'callout-filmstrip.png' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exit') args.exit = true;
    else if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const fromFile = args.spec ? JSON.parse(fs.readFileSync(args.spec, 'utf8')) : {};
const spec = {
  styleId: args.style,
  variants: [
    { name: 'title+subtitle', content: { title: 'Harbour Bridge', subtitle: 'Sydney, Australia' } },
    { name: 'title', content: { title: 'Mont Blanc' } },
  ],
  backgrounds: { grey: '#7c828a', light: '#e9e5db' },
  samples: 8,
  exit: false,
  cellWidth: 300,
  cellHeight: 190,
  showBounds: true,
  ...fromFile,
  ...(args.exit ? { exit: true } : {}),
};
if (!spec.styleId) {
  console.error('Missing --style <id> (or styleId in the spec).');
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'callout-filmstrip-'));
const bundle = path.join(work, 'harness.js');
await build({
  entryPoints: [path.join(here, 'harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: bundle,
  alias: { '@': path.join(repo, 'src') },
  absWorkingDir: repo,
  logLevel: 'error',
});

// Font faces: every @fontsource import in the app's stylesheet.
const fontCss = [...fs.readFileSync(path.join(repo, 'src/index.css'), 'utf8').matchAll(/@import '@fontsource\/([^']+)';/g)]
  .map(([, file]) => `<link rel=stylesheet href="/fontsource/${file}">`)
  .join('');
const html = `<!doctype html><meta charset=utf-8>${fontCss}<style>body{margin:0}</style><canvas id=c></canvas><script src=/harness.js></script>`;
const types = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url ?? '/');
  if (url === '/') return res.end(html);
  if (url === '/harness.js') return res.end(fs.readFileSync(bundle));
  if (url.startsWith('/fontsource/') && !url.includes('..')) {
    const file = path.join(repo, 'node_modules/@fontsource', url.slice('/fontsource/'.length));
    if (fs.existsSync(file)) {
      res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
      return res.end(fs.readFileSync(file));
    }
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((resolve) => server.listen(0, resolve));

/** Playwright's own Chromium, or a shared cache copy like playwright.config.ts uses. */
function chromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const own = chromium.executablePath();
  if (fs.existsSync(own)) return own;
  const root = path.join(os.homedir(), '.cache', 'ms-playwright');
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)) : []) {
    for (const platform of ['chrome-linux', 'chrome-linux64', 'chrome-linux-arm64']) {
      const candidate = path.join(root, dir, platform, 'chrome');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return own;
}

const browser = await chromium.launch({
  executablePath: chromiumExecutable(),
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error('page error:', error.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate((s) => window.renderFilmstrip(document.getElementById('c'), s), spec);
  await page.locator('#c').screenshot({ path: args.out });
  console.log('wrote', path.resolve(args.out));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
