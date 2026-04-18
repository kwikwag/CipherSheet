import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const SERVER_DIR  = 'apps-script/server';
const CLIENT_DIR  = 'apps-script/client';
const DIST_DIR    = 'apps-script/dist';
const DIST_CLIENT = 'apps-script/dist-client';
const TS_CONFIG   = 'tsconfig.apps-script.json';

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

if (!existsSync(SERVER_DIR)) {
  throw new Error(`Missing server source directory: ${SERVER_DIR}`);
}
if (!existsSync(CLIENT_DIR)) {
  throw new Error(`Missing client source directory: ${CLIENT_DIR}`);
}

// ── Clean dist ──────────────────────────────────────────────────
rmSync(DIST_DIR, { recursive: true, force: true });
rmSync(DIST_CLIENT, { recursive: true, force: true });
ensureDir(DIST_DIR);

// ── 1. Compile server TypeScript ────────────────────────────────
const tscCli = 'node_modules/typescript/bin/tsc';
if (!existsSync(tscCli)) {
  throw new Error('TypeScript is not installed. Run: npm install');
}
execFileSync(process.execPath, [tscCli, '--project', TS_CONFIG], { stdio: 'inherit' });

// ── 2. Copy server non-TS assets to dist ────────────────────────
for (const file of walk(SERVER_DIR)) {
  if (extname(file) === '.ts') continue;
  const rel  = relative(SERVER_DIR, file);
  const dest = join(DIST_DIR, rel);
  ensureDir(dirname(dest));
  cpSync(file, dest);
}

// ── 3. Build client with Vite ───────────────────────────────────
const viteCli = 'node_modules/vite/bin/vite.js';
if (!existsSync(viteCli)) {
  throw new Error('Vite is not installed. Run: npm install');
}
execFileSync(process.execPath, [viteCli, 'build', '--config', join(CLIENT_DIR, 'vite.config.ts')], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

// ── 4. Wrap sidebar.js as sidebar-script.html ───────────────────
const sidebarJs   = join(DIST_CLIENT, 'sidebar.js');
const sidebarHtml = join(DIST_DIR, 'sidebar-script.html');
writeFileSync(sidebarHtml, `<script>\n${readFileSync(sidebarJs, 'utf8')}</script>\n`);

// ── 5. Clean up intermediate client dist ───────────────────────
rmSync(DIST_CLIENT, { recursive: true, force: true });

console.log(`Built Apps Script files into ${DIST_DIR}`);
