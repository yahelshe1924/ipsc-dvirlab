# iPSC-DvirLab

A shared lab duty roster app for managing daily iPSC medium changes.  
Built with **Next.js 14 + Supabase + Google OAuth**, deployable 100% free.

---

## Stack

| Layer | Technology | Free tier |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Vercel Hobby |
| Database | Supabase PostgreSQL | Supabase Free |
| Auth | Supabase Auth + Google OAuth | Supabase Free |
| Serverless jobs | Supabase Edge Functions | 500K invocations/mo free |
| Scheduled jobs | GitHub Actions cron (or cron-job.org) | Free |
| Email | Gmail API (OAuth, no SMTP) | Free |
| Calendar | Google Calendar API | Free |
| Holiday data | @hebcal/core (npm, Israel mode) | Free / open source |

---

## Quick start (local dev)

```bash
# 1. Clone and install
git clone https://github.com/YOUR_ORG/ipsc-dvirlab.git
cd ipsc-dvirlab
npm install

# 2. Copy and fill in env vars
cp .env.example .env.local
# → edit .env.local with your Supabase + Google credentials

# 3. Run the DB schema
# Open Supabase Dashboard → SQL Editor, paste contents of supabase/schema.sql, Run.

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

---

## Step-by-step setup

### 1 · Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Note your **Project URL** and **anon public key** (Settings → API).
3. Open SQL Editor → paste and run `supabase/schema.sql`.
4. Enable Google OAuth:
   - Authentication → Providers → Google → Enable
   - Paste your Google Client ID and Secret (see step 2 below).

### 2 · Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → New project.
2. Enable these APIs:
   - Gmail API
   - Google Calendar API
   - Google Identity / OAuth
3. Credentials → Create OAuth 2.0 Client ID (Web Application).
4. Authorised redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client Secret**.

### 3 · Obtain Gmail + Calendar refresh tokens

Use [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

1. Click ⚙️ → check "Use your own OAuth credentials" → enter Client ID & Secret.
2. Step 1: select scopes:
   - `https://mail.google.com/` (for Gmail send)
   - `https://www.googleapis.com/auth/calendar` (for Calendar events)
3. Authorise → Exchange for tokens → copy **Refresh Token**.
4. You can use one token for both Gmail + Calendar if you authorised both scopes together.

### 4 · Deploy Edge Functions to Supabase

```bash
# Install Supabase CLI if needed
npm install -g supabase

supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets (one-time)
supabase secrets set GMAIL_CLIENT_ID=xxx
supabase secrets set GMAIL_CLIENT_SECRET=xxx
supabase secrets set GMAIL_REFRESH_TOKEN=xxx
supabase secrets set GOOGLE_CALENDAR_CLIENT_ID=xxx
supabase secrets set GOOGLE_CALENDAR_CLIENT_SECRET=xxx
supabase secrets set GOOGLE_CALENDAR_REFRESH_TOKEN=xxx
supabase secrets set FROM_EMAIL=your@gmail.com

# Deploy functions
supabase functions deploy assignment-notify
supabase functions deploy daily-reminder
supabase functions deploy monthly-alert
```

### 5 · Configure assignment-notify webhook

1. Supabase Dashboard → Database → Webhooks → Create webhook.
2. Table: `assignment_audit`, Event: `INSERT`.
3. URL: `https://YOUR_PROJECT.supabase.co/functions/v1/assignment-notify`
4. HTTP Method: POST.
5. Add header: `Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`.

### 6 · Schedule daily-reminder (10:45 AM Jerusalem)

**Option A: GitHub Actions (recommended, free)**

Create `.github/workflows/daily-reminder.yml`:

```yaml
name: Daily reminder
on:
  schedule:
    - cron: "45 7 * * *"   # 10:45 Jerusalem summer (UTC+3)
    - cron: "45 8 * * *"   # 10:45 Jerusalem winter (UTC+2)
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/daily-reminder \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

Set `SUPABASE_SERVICE_ROLE_KEY` in GitHub → Settings → Secrets.

**Option B: cron-job.org (no GitHub needed)**

1. Register at [cron-job.org](https://cron-job.org) (free).
2. Create cron job: URL = Edge Function URL, schedule = 07:45 UTC.
3. Add header: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`.

### 7 · Schedule monthly-alert

Same approach, cron: `0 8 28-31 * *` (runs 08:00 UTC on days 28–31, function checks if it's last day of month).

### 8 · Deploy frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

vercel
# Follow prompts, link to your GitHub repo for auto-deploys

# Set env vars in Vercel Dashboard → Project → Settings → Environment Variables:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Or: push to GitHub, import project at [vercel.com](https://vercel.com).

---

## Jewish holidays

Handled by `@hebcal/core` in `src/lib/holidays.ts`:
- Uses **Israel mode** (1-day Yom Tov, no diaspora second days).
- Holiday names shown directly on calendar day cells.
- Statistics correctly categorise: holiday > Friday/Saturday > weekday.
- Holidays that fall on Friday/Saturday count as **holiday**, not weekend.

---

## Limitations on fully free stack

| Feature | Status | Notes |
|---|---|---|
| Email notifications | ✅ Fully automated | Via Gmail API + Supabase Edge Functions |
| Google Calendar events | ✅ Fully automated | Via Calendar API + Edge Functions |
| 10:45 AM reminder | ✅ Automated | Via GitHub Actions or cron-job.org cron |
| Monthly missing-coverage alert | ✅ Automated | Same cron approach |
| WhatsApp sending | ⚠️ Manual compose only | WhatsApp Business API requires paid account. App generates message text with 1-click copy + "Open in WA" button. |
| Auth (Google OAuth) | ✅ Fully automated | Via Supabase Auth |
| Email whitelist enforcement | ✅ Enforced | Checked in Next.js middleware against members table |

---

## Adding the first lab members

After deploying, seed the `members` table before anyone can log in:

```sql
-- Run in Supabase SQL Editor
INSERT INTO public.members (full_name, email, active, color_index)
VALUES
  ('Dvir Cohen',    'dvir@lab.ac.il',   true, 0),
  ('Noa Levi',      'noa@lab.ac.il',    true, 1),
  ('Amit Bar',      'amit@lab.ac.il',   true, 2);

-- Set responsible contact
UPDATE public.settings SET responsible_name = 'Dvir Cohen', responsible_email = 'dvir@lab.ac.il' WHERE id = 1;
```

After that, any lab member can add/edit members through the People screen in the app.

---

## Project structure

```
ipsc-dvirlab/
├── middleware.ts                     # Auth guard + email whitelist
├── .env.example                      # Env vars template
├── package.json
├── supabase/
│   ├── schema.sql                    # Full Postgres schema
│   └── functions/
│       ├── assignment-notify/        # Email + GCal on assignment change
│       ├── daily-reminder/           # 10:45 AM unreported duty reminder
│       └── monthly-alert/            # End-of-month coverage alert
└── src/
    ├── types/index.ts                # Shared TypeScript types
    ├── lib/
    │   ├── supabase.ts               # Browser Supabase client
    │   ├── supabase-server.ts        # Server Supabase client
    │   ├── holidays.ts               # @hebcal/core Jewish holiday detection
    │   └── colors.ts                 # Stable per-person colour palette
    ├── components/
    │   ├── Calendar.tsx              # Monthly calendar (primary view)
    │   └── DayModal.tsx              # Day detail / edit modal
    └── app/
        ├── calendar/page.tsx         # Calendar screen
        ├── stats/page.tsx            # Statistics screen
        ├── people/page.tsx           # Members management
        ├── archive/page.tsx          # Read-only past months
        └── settings/page.tsx         # Responsible contact + toggles
```
