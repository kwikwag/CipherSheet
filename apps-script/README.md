# Apps Script Workspace

This directory is the `clasp` workspace for the add-on.

## Layout
- `src/Code.ts`: TypeScript source for server-side Apps Script code.
- `src/*.html`: Synced copies of UI files from repository root.
- `dist/`: Build output pushed by `clasp` (generated).

## Build
From repository root:

```bash
npm run build:apps-script
```

## First-time clasp setup

```bash
scripts/init-clasp.sh
```

Then set `scriptId` in `.clasp.json` and run `npx clasp login` followed by `npx clasp push --force`.
