# Cloudflare deployment — Armana Production Planning System

## What am I actually setting up?

Today the app runs only inside your browser. Plans, settings and SMV files
disappear when the session ends. This deployment moves everything onto
Cloudflare so data is saved permanently and everyone at Armana can use it.

You are creating **three things** in your Cloudflare account:

| # | Thing | What it is, in plain words | Used for |
| --- | --- | --- | --- |
| 1 | **Database (D1)** | Like a very reliable Excel workbook in the cloud | Plans, styles, SMVs, calendar, history |
| 2 | **File storage (R2)** | A private cloud locker for files | Your uploaded Excel files and generated reports |
| 3 | **The website (Worker)** | The app itself, running on Cloudflare's computers | capacity.armanagroup.com |

The whole job is: create #1 and #2, tell the website where they are, set up
logins, then switch the website on. Nothing in this guide runs automatically —
you run each command yourself on your computer, in the project folder.

**One-time setup:** Cloudflare Workers Paid plan (D1 and R2 need it), Node/Bun
installed, and a terminal open in this project folder.

**Golden rule:** if a Worker, database or bucket already exists from earlier
work, REUSE it. Never delete existing ones.

---

## The 8 steps

### Step 1 — Log in to Cloudflare from your computer

```bash
npx wrangler login
npx wrangler whoami
```

A browser window opens; sign in with the Armana Cloudflare account.
`whoami` confirms it worked by showing your account.

### Step 2 — Check what already exists

```bash
npx wrangler deployments list
npx wrangler d1 list
npx wrangler r2 bucket list
```

If a Worker for this project already appears, keep its name and reuse it —
do not create a second one. If `d1 list` or `bucket list` already shows an
Armana database/bucket, skip creating that one in steps 3–4.

### Step 3 — Create the database (one per environment)

Dev = for testing, Staging = dress rehearsal, Production = the real one.

```bash
npx wrangler d1 create armana-planning-dev
npx wrangler d1 create armana-planning-staging
npx wrangler d1 create armana-planning-prod
```

Each command prints a `database_id` (a long code). Paste that code into the
matching `[[env.*.d1_databases]]` block in `wrangler.toml`. This is how the
website finds its database.

### Step 4 — Create the file storage (one per environment)

```bash
npx wrangler r2 bucket create armana-planning-dev
npx wrangler r2 bucket create armana-planning-staging
npx wrangler r2 bucket create armana-planning-prod
```

Names must match `bucket_name` in `wrangler.toml`. Keep buckets private —
files are downloaded only through the app after sign-in, never by a public link.

### Step 5 — Build the tables inside each database

```bash
npx wrangler d1 migrations apply armana-planning-dev --remote
npx wrangler d1 migrations apply armana-planning-staging --env staging --remote
npx wrangler d1 migrations apply armana-planning-prod --env production --remote
```

This creates all 18 tables (plans, styles, SMVs, calendar, history...) and
seeds Armana Apparels Ltd with Lines 1–12. Dev commands take **no** `--env`
flag; staging and production do.

Migrations are numbered (0001…0005) and frozen once applied. To change the
database later, add a new numbered file — never edit an applied one.

### Step 6 — Set up sign-in (Cloudflare Access)

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Add a
   self-hosted application** for your website address.
2. Add a policy allowing the Armana email domain / identity provider.
3. Cloudflare gives the app an "audience tag" (AUD). Save it as a secret:

```bash
npx wrangler secret put CF_ACCESS_AUD --env production
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env production
```

4. List the people allowed to use the app (one command per person):

```bash
npx wrangler d1 execute armana-planning-prod --env production --remote \
  --command "INSERT INTO users (id, factory_id, email, user_name, role, active) VALUES ('usr_1','fac_armana_apparels','name@armanagroup.com','Full Name','PLANNER',1)"
```

Roles: ADMIN (everything), PLANNER (upload + generate + export),
IE (SMV + capacity), PRODUCTION (view), MANAGEMENT (dashboard + reports),
VIEWER (read-only).

### Step 7 — Switch it on (deploy)

```bash
npx wrangler deploy              # development
npx wrangler deploy --env staging
npx wrangler deploy --env production
```

After each deploy, open in a browser:

```
https://<your-worker-address>/api/health
```

Expected: `{"status":"ok","environment":"production","services":{"database":true,"storage":true}}`.
If it says `"database":false`, redo steps 3/5. If `"storage":false`, redo step 4.

### Step 8 — Give it the real address

Cloudflare dashboard → **Workers & Pages → your Worker → Settings →
Domains & Routes → Add custom domain** → `capacity.armanagroup.com`.
Then update `APP_BASE_URL` for production in `wrangler.toml` and deploy once
more (`npx wrangler deploy --env production`).

---

## If something goes wrong

Undo a bad release:

```bash
npx wrangler deployments list --env production
npx wrangler rollback <deployment-id> --env production
```

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cloud database is not configured` | database ID not pasted into `wrangler.toml` | step 3: paste `database_id`, binding name must be `DB` |
| `File storage is not configured` | bucket missing or misnamed | step 4, binding name must be `FILES` |
| 401 on every request | sign-in (Access) not set up | step 6, or set `ENVIRONMENT=development` for local testing |
| 403 for a signed-in person | their email is not in the `users` table | step 6.4: add the user row |
| Upload says "already uploaded" | same file uploaded before | normal behaviour — choose USE EXISTING or NEW VERSION |
| Export fails with a reference ID | workbook failed internal checks | nothing was published; send the reference ID for investigation |

Database changes are forward-only: write a new migration, never delete tables
holding historical plans or reports.

Still stuck? Paste the exact error message here and I'll tell you precisely
what to change.
