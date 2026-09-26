# Sweet Ginger Design Studio

Self-service custom apparel studio for Sweet Ginger Fashions (The T-Shirt Shop · Sweet Ginger Basics · Ginger Prints): choose a garment, design it, see it on the shirt, order one piece or a bulk size-run, and hand production a complete, printable order.

## Quick start

```bash
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

## Deploy to Vercel

### Option A — instant demo (no settings)

Import the repository in Vercel and deploy. With **no environment variables**, the site runs in **demo mode**:
an embedded database and file storage on the server's temporary disk, filled automatically with the sample
catalogue, four sample orders (single and bulk, at different production stages) and two staff logins, which
are shown on `/admin/login`. Payments are simulated and every page carries a "Demo" banner.

Good for showing the product; **not for real orders** — demo data lives on the server's temporary disk, so it
resets whenever Vercel restarts the server (e.g. after inactivity or a redeploy), and a design being edited
at that moment is kept only in the visitor's browser.

### Option A+ — reliable demo with a free shared database (recommended, ~2 minutes)

Vercel runs the site on several servers at once and restarts them when idle. With Option A each server has
its **own** temporary copy of the data, so an image made on one server can be missing on the next request
(broken AI previews, lost uploads). Give them one shared database instead:

1. Vercel → your project → **Storage** → **Create Database** → **Neon** (Serverless Postgres, free plan) →
   **Connect** it to this project with all environments ticked. This adds `DATABASE_URL` for you.
2. Settings → Environment Variables → add **`DEMO_MODE`** = `true` (Production and Preview).
3. Deployments → ⋯ → **Redeploy**.

On first start the site creates its tables and the demo data by itself, and stores images in the database
(`STORAGE_DRIVER=database`, the default on Vercel with a database). Everything stays demo-labelled with
simulated payments, but now survives restarts and works across servers.

### Turning on AI design generation

In Vercel → Project → Settings → Environment Variables, add **one** of these (more than one gives a fallback),
then redeploy:

| Key | Get it from | Notes |
|---|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys | best: true transparent backgrounds |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys | one key, many models; default `google/gemini-3.1-flash-image-preview` (`OPENROUTER_IMAGE_MODEL`) |
| `GEMINI_API_KEY` | aistudio.google.com → API keys | Google directly |

Tick the environment you use (Production and Preview) when adding the variable. That's all — the "✨ Generate with AI" button in the studio
starts creating artwork. Keys stay on the server. Each browser can make 10 AI designs per 24 hours by default
(`AI_MAX_GENERATIONS_PER_SESSION`). See [docs/AI_DESIGN_GENERATION.md](docs/AI_DESIGN_GENERATION.md) for models,
costs and all options. On Vercel's Hobby plan functions may run up to 300 s, enough for image generation.

### Option B — real data (Supabase)

For durable data, connect a real database and file storage; setting `DATABASE_URL` switches demo mode off, and the
site then refuses to run on simulated payments unless you explicitly allow them. Use a free Supabase project for both.

**1. Create a Supabase project** (supabase.com). From *Project Settings* copy:
- the **Transaction pooler** connection string (port 6543) → `DATABASE_URL`
- the **Project URL** → `SUPABASE_URL`
- the **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never put it in a `NEXT_PUBLIC_` variable)

**2. Prepare the database and storage once**, from your computer:

```bash
npm install
export DATABASE_URL="postgresql://…pooler.supabase.com:6543/postgres"
export STORAGE_DRIVER=supabase SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="…"
npm run db:seed        # tables + demo catalogue + the 4 private storage buckets
STAFF_PASSWORD="a-long-password" npm run db:user -- --email you@example.com --name "Your Name" --role ADMIN
```

**3. In Vercel → Project → Settings → Environment Variables** add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooler connection string |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role secret |
| `PAYMENT_PROVIDER` | `razorpay` — plus `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| *or, for a demo without real payments* `ALLOW_DEV_PAYMENTS` | `true` (checkout shows a clearly labelled simulated payment — no money moves) |
| `APP_URL` | optional — your site address, e.g. `https://studio.example.com` (leave unset to use the Vercel URL; don't save it blank-but-present with spaces) |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` | optional — order emails (defaults to logging only) |

Then **Redeploy**. If a required value is missing, the Vercel *Logs* show `Invalid environment configuration` with the exact variable name.

For Razorpay, point a webhook at `https://<your-site>/api/payments/webhook` for `payment.captured` and `payment.failed`.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | seed (idempotent) + dev server |
| `npm test` | unit + integration tests (in-memory Postgres) |
| `npm run test:e2e` | Playwright end-to-end tests (builds and starts the app on :3100 with a fresh database) |
| `npm run typecheck` / `npm run lint` | static checks |
| `npm run db:generate` | generate a SQL migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | apply migrations / seed demo data |
| `STAFF_PASSWORD=… npm run db:user -- --email … --name … --role ADMIN` | create a staff login |
| `npm run mockups` | regenerate garment mockup layers |

## Docs

`docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/DESIGN_SYSTEM.md` · `docs/BUSINESS_RULES.md` · `docs/OPEN_QUESTIONS.md` · `docs/IMPLEMENTATION_PLAN.md` · `docs/TEST_PLAN.md`

## Status

Milestones 1–10 are built and tested (58 unit/integration tests, 9 end-to-end tests including the B2C and B2B acceptance scenarios). See `docs/IMPLEMENTATION_PLAN.md` for the honest list of known gaps — notably Razorpay and Supabase Storage have not yet been exercised against live accounts, and admin catalogue editing is not built yet.
