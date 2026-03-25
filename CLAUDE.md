# CLAUDE.md

## Project Purpose

Vehicle matching code challenge: given a set of vehicle listings (from Carsales, Facebook Marketplace, Gumtree, AutoTrader, etc.), match them to the correct vehicle records in the database.

## Commands

```bash
# To run in dev (no build step)
npm run dev
```

No test framework is configured — add one if writing tests.

## Architecture

**Stack:** Node.js + TypeScript + PostgreSQL (Docker)

- `src/db.ts` — pg connection pool (reads env vars)
- `src/index.ts` — entry point
- `sql/init.sql` — schema + seed data (auto-runs on container start)

**Database schema:**

```
vehicle (id, make, model, badge, transmission_type, fuel_type, drive_type)
listing (id, vehicle_id FK, url, price, kms)
```

## Code Style

**Write self-documenting code.** Avoid comments unless essential for complex logic or critical context (SUPER CRITICAL - ALWAYS FOLLOW THIS).

**Prefer lodash utilities for better performance and readability.** Use `_.orderBy` instead of native `sort()`, and leverage lodash functions over verbose native alternatives. Exception: Use native `filter()` and `map()` for simple array operations. Avoid `reduce()` - use `_.groupBy`, `_.keyBy`, or other lodash functions instead. For long data transformation chains, use lodash chaining (`_()`).

### Testing & Quality

- `npm run tsc` - TypeScript type checking (REQUIRED - run this to verify code quality. No other checks needed.)

## Modularization

- Flat `src/` directory — no nested folders
- One class per file, grouped by domain responsibility
- Named exports only — no default exports, no barrel files
- Constructor injection for dependencies
- Co-located tests as `{module}.test.ts`
