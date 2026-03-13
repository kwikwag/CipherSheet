import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC_DIR = 'apps-script/src';
const DIST_DIR = 'apps-script/dist';
const TS_CONFIG = 'tsconfig.apps-script.json';

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

if (!existsSync(SRC_DIR)) {
  throw new Error(`Missing source directory: ${SRC_DIR}`);
}

rmSync(DIST_DIR, { recursive: true, force: true });
ensureDir(DIST_DIR);

const tscCli = 'node_modules/typescript/bin/tsc';
if (!existsSync(tscCli)) {
  throw new Error('TypeScript is not installed. Run: npm install');
}

execFileSync(process.execPath, [tscCli, '--project', TS_CONFIG], {
  stdio: 'inherit'
});

for (const file of walk(SRC_DIR)) {
  if (extname(file) === '.ts') continue;
  const rel = relative(SRC_DIR, file);
  const dest = join(DIST_DIR, rel);
  ensureDir(dirname(dest));
  cpSync(file, dest);
}

console.log(`Built Apps Script files into ${DIST_DIR}`);
