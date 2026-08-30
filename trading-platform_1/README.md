# Trading Intelligence Center — Phase 1

Real, working Next.js app: dashboard, live economic calendar, trading plan
builder, trading journal (with win rate / R / plan compliance stats), and a
risk + drawdown calculator. This is Phase 1 from the architecture doc — no
mock data, everything reads/writes to a real database and a real calendar API.

## Get it live (about 30–45 minutes, all free tiers)

### 1. Supabase (your database + auth)
1. Go to supabase.com → New project (free tier).
2. Once created, go to Project Settings → API. Copy the **Project URL** and
   **anon public key**.
3. Go to the SQL Editor, paste the contents of `supabase/schema.sql`, and run
   it. This creates your tables and seeds the starter event-relevance rows.
4. Go to Authentication → Providers, and make sure Email is enabled (default).
   You'll sign up with your own email inside the app once it's live — that's
   your `user_id` for row-level security.

### 2. Financial Modeling Prep (your economic calendar data)
1. Go to site.financialmodelingprep.com/developer/docs → sign up free.
2. Copy your API key from the dashboard.

### 3. Deploy to Vercel
1. Push this folder to a new GitHub repo (or upload directly in Vercel's UI).
2. Go to vercel.com → New Project → import the repo.
3. In the project's Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = (from step 1)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (from step 1)
   - `FMP_API_KEY` = (from step 2)
4. Deploy. Vercel gives you a live `https://your-project.vercel.app` URL.

### 4. First login
Visit your live URL — you'll need a sign-up/sign-in screen (not included in
this Phase 1 drop — see "Next steps" below) or, for now, create a user
directly in Supabase Authentication → Users, then use Supabase's magic-link
sign-in from the app once auth UI is added.

## Local development
```bash
npm install
cp .env.local.example .env.local   # fill in your real values
npm run dev
```

## What's included vs. what's next
**Included (Phase 1):** dashboard shell, live economic calendar (FMP),
trading plan builder, trading journal with stats, risk/drawdown calculator,
full DB schema with row-level security.

**Not yet included** — these are Phase 2/3 from the architecture doc:
sign-in/sign-up screens (Supabase Auth UI needs to be wired up before the
journal/plan pages will actually save data for you), currency macro
dashboards, currency comparator, asset macro profiles, news intelligence,
pre-trade checklist, journal analytics/pattern detection, weekly review,
event volatility database, AI assistant.

**Recommended next step:** open this project in Claude Code (desktop or
terminal) to keep building — it's a much better fit than a chat interface for
an ongoing multi-file project like this, especially for wiring up auth and
iterating on the remaining modules with a real terminal and git.
