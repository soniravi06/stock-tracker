# Portfolio Tracker

A multi-tenant stock portfolio accounting app for Indian markets (NSE/BSE).

**Features**
- 3-tier roles: Superadmin → Admin → Client (read-only)
- Multi-client portfolio tracking per admin
- Position-based model: buy lots with FIFO matching on sell → CompletedTrade
- Per-client default commission (percentage of gross P&L, signed, or flat ₹) with per-trade override
- Unrealized gains using live Yahoo Finance prices (NSE `.NS` / BSE `.BO`, cached 10 min, manual refresh)
- Global Transactions & Payments pages (cross-client, filterable)
- Payments tracking (pending / received, deposits / withdrawals) with mark-as-received
- Commission earnings report (per client + per month)
- Dashboard charts (portfolio value by client, realized vs unrealized, top holdings)
- CSV bulk import of buy lots
- Soft deletes everywhere — nothing is permanently removed
- Full audit log of every create/edit/delete with actor, role, and "on behalf of" tracking
- Dark-themed premium UI

**Stack:** Next.js 15 · TypeScript · Prisma · SQLite (local) / Postgres via Supabase (prod) · Auth.js v5 · Tailwind

---

## Part 1 — Run it locally

You need **Node.js 20 or newer** installed. Check with `node -v`.

### Step 1. Install dependencies

```bash
cd stock-tracker
npm install
```

### Step 2. Set up the database

The project ships with SQLite for local development, so no Postgres setup is needed to get started.

```bash
npx prisma db push
npm run db:seed
```

You should see output like:

```
✅ Seed complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOGIN CREDENTIALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Superadmin:  admin@example.com / ChangeMe123!
Admin:       rajesh@firm.com / Admin123!
Client:      amit@example.com / Client123!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3. Run it

```bash
npm run dev
```

Open <http://localhost:3000> and log in with any of the three credentials above. Each one shows a different scope:

- **Superadmin** → sees all admins, all clients, full audit log
- **Admin (rajesh)** → sees own clients (Amit, Priya), can add transactions/payments
- **Client (amit)** → read-only view of own book only

To see the DB directly, run `npm run db:studio`.

---

## Part 2 — Deploy to Vercel + Supabase (manual, no CLI)

This is a 10-minute, click-only flow. No terminal needed after step 1.

### Step 1. Push the code to GitHub

Easiest way without Git:

1. Go to <https://github.com/new> and create a new empty repository called `stock-tracker`. **Don't** initialize with a README.
2. On the next page, click **"uploading an existing file"**.
3. Drag the entire `stock-tracker` folder contents into the browser upload area. **Important:** don't upload the `node_modules` folder, the `.env` file, or `prisma/dev.db` — skip those.
4. Scroll down and click **Commit changes**.

### Step 2. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Name it `stock-tracker`, choose a region close to you (Mumbai for India), and set a strong database password. **Save this password** — you'll need it in step 3.
3. Wait ~2 minutes for provisioning.
4. Once ready, go to **Project Settings → Database** in the left sidebar.
5. Scroll down to **Connection string**. You'll see two modes:
   - **Transaction pooler** (port 6543) — copy this, it's your `DATABASE_URL`
   - **Session / Direct connection** (port 5432) — copy this, it's your `DIRECT_URL`
6. In each copied string, replace `[YOUR-PASSWORD]` with the actual database password from step 2.

### Step 3. Switch Prisma from SQLite to Postgres

Edit `prisma/schema.prisma` and change the `datasource db` block to:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Commit and push this change to GitHub (you can edit the file directly in the GitHub web UI by clicking the pencil icon).

### Step 4. Deploy to Vercel

1. Go to <https://vercel.com/new>.
2. Click **Import** next to the `stock-tracker` repo from GitHub.
3. On the configuration screen, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your pooler connection string from Supabase |
   | `DIRECT_URL` | your direct connection string from Supabase |
   | `AUTH_SECRET` | run `openssl rand -base64 32` locally, or use any 32+ char random string |
   | `AUTH_TRUST_HOST` | `true` |
   | `SUPERADMIN_EMAIL` | your email |
   | `SUPERADMIN_PASSWORD` | a strong password |

4. Click **Deploy**. First build takes ~3 minutes.

### Step 5. Initialize the production database

The first deploy will succeed but the database will be empty. Two ways to fix this:

**Option A — Using Supabase SQL Editor (easiest):**

1. In Supabase dashboard, go to **SQL Editor**.
2. Open your local `prisma/schema.prisma` and note the models. You'll use Prisma to push the schema instead — see Option B.

**Option B — Push schema from your local machine (recommended):**

1. On your local machine, create a file called `.env.production.local` in the project root:
   ```
   DATABASE_URL="<your-pooler-url>"
   DIRECT_URL="<your-direct-url>"
   SUPERADMIN_EMAIL="your-email@example.com"
   SUPERADMIN_PASSWORD="your-strong-password"
   ```
2. Run these one-time commands:
   ```bash
   npx dotenv -e .env.production.local -- npx prisma db push
   npx dotenv -e .env.production.local -- npm run db:seed
   ```
   *(If `dotenv-cli` isn't installed, first run `npm install -g dotenv-cli`.)*

3. Verify in the Supabase dashboard **Table Editor** — you should see `User`, `Client`, `Transaction`, etc. tables populated.

### Step 6. Log in

Visit your Vercel URL (e.g. `https://stock-tracker-xyz.vercel.app`) and log in with the superadmin credentials you set in step 4.

**Change the default passwords** as soon as you log in.

---

## Project structure

```
stock-tracker/
├─ prisma/
│  ├─ schema.prisma       # Database schema (users, clients, txs, payments, audit)
│  └─ seed.ts             # Sample data (superadmin, admin, 2 clients, txs)
├─ src/
│  ├─ app/
│  │  ├─ login/           # Login page
│  │  ├─ dashboard/       # Admin & superadmin dashboard (+ charts)
│  │  ├─ clients/         # Client list, new, detail, edit, buy, import, payment
│  │  ├─ transactions/    # Global cross-client buys + sells
│  │  ├─ payments/        # Global cross-client payments (mark received)
│  │  ├─ reports/commission/  # Commission earnings report
│  │  ├─ admins/          # Superadmin: manage admins
│  │  ├─ audit/           # Audit log viewer (scoped by role)
│  │  ├─ my/              # Client read-only portfolio view
│  │  ├─ api/auth/        # Auth.js route handler
│  │  ├─ layout.tsx
│  │  ├─ page.tsx         # Root redirect
│  │  └─ globals.css      # Dark theme
│  ├─ components/
│  │  ├─ AppShell.tsx           # Sidebar + layout shell
│  │  ├─ DashboardCharts.tsx    # recharts dashboard charts
│  │  ├─ RefreshPricesButton.tsx# Manual price refresh
│  │  ├─ CsvImport.tsx          # CSV upload/preview/import
│  │  ├─ PaymentsTable.tsx      # Payments table + edit modal
│  │  ├─ HoldingsTable.tsx      # Current holdings + sell modal
│  │  ├─ CompletedTradesTable.tsx# Realized trades + edit modal
│  │  └─ AuditLogTable.tsx      # Audit log table
│  ├─ lib/
│  │  ├─ auth.ts          # Auth.js config (3 roles in JWT)
│  │  ├─ auth.config.ts   # Edge-safe auth config for middleware
│  │  ├─ prisma.ts        # Prisma singleton
│  │  ├─ access.ts        # Role-scoped query helpers
│  │  ├─ actions.ts       # Server actions (sell/edit/delete/payments/client/import/prices)
│  │  ├─ fifo.ts          # FIFO engine + commission calc
│  │  ├─ prices.ts        # Yahoo Finance fetcher + cache
│  │  ├─ audit.ts         # Audit log writer (+ summaries)
│  │  └─ format.ts        # INR and date formatting
│  └─ middleware.ts       # Role-based route protection
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
├─ tailwind.config.mjs
└─ .env.example
```

## How the position model works

The app uses a **position-based model**, not a transaction ledger:

- A **buy** creates a `Transaction` row (a "buy lot") with `remainingQty = quantity`. Open lots are your Current Holdings.
- A **sell** does NOT create a `Transaction`. It creates a `CompletedTrade` that FIFO-matches against the oldest open lots and decrements their `remainingQty`. The matched-lot breakdown is stored in `matchedLotsJson`.
- **Current Holdings** = all `Transaction` rows with `remainingQty > 0`, grouped by symbol with weighted-average cost.
- **Realized P&L** = sum of `netPnL` across `CompletedTrade` rows.
- **Unrealized P&L** = (live price − weighted avg cost) × remaining qty, per holding.

**Commission** is computed on each completed trade's **gross P&L** (signed — a loss produces a negative commission that reduces the loss), or as a flat ₹ amount. Per-client default with per-trade override.

There is **no STCG/LTCG tax classification** in this version (deliberately dropped).

## Known limitations / not built yet

- No restore UI for soft-deleted records (database supports it via `deletedAt`; add a superadmin "Trash" page when needed)
- Yahoo Finance prices are unofficial and ~15 min delayed; fine for accounting but don't use for active trading. Use the **Refresh prices** button to force a live re-fetch (bypasses the 10-min cache)
- Performance pass (Vercel region, query optimization, loading skeletons) is intentionally deferred

## Troubleshooting

**"PrismaClient is unable to be run in the browser"** — you imported `@/lib/prisma` inside a client component. Prisma can only be used in server components and server actions.

**Yahoo Finance returns null** — the unofficial endpoint can fail or rate-limit. The app falls back to the cached price automatically. If you need real-time reliability, swap `src/lib/prices.ts` to use a broker API (Zerodha Kite, Upstox, etc.).

**Login fails on Vercel with "UntrustedHost"** — make sure `AUTH_TRUST_HOST=true` is set in the Vercel environment variables.

**Seed fails with "table does not exist"** — run `npx prisma db push` before `npm run db:seed`.
