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
