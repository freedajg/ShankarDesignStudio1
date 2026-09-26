# Sweet Ginger Design Studio

Self-service custom apparel studio for Sweet Ginger Fashions (The T-Shirt Shop · Sweet Ginger Basics · Ginger Prints): choose a garment, design it, see it on the shirt, order one piece or a bulk size-run, and hand production a complete, printable order.

> This folder is a standalone app. The repository root contains an unrelated project (VoiceLab); nothing here depends on it.

## Quick start

```bash
cd design-studio
npm install
npm run dev          # migrates + seeds an embedded Postgres, then starts http://localhost:3000
```

No accounts, keys or Docker needed for development:

| Concern | Development | Production |
|---|---|---|
| Database | embedded PGlite in `.data/pglite` | Supabase Postgres (`DATABASE_URL`) |
| Files | `.data/storage` | Supabase Storage (private buckets) |
| Payments | **development provider — no money moves** | Razorpay |
| Email | printed to the server console | Resend |

Development staff logins (created only on the embedded dev database):

- `admin@studio.local` / `admin-dev-password` (ADMIN)
- `production@studio.local` / `production-dev-password` (PRODUCTION)

**All catalogue prices, tiers, print costs, print-area sizes, tax and shipping values are DEMO placeholders** (`is_demo = true`) until confirmed — see `docs/OPEN_QUESTIONS.md`.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | seed (idempotent) + dev server |
| `npm test` | unit + integration tests (in-memory Postgres) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` / `npm run lint` | static checks |
| `npm run db:generate` | generate a SQL migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | apply migrations / seed demo data |
| `STAFF_PASSWORD=… npm run db:user -- --email … --name … --role ADMIN` | create a staff login |
| `npm run mockups` | regenerate garment mockup layers |

## Docs

`docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/DESIGN_SYSTEM.md` · `docs/BUSINESS_RULES.md` · `docs/OPEN_QUESTIONS.md` · `docs/IMPLEMENTATION_PLAN.md` · `docs/TEST_PLAN.md`
