# Migration: v0.1 → v0.2 (Position Model)

This update changes how transactions work fundamentally. The schema is **not backward-compatible** with v0.1 data — you'll need to reset your database.

## What changed

### Data model
- **Buys are the only "Transaction" rows now.** A Transaction = a buy lot.
- **Sells are no longer Transactions.** They become `CompletedTrade` rows when you close a position.
- **`Transaction.remainingQty`** is new — tracks how many shares of a buy lot are still open. Decrements when sold.
- **`Transaction.type`, `Transaction.commissionAmount`, `Transaction.reversedByTransactionId`** are gone.
- **No STCG / LTCG.** Removed entirely from this version. Realized P&L is just net P&L.
- **Commission is set per sell**, not per buy. Pre-filled from the client default.

### UI
- **Current Holdings** is now expandable — click a row to see the underlying buy lots with dates and prices.
- **"Sell" button** appears on each holding. Opens a modal with FIFO-aware sell flow.
- **"Completed Trades"** replaces the old "Transactions" section. Each row shows the sell event with weighted-avg buy price, gross P&L, commission, and net P&L. Expand to see the FIFO match details.
- **Editing**: completed trades are editable (sell price, date, commission, notes — buy lots stay locked). Buy lots are editable only if no shares have been sold from them yet.
- **Soft delete**: deleting a completed trade restores the buy lots back into holdings.

### Files added
- `src/components/HoldingsTable.tsx`
- `src/components/CompletedTradesTable.tsx`
- `src/lib/actions.ts`
- `src/app/clients/[id]/buy/new/page.tsx`

### Files removed
- `src/app/clients/[id]/transactions/new/page.tsx` (replaced by `buy/new`)

---

## Deploy steps

### 1. Push the new code to GitHub

You can either:
- **(A) Re-upload the whole folder** in the GitHub web UI (delete the old repo files first), or
- **(B) Edit the changed files individually** in the GitHub web editor.

Option A is faster if you don't mind a single big commit. There are about a dozen changed files; uploading the unzipped `stock-tracker` folder contents in one go is the easiest path.

### 2. Wait for Vercel auto-deploy

Vercel will detect the push and start a build automatically. It should succeed in ~2 minutes since all the Next.js / Auth / middleware fixes from before are already in place.

### 3. Reset your Supabase database

The schema changed in incompatible ways. Drop the old tables and push the new schema.

On your local machine, in the unzipped `stock-tracker` folder, make sure your `.env.production.local` still has the right Supabase credentials, then run:

```bash
npx dotenv-cli -e .env.production.local -- npx prisma db push --force-reset --accept-data-loss
```

The `--force-reset` flag drops all existing tables and recreates them from the new schema. Everything in your current database will be wiped.

Then re-seed:

```bash
npx dotenv-cli -e .env.production.local -- npm run db:seed
```

You'll see fresh login credentials printed. They're the same as before:

```
Superadmin:  your-email@example.com / your-password
Admin:       rajesh@firm.com / Admin123!
Client:      amit@example.com / Client123!
```

### 4. Verify

Open your Vercel URL, log in as the admin (`rajesh@firm.com`), and click on "Amit Patel" in the clients list. You should see:

- **TCS** in holdings with **150 shares at avg ₹3566.67** (click to expand and see two underlying lots: 100 @ 3500 and 50 @ 3700)
- **RELIANCE** with 80 shares at ₹2550
- **INFY** with 80 remaining shares (originally 200, partial sell)
- **One Completed Trade** for INFY: 120 sold @ 1520, gross P&L ₹16,800, commission ₹912, net P&L ₹15,888 — click to expand and see the FIFO lot match

Try clicking **Sell** on the TCS row to see the new sell modal in action. Sell 120 shares and watch the FIFO match against the older lot first.

---

## Troubleshooting

**`prisma db push --force-reset` fails with "P1001 Can't reach database"**
Your `.env.production.local` connection string is wrong. Double-check the password and that you used the **session/direct** URL on port 5432 for `DIRECT_URL`, and the **pooler** URL on port 6543 with `?pgbouncer=true` for `DATABASE_URL`.

**Vercel build fails on a Prisma type error**
Make sure your `prisma/schema.prisma` was uploaded with the updated v0.2 content. The new model includes `CompletedTrade` and the `remainingQty` field on `Transaction`.

**The "Sell" button doesn't do anything when I click it**
Check the browser console. Most likely there's a JavaScript error from a stale build cache — try a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or do a fresh deploy from Vercel with cache disabled.

**I want to keep my old data**
You can't, sorry — the schema changes are too big to migrate in-place automatically. If you have important data, export it from the Supabase dashboard (Table Editor → each table → Export → CSV) before running the reset.
