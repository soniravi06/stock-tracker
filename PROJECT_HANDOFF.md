# Project Handoff — Stock Portfolio Tracker

**Read this document fully before making any changes.** It contains the project's complete history, current state, design decisions, outstanding bugs, and roadmap. It is the source of truth for what's been built and why.

---

## 1. What this project is

A multi-tenant stock portfolio accounting web app for the Indian market (NSE/BSE). The owner uses it to track multiple clients' portfolios — buys, sells, commissions, payments, realized and unrealized gains. Each client gets a read-only login to see their own book.

**Repository:** `https://github.com/soniravi06/stock-tracker`
**Deployed at:** Vercel (auto-deploys from `main` branch)
**Database:** Supabase Postgres (region: `ap-south-1`, Mumbai)

---

## 2. Tech stack (locked in — don't change without reason)

- **Framework:** Next.js 15.5.6 (App Router, Server Actions, RSC)
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL via Prisma 6.x
- **Auth:** Auth.js v5 (next-auth 5.0.0-beta.25), credentials provider, JWT sessions
- **Styling:** Tailwind CSS + inline styles for the dark glassmorphism theme
- **Deployment:** Vercel (Hobby tier, function region: default `iad1` — should move to `bom1` Mumbai eventually for speed)
- **Database hosting:** Supabase (uses pooler + direct URL for Prisma)

**Key version constraints (don't downgrade):**
- `next: 15.5.6` — earlier versions have CVE-2025-66478, Vercel will block deploys
- `next-auth: 5.0.0-beta.25` — there's a specific edge-runtime split pattern required (see auth section)

---

## 3. Three-tier role model

The system has exactly three roles. This is a hard architectural constraint, not a feature flag.

### Roles

| Role | Created by | Can do |
|---|---|---|
| **superadmin** | Seeded directly (one only) | Everything. Sees all admins and all clients across the platform. Creates new admins. Can act on any admin's data (logged as "on behalf of"). |
| **admin** | Superadmin only (no self-signup) | Manages own clients, transactions, payments, commissions. Sees only own data. |
| **client** | Their admin (or superadmin) | Read-only. Sees only their own portfolio. Logs into the same site, lands on `/my`. |

### Data isolation

Every `Client` row has an `adminId`. All admin queries are auto-filtered by `adminId = currentUser.id` at the data-access layer (`src/lib/access.ts → scopedClientWhere()`). Superadmin queries skip the filter. Client logins can only see the row pointed to by their `linkedClientId`. This is enforced in code, not just UI — never trust UI checks alone.

### Audit log

Every create / update / soft-delete writes to the `AuditLog` table with: actor, role, on-behalf-of (when superadmin acts on an admin's data), action, entity type, entity ID, before snapshot (JSON), after snapshot (JSON), IP, timestamp. Scope rules:
- Superadmin sees all entries
- Admin sees entries on their own clients (including superadmin actions on those clients)
- Client sees entries on their own client row only

---

## 4. The position-based data model (this is critical, read carefully)

The original v0.1 used a transaction-ledger model where every buy and sell was a `Transaction` row. **The user explicitly rejected that** in favor of a position-based model. The current v0.2 schema reflects this:

### How it works

- A **buy** creates a `Transaction` row with `remainingQty = quantity`. This is a **buy lot** that sits in Current Holdings.
- A **sell** does NOT create a `Transaction`. It creates a `CompletedTrade` row that references one or more buy lots (FIFO-matched), and decrements the `remainingQty` of those buy lots.
- **Current Holdings** is computed by aggregating all `Transaction` rows where `remainingQty > 0`, grouped by symbol, with weighted-average cost per share.
- **Realized P&L** = sum of `netPnL` on `CompletedTrade` rows.
- **Unrealized P&L** = (current price − weighted avg cost) × remaining qty, per holding.

### Why this matters

Mental model: the user thinks "I bought TCS and I'm still in the position" — not "there was a buy event and a sell event, match them later." The UI shows positions, not a transaction journal. **Don't refactor this back to a transaction-ledger model.** It was a deliberate decision after a long discussion.

### Edge cases handled correctly

- **Multiple buys of the same stock at different prices:** Each is its own lot. Holdings show the weighted average. UI is expandable to see individual lots.
- **Partial sell:** FIFO-matches against the oldest lot first. If the oldest lot has 100 and you sell 80, the lot's `remainingQty` becomes 20. If you sell 120, the oldest lot is fully consumed and 20 more comes from the next lot. The CompletedTrade stores the FIFO match details in `matchedLotsJson` so the UI can show "this trade consumed 100 shares from Lot A + 20 from Lot B."
- **Oversell:** Blocked at the action layer (`planFifoSell` returns an error if there aren't enough shares).

### What's NOT in this model

The user explicitly **dropped STCG/LTCG tax classification** in this version. Earlier drafts had it, but the user said: *"Forget about LTCG and STCG tax calculation logic/feature for now, if required we'll build it later. it's not that important for now."* So the codebase has no holding-period logic, no LTCG threshold, no tax rate config. **Don't add it back unless the user explicitly asks.**

---

## 5. Commission rules (THIS IS THE TOP-PRIORITY BUG TO FIX)

The user's exact requirement, restated for clarity:

> Commission applies on **every completed trade**, profit or loss. The commission is a **percentage of the gross P&L** (not of the sell proceeds, not of the sell value). The commission can also be a flat ₹ amount. The user picks per-trade, with a per-client default that pre-fills.

### The bug currently in production

`src/lib/actions.ts` (in `sellFromHoldingAction` and `editCompletedTradeAction`) computes commission like this:

```typescript
const commissionAmount = computeCommission(commissionType, commissionValue, totalSellProceeds);
```

This is **wrong**. It's computing commission as a % of `totalSellProceeds` (the gross sell value). It should be computing commission as a % of `grossPnL`.

### The correct logic

```typescript
const grossPnL = totalSellProceeds - totalBuyCost;
const commissionAmount = commissionType === "percentage"
  ? (grossPnL * commissionValue) / 100   // SIGNED — can be negative on losses
  : commissionValue;                       // flat fee unchanged
const netPnL = grossPnL - commissionAmount;
```

### User's chosen interpretation: "Interpretation A" (signed)

The user explicitly chose **signed commission**. Direct quote:

> *"Comission on losses should also give the negative number (basically we are just calculating the set percentage of P&L)"*

**Worked example:**
- Profit case: gross P&L = +₹36,000, commission @ 0.5% = +₹180, net = ₹35,820 ✓
- Loss case: gross P&L = -₹10,000, commission @ 0.5% = **-₹50** (negative), net = -10,000 - (-50) = **-₹9,950** (loss is *smaller* by ₹50 because the commission "credit" partially offsets it)

**Yes this is economically unusual** (commissions normally don't go negative), but it's what the user explicitly asked for. Don't second-guess it. **Interpretation A.**

### Files to update

- `src/lib/actions.ts` — both `sellFromHoldingAction` and `editCompletedTradeAction`
- `src/components/HoldingsTable.tsx` — the live preview math in the Sell modal
- `src/components/CompletedTradesTable.tsx` — the live preview math in the Edit Trade modal
- `prisma/seed.ts` — recompute the demo INFY trade so it matches the new rule
- `src/lib/fifo.ts` — the `computeCommission()` helper takes `tradeValue` as the third arg; either rename it to `grossPnL` or update all call sites

### Commission color (visual change)

The user wants commission numbers highlighted in **orange/amber** so they stand out from green/red P&L numbers. Currently they render in default text color. Add a CSS class like `.commission` with `color: #f59e0b` and apply it to all commission cells in:
- `HoldingsTable.tsx` (Sell modal preview)
- `CompletedTradesTable.tsx` (table column + Edit modal preview)
- `src/app/clients/[id]/page.tsx` (the "Commission Paid" stat card)
- `src/app/dashboard/page.tsx` (the "Commission Paid" stat card)
- `src/app/my/page.tsx` (the "Commission Paid" stat card)

---

## 6. Outstanding bugs (fix all three in one push)

### Bug 1: Commission calculation (described above in §5)

### Bug 2: Audit log foreign key violation

**Symptom:** When the user creates a new buy or admin, the action throws:

```
PrismaClientKnownRequestError: Foreign key constraint violated on AuditLog_actorUserId_fkey (P2003)
```

**Root cause:** The user's JWT session contains a `userId` from a *previous* database state. After `prisma db push --force-reset` re-seeded the database, the user IDs changed but the user's browser still has the old JWT cookie. When `writeAudit()` tries to insert with the stale `actorUserId`, the FK constraint fails because no `User` row has that ID anymore.

**Fix (two-part):**

**Part A — make `writeAudit()` fail-safe.** Wrap the create in try/catch. If it throws, log to console and continue. An audit failure should never block the user's actual action.

```typescript
// src/lib/audit.ts
export async function writeAudit(args: LogArgs) {
  try {
    await prisma.auditLog.create({
      data: { /* ... */ },
    });
  } catch (e) {
    // Audit failures must never block the primary action.
    // Most common cause: stale JWT after a DB reset.
    console.error("[audit] write failed:", e);
  }
}
```

**Part B — make audit logs more detailed (user requested).** The user said: *"Make audit log more detailed, user should understand exactly what change was made."* Currently the log shows actor + entity ID. It should also show:

1. **Human-readable summary string** — generate a short description like `"Updated INFY completed trade: sell price ₹1520 → ₹1550, commission 0.5% → 0.75%"`. Compute this in the `writeAudit` call site by diffing `before` and `after`, then store as a new column `summary String?` on `AuditLog`.
2. **Field-level diff in the UI** — in `src/app/audit/page.tsx`, when a row is expanded, parse `beforeJson` and `afterJson` and render a side-by-side diff of changed fields (skip unchanged fields, format dates and currency).
3. **Entity name resolution** — instead of showing `Client xyz123`, look up the client name and show `Amit Patel`. Same for admin/user actors. Add a JOIN or a lookup helper.
4. **Expandable rows** — make the audit log table rows clickable to expand and show the full before/after detail.

This means a small schema migration (add `summary` column) — Prisma will handle it via `db push`.

### Bug 3: Stale UI after entries

**Symptom:** After creating a buy/payment/sell, the dashboard and clients list don't show the new entry until the user manually refreshes the page.

**Root cause:** Server actions only call `revalidatePath` for the current page (e.g., `/clients/[id]`), but not for `/dashboard` or `/clients`. Next.js caches RSC output aggressively. The buy/payment forms use `redirect()` which bypasses some cache layers, but the dashboard's RSC payload is still stale.

**Fix:**

Add `revalidatePath` calls for **all affected paths** in every server action and form action:

```typescript
import { revalidatePath } from "next/cache";

// At the end of each action:
revalidatePath("/dashboard");
revalidatePath("/clients");
revalidatePath(`/clients/${clientId}`);
revalidatePath("/my");        // covers client-facing view
revalidatePath("/audit");     // covers audit log
```

Locations to update:
- `src/lib/actions.ts` — all 5 actions (sellFromHolding, editCompletedTrade, deleteCompletedTrade, editBuyLot, deleteBuyLot)
- `src/app/clients/[id]/buy/new/page.tsx` — the inline `createBuyAction`
- `src/app/clients/[id]/payments/new/page.tsx` — the inline `createPaymentAction`
- `src/app/clients/new/page.tsx` — the inline `createClientAction`
- `src/app/admins/page.tsx` — the inline `createAdminAction`

**Belt-and-suspenders:** also add `export const dynamic = "force-dynamic";` at the top of `src/app/dashboard/page.tsx` and `src/app/clients/page.tsx` so they always run fresh server-side.

---

## 7. Roadmap (after the 3 bugs above are fixed and pushed)

The user agreed to a phased rollout. Phase 1 (the position model) is shipped. Phases 2–6 are pending. Build them **one at a time, in this order**, pushing after each phase so the user can test:

### Phase 2 — Superadmin "act as admin" flow
When the superadmin creates a new client, they should be able to **pick which admin owns it** from a dropdown. Currently the create-client form hardcodes `adminId = session.user.id`, which means superadmin-created clients get owned by the superadmin themselves and don't show up under the right admin. Fix: add an admin selector to `clients/new/page.tsx`, only visible to superadmin role; default to current user if admin role.

### Phase 3 — Live price refresh button
Currently prices are cached for 10 minutes in `PriceSnapshot` and only update lazily when a page loads. Add a small "refresh prices" button on the client detail page and dashboard that calls a server action which clears the cache for the relevant symbols and re-fetches from Yahoo Finance. Show a small spinner while it's working.

### Phase 4 — Dashboard charts
Use `recharts` (already in `package.json`). Three charts on the admin dashboard:
1. Portfolio value over time (per client, line chart) — needs a `PortfolioSnapshot` table populated by a daily cron, OR computed on-the-fly from transactions + current prices (simpler for v1)
2. Realized vs unrealized P&L breakdown (donut)
3. Top 5 holdings by value (horizontal bar)

### Phase 5 — CSV import
Bulk-load buy lots from a CSV. Format: `symbol, exchange, quantity, pricePerShare, tradeDate, notes`. Build a `/clients/[id]/import` page with a file upload, validate the rows, show a preview, then commit on confirm. Each imported row goes through the same audit log path. Include a downloadable CSV template.

### Phase 6 — Speed/perf fixes (do LAST, only when user asks)
The user explicitly said *"about speed fixes, do it at last phase when I tell you to do."* Do not start this until the user requests it. When they do:
1. Move Vercel function region from `iad1` to `bom1` (Mumbai) via `vercel.json` — biggest single win because Supabase is in Mumbai and current cross-continental round-trips add 250–400ms per query
2. Replace `findMany({ include: ... })` with explicit `select` to fetch only needed columns
3. Wrap independent queries in `Promise.all` for parallel execution
4. Add loading.tsx files for skeleton UIs on dashboard, clients list, client detail
5. Add indexes on `(clientId, deletedAt)` and `(clientId, symbol, deletedAt)` if not already there

---

## 8. Deploy & infrastructure notes (gotchas we already hit)

These are landmines that already cost the user multiple failed deploys. Read before touching deploy config.

### Environment variables (Vercel)

Required env vars on Vercel — Name on the LEFT, full string on the RIGHT (the user accidentally swapped these once and got a cryptic Webpack error):

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.xxx:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | `postgresql://postgres.xxx:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` |
| `AUTH_SECRET` | random 32+ char string |
| `AUTH_TRUST_HOST` | `true` |
| `SUPERADMIN_EMAIL` | user's real email |
| `SUPERADMIN_PASSWORD` | strong password |

**The pooler URL must include `?pgbouncer=true`** — Prisma requires this when using Supabase's transaction pooler.

### Password gotcha
**Never use special characters (`@`, `:`, `#`, `/`, `?`, `&`) in the Supabase database password.** They have to be URL-encoded in the connection string and it's a constant source of confusion. Always use Supabase's "Generate password" with **alphanumeric only**. The user's previous passwords leaked in build logs because they contained `@` which broke URL parsing in Prisma's WASM client. **If you ever see a password leak in a log, immediately tell the user to rotate it in the Supabase dashboard.**

### `prisma/schema.prisma`
The `datasource db` block must look exactly like this — `env()` takes a variable NAME, not a value:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

(The user once pasted the entire connection string inside `env(...)` which broke the build. Watch for this if they edit the schema directly.)

### Auth.js v5 + middleware size limit

Vercel's middleware has a 1 MB Edge bundle limit. If `src/middleware.ts` imports from `src/lib/auth.ts` (which imports Prisma + bcrypt), the bundle blows past the limit. The pattern in the codebase splits auth into two configs:

- `src/lib/auth.config.ts` — **edge-safe**, no Prisma, no bcrypt, just session/JWT callbacks. Used by `middleware.ts`.
- `src/lib/auth.ts` — **node-only**, full config with Credentials provider. Used by API route and server actions.

**Don't merge these back together** or middleware will exceed 1 MB and Vercel will reject the deploy.

### Database reset workflow

When the schema changes incompatibly, the user resets the production database from their local machine using:

```bash
npx dotenv-cli -e .env.production.local -- npx prisma db push --force-reset --accept-data-loss
npx dotenv-cli -e .env.production.local -- npm run db:seed
```

The user has a `.env.production.local` file in their project root with the Supabase credentials. After running this, **the user must sign out and sign back in** because their JWT will reference the old (now nonexistent) user IDs. This is also why Bug 2 (audit log FK) happens — the fix in `writeAudit()` makes it survive this scenario gracefully.

---

## 9. The user's stated preferences and decisions

These came up in discussion. Respect them; don't propose alternatives unless specifically asked.

- **Position model** over transaction-ledger model (§4)
- **No STCG / LTCG** in this version (§4)
- **Commission Interpretation A** — signed, applied to gross P&L, can be negative on losses (§5)
- **Commission color: orange/amber** (§5)
- **Commission per trade** with per-client default that pre-fills (§5)
- **Soft delete only** — nothing is ever physically deleted from the database. Use `deletedAt` columns. The schema already has these everywhere.
- **Editable completed trades** with audit logging — no reversal flow, just edit-and-log. Buy lots are only editable if no shares have been sold from them yet.
- **One owner (superadmin)** seeded directly. Multiple admins created by superadmin. No self-signup ever.
- **Multi-client per admin**, no cross-admin sharing (yet)
- **Indian market only** (NSE/BSE), INR only, Yahoo Finance for prices via `.NS`/`.BO` symbol suffixes
- **Dark theme with glassmorphism** — established visual style in `globals.css`
- **Speed fixes are LAST** — don't touch until the user explicitly requests them

---

## 10. File structure reference

```
stock-tracker/
├── prisma/
│   ├── schema.prisma          # Postgres schema, position model, audit log
│   └── seed.ts                # Sample data: superadmin + admin + 2 clients + buy lots + 1 completed trade
├── src/
│   ├── app/
│   │   ├── login/             # Login page (server action, demo creds shown)
│   │   ├── dashboard/         # Admin/superadmin dashboard with stat cards + clients list
│   │   ├── clients/
│   │   │   ├── page.tsx       # Clients list
│   │   │   ├── new/           # Create client form (inline server action)
│   │   │   └── [id]/
│   │   │       ├── page.tsx   # Client detail with Holdings + Completed Trades + Payments
│   │   │       ├── buy/new/   # New buy lot form
│   │   │       └── payments/new/
│   │   ├── admins/            # Superadmin: create new admins
│   │   ├── audit/             # Audit log viewer (scoped by role)
│   │   ├── my/                # Client read-only portfolio
│   │   ├── api/auth/          # Auth.js handler
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Root redirect by role
│   │   └── globals.css        # Dark theme, glass utility classes, badge colors
│   ├── components/
│   │   ├── AppShell.tsx       # Sidebar nav
│   │   ├── HoldingsTable.tsx  # Expandable holdings + Sell modal + Edit Lot modal (CLIENT COMPONENT)
│   │   └── CompletedTradesTable.tsx  # Expandable trades + Edit Trade modal (CLIENT COMPONENT)
│   ├── lib/
│   │   ├── auth.config.ts     # Edge-safe auth (DON'T import Prisma here)
│   │   ├── auth.ts            # Full auth with Credentials provider
│   │   ├── prisma.ts          # Prisma singleton
│   │   ├── access.ts          # requireSession() + scopedClientWhere() + getAuthorizedClient()
│   │   ├── actions.ts         # Server actions: sell, edit/delete trade, edit/delete buy lot
│   │   ├── audit.ts           # writeAudit() — fix Bug 2 here
│   │   ├── fifo.ts            # planFifoSell, computeCommission, buildHoldings
│   │   ├── prices.ts          # Yahoo Finance fetcher with 10-min cache
│   │   └── format.ts          # inr(), fmtDate(), fmtNum()
│   └── middleware.ts          # Edge-safe routing protection
├── package.json               # Next 15.5.6, next-auth 5.0.0-beta.25
├── README.md                  # Local setup instructions
├── MIGRATION.md               # v0.1 → v0.2 migration notes
└── PROJECT_HANDOFF.md         # This file
```

---

## 11. Demo credentials (after seed)

```
Superadmin:  admin@example.com / ChangeMe123!  (or whatever SUPERADMIN_* env vars set)
Admin:       rajesh@firm.com    / Admin123!
Client:      amit@example.com   / Client123!
```

The demo data includes Amit Patel with TCS (2 lots: 100 @ 3500 + 50 @ 3700), RELIANCE (80 @ 2550), INFY (originally 200 @ 1380, with 120 sold @ 1520 in a completed trade). Priya Singh has HDFCBANK and INFY positions. Use this to test the position model end-to-end.

---

## 12. Security note — read this

In a previous chat the user accidentally pasted a **GitHub Personal Access Token in plaintext** (`ghp_gBo0lKakNi...`). They have been told to delete it at https://github.com/settings/tokens. **Verify with the user that they have deleted it before doing anything that would require GitHub auth.** If they haven't, refuse to use it and instruct them to delete it and create a fresh one.

For pushing to GitHub from now on, use `gh auth login` (the GitHub CLI) which opens a browser-based OAuth flow. Never accept a PAT pasted in chat.

The user has also previously had **Supabase database passwords leaked in build logs**. If you ever see a database password (or any secret) in a log that's about to be displayed to the user, redact it before showing the log.

---

## 13. Your first task

After reading this document end-to-end:

1. **Open `src/lib/audit.ts`, `src/lib/actions.ts`, `src/components/HoldingsTable.tsx`, `src/components/CompletedTradesTable.tsx`, and `prisma/seed.ts`** to confirm you understand the current state.

2. **Fix the three bugs in §6** in order: (1) commission on gross P&L with Interpretation A and orange highlighting, (2) audit log fail-safe + more detailed entries with `summary` column, (3) `revalidatePath` everywhere + `force-dynamic` on dashboard/clients pages.

3. **Run `npm install` and `npx prisma generate` and `npm run build`** locally to verify the build is clean before pushing.

4. **Authenticate with GitHub** using `gh auth login` (browser OAuth flow). Don't accept any pasted token.

5. **Create a new branch** (e.g., `fix/commission-audit-revalidate`), commit with a clear message, push, and open a PR — or push to main directly if the user prefers. Ask first.

6. **Tell the user** what you did, that they need to (a) wait for Vercel to redeploy, (b) sign out and sign back in once for the audit log fix to take effect on their session, and (c) test the three fixes with the scenarios in §11.

7. **Wait for the user's confirmation** before starting Phase 2 from §7. Do not auto-advance through phases.

---

End of handoff document. Good luck.
