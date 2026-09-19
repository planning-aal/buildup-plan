# Cloudflare deployment — Armana Production Planning System

Nothing in this guide runs automatically. The application keeps working with
browser session data until these steps are completed with an Armana-owned
Cloudflare account.

## 1. Prerequisites

- Cloudflare account with Workers Paid (D1 + R2 enabled)
- `bun install` completed locally
- Wrangler: `bunx wrangler --version`
- Access to the existing Worker for this project — **update it, do not create a second one**

## 2. Login and inspect what already exists

```bash
bunx wrangler login
bunx wrangler whoami
bunx wrangler deployments list        # confirm the existing Worker
bunx wrangler d1 list
bunx wrangler r2 bucket list
```

If a Worker for this project already exists, reuse its name in `wrangler.toml`.
Never delete an existing Worker, database or bucket.

## 3. Create the databases (one per environment)

```bash
bunx wrangler d1 create armana-planning-dev
bunx wrangler d1 create armana-planning-staging
bunx wrangler d1 create armana-planning-prod
```

Copy each returned `database_id` into the matching `[[env.*.d1_databases]]`
block in `wrangler.toml`.

## 4. Create the file storage buckets

```bash
bunx wrangler r2 bucket create armana-planning-dev
bunx wrangler r2 bucket create armana-planning-staging
bunx wrangler r2 bucket create armana-planning-prod
```

The names must match the `bucket_name` values in `wrangler.toml`.
Keep all buckets private. Files are served only through the authenticated
download endpoints.

## 5. Run the migrations

The development environment is the top-level config in `wrangler.toml`, so dev
commands take **no** `--env` flag. Staging and production do.

```bash
bunx wrangler d1 migrations apply armana-planning-dev --remote
bunx wrangler d1 migrations apply armana-planning-staging --env staging --remote
bunx wrangler d1 migrations apply armana-planning-prod --env production --remote
```

Migrations are ordered and immutable: `0001_initial_schema`,
`0002_smv_versioning`, `0003_production_plan`, `0004_reports`,
`0005_audit_logs`. Never edit an applied migration — add a new one.

## 6. Configuration and secrets

Non-secret values live in `wrangler.toml` (`ENVIRONMENT`, `APP_BASE_URL`,
`ALLOWED_ORIGINS`). Secrets are set through Wrangler and never committed. The
names must match what the Worker reads:

```bash
bunx wrangler secret put CF_ACCESS_AUD --env production            # Cloudflare Access application audience
bunx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env production
```

Set `APP_BASE_URL` per environment; the application never hard-codes a
`workers.dev` address.

## 7. Authentication (Cloudflare Access)

1. Zero Trust → Access → Applications → Add a self-hosted application for the
   Worker hostname.
2. Add an Access policy for the Armana identity provider.
3. Copy the application audience tag into the `CF_ACCESS_AUD` secret.

The Worker reads `cf-access-authenticated-user-email` and
`cf-access-jwt-assertion`, then looks the person up in the `users` table to get
their role and factory. Add users with:

```bash
bunx wrangler d1 execute armana-planning-prod --env production --remote \
  --command "INSERT INTO users (id, factory_id, email, user_name, role, active) VALUES ('usr_1','fac_armana_apparels','name@armanagroup.com','Full Name','PLANNER',1)"
```

Roles: ADMIN, PLANNER, IE, PRODUCTION, MANAGEMENT, VIEWER.

## 8. Deploy

Development is the top-level environment — no flag:

```bash
bunx wrangler deploy
bunx wrangler deploy --env staging
bunx wrangler deploy --env production
```

Verify after each deploy:

```bash
curl https://<hostname>/api/health
```

Expected: `{"status":"ok","environment":"production","services":{"database":true,"storage":true}}`.

## 9. Custom domain

Workers & Pages → the Worker → Settings → Domains & Routes → Add custom domain
→ `capacity.armanagroup.com`. Then update `APP_BASE_URL` for production and
redeploy.

## 10. Rollback

```bash
bunx wrangler deployments list --env production
bunx wrangler rollback <deployment-id> --env production
```

Database rollback is forward-only: write a new migration that reverses the
change. Never drop tables holding historical plans or reports.

## 11. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cloud database is not configured` | D1 binding missing | check `[[env.*.d1_databases]]` binding name is `DB` |
| `File storage is not configured` | R2 binding missing | binding name must be `FILES` |
| 401 on every request | Access not in front of the hostname | add the Access application, or set `ENVIRONMENT=development` locally |
| 403 for a signed-in person | no `users` row, or wrong role | insert/adjust the user row |
| Upload returns 409 | the same file was already uploaded | choose USE EXISTING VERSION or UPLOAD AS NEW VERSION |
| Export returns `EXPORT_VALIDATION_FAILED` | workbook failed its own checks | nothing is published; check the Worker log with the returned reference ID |
