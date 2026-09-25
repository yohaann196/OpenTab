# Deploy OpenTab to Vercel

This guide puts OpenTab at **https://yohaan.tech/opentab**. For another domain, swap in your own. It takes about 10 minutes, and
you only click through websites. Nothing needs to be installed.

**What you need:**
- A GitHub account. You already have one.
- A Vercel account. Choose **Continue with GitHub**; that is the only new login.
- Access to your domain's DNS settings. Here that is manage.get.tech.

**What it costs:** $0, with no credit card. Vercel's free Hobby plan is meant for personal, non-commercial projects.

> **Why not GitHub Pages?** Pages only serves static files. OpenTab needs a server for sign-in, ballots and the database, so it
> can't run there.

## 1. Create the Vercel project

1. Go to <https://vercel.com/signup> → **Continue with GitHub**.
2. **Add New… → Project** → import **yohaan196/opentab**. Grant Vercel's GitHub app access to the repo if asked.
3. Set **Root Directory** to **`apps/web`**. Leave the framework (Next.js) and build settings as detected; `apps/web/vercel.json`
   sets them.
4. Don't deploy yet. First add a database and the settings below. If it already deployed and failed, that's fine; just redeploy
   at the end.

## 2. Add a database (pick one)

### Option A: Neon (recommended, no extra signup)

1. In the project, go to **Storage → Create Database → Neon (Serverless Postgres)** and use the free plan.
2. Connect it to the project for all environments.
3. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` for you.

### Option B: Supabase (a second account)

1. Sign in at <https://supabase.com> with GitHub → **New project**. Save the database password.
2. Click **Connect** at the top of the project, and copy two connection strings. Put your password into each.
   - **Transaction pooler** (port **6543**) → add it in Vercel as `DATABASE_URL`.
   - **Session pooler** (port **5432**) → add it in Vercel as `DATABASE_URL_UNPOOLED`.
3. Use the *pooler* strings, not "Direct connection". The direct host is IPv6-only, and Vercel can't reach it.

Either way, the build creates the tables for you.

## 3. Environment variables

In Vercel, go to **Settings → Environment Variables** and add these to all environments:

| Name | Value |
| --- | --- |
| `BASE_PATH` | `/opentab` |
| `APP_URL` | `https://yohaan.tech/opentab` |
| `BETTER_AUTH_SECRET` | A long random string. Mash the keyboard for 40+ characters, or run `openssl rand -base64 32`. |
| `CRON_SECRET` | Another random string |

**Optional variables:**
- `SMTP_URL` and `EMAIL_FROM` for real email.
  - Example with Gmail: turn on 2-step verification, create an *app password*, then set
    `smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`.
  - Without SMTP, emails are only written to the logs. Password sign-in still works, and the "email me a link" button is hidden.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` for push notifications to phones.
  - Generate them with `npx web-push generate-vapid-keys`, or with `pnpm --filter @opentab/worker vapid` from a clone.
- `SEED_DEMO=0` to skip creating the demo tournament.

## 4. Deploy

Go to **Deployments → Redeploy**, or push to the repo. Each build:
1. applies database migrations;
2. creates the demo tournament once;
3. builds the site.

When it finishes, open `https://<project>.vercel.app/opentab` to check that it works.

## 5. Point yohaan.tech at Vercel

1. In Vercel, go to **Settings → Domains** → add **`yohaan.tech`**. Vercel then shows the DNS record it wants.
2. At **manage.get.tech**, open your domain → **DNS Management**. Add the record exactly as Vercel shows it; usually that is:

   | Type | Host | Value |
   | --- | --- | --- |
   | A | `@` (blank) | `76.76.21.21` |

   Delete any other `A` record on `@` that points elsewhere, such as a parking page.

   If get.tech has no DNS Management option, the domain is using other nameservers. Switch it back to get.tech's default
   nameservers, or add the record wherever DNS is hosted.
3. Wait for Vercel's domain status to go green. That usually takes minutes but can take up to a few hours. HTTPS is set up
   automatically.

**Result:**
- `https://yohaan.tech/opentab` is OpenTab.
- `https://yohaan.tech/` redirects there.
- If you later want a different site at the root, remove `BASE_PATH`'s redirect in `apps/web/next.config.ts` and host that site
  separately. Or keep OpenTab here and add pages.

## 6. First sign-in

- **Demo tournament:** `https://yohaan.tech/opentab/t/opentab-invitational`
- **Demo tab room:** sign in as `demo@opentab.dev` / `opentab-demo`.
  - That password is public, so anyone can edit the demo.
  - It's harmless, but set `SEED_DEMO=0`, delete the demo, or change its password before running a real tournament.
- **Your own account:** **Get started** → create an account → **New tournament**.

## How it runs on Vercel

Serverless functions can't hold a database connection open or run a background worker. OpenTab switches modes automatically
when it detects Vercel:

- **Live updates poll** a tiny, edge-cached endpoint every ~8 s (`LIVE_MODE=poll`), instead of a Postgres `LISTEN` stream.
- **Notifications are sent inline** right after the response (`JOB_MODE=inline`), instead of by `apps/worker`.
- **Scheduled publishes** are picked up by an opportunistic sweep while anyone uses the tab room or watches a tournament. A daily
  Vercel Cron also calls `/opentab/api/cron/tick`. If you change `BASE_PATH`, update the cron path in `apps/web/vercel.json`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Build fails with `DATABASE_URL is not set` | The database isn't connected to this environment. See step 2. |
| Build fails with `BETTER_AUTH_SECRET must be set` | Add it (step 3) and redeploy. |
| `prepared statement … does not exist` | Your pooled URL wasn't detected. Add `DB_POOLED=1`. |
| Pages 404 at `/opentab` | `BASE_PATH` must be set *before* the build. Redeploy after adding it. |
| Links in emails or QR codes point to the wrong place | Check that `APP_URL` includes `/opentab`. |
