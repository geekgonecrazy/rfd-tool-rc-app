# Agent Guidelines

## Build & Validation

**Always run and verify the build before committing any changes.**

### Setup

```bash
npm install
```

### Verify the build passes

```bash
npm ci && npx tsc
```

Both commands must succeed without errors before committing. If `package.json` dependencies are changed, run `npm install` to regenerate `package-lock.json`, then verify `npm ci` still succeeds.

### Package the app

```bash
rc-apps package
```

## Key Files

- `RfdDiscussionsApp.ts` – App entry point
- `app.json` – App metadata and configuration
- `settings.ts` – App settings definitions
- `endpoints/` – HTTP endpoint handlers
- `lib/` – Shared utilities and helpers
- `tsconfig.json` – TypeScript compiler configuration
