# Deployment Runbook: Coolify on Hetzner

Date: 2026-04-13  
Owner: Platform Operations

## 1. Provision infrastructure (Hetzner)

1. Create a Hetzner VM for Coolify (Ubuntu LTS recommended).
2. Attach firewall rules:
   - Allow `22` from admin IPs only.
   - Allow `80` and `443` from the internet.
3. Attach backups/snapshots for the VM.

## 2. Create app in Coolify

1. Connect repository and set **Base Directory** to repository root (`.` or empty value).
2. Select Dockerfile deployment.
3. Ensure persistent volume mapping:
   - Container path: `/app/data`
4. Add environment variables from `.env.example`:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `DATABASE_URL=file:/app/data/prod.db`
   - `AUTH_ALLOW_MOCK_FALLBACK=false`
   - `AUTH_SESSION_TTL_HOURS=12`
   - `AUTH_MAX_FAILED_LOGIN_ATTEMPTS=5`
   - `AUTH_LOGIN_LOCKOUT_MINUTES=15`
   - `NEXT_PUBLIC_APP_URL=https://<your-domain>`

## 3. Health and readiness

1. Configure health check path as `/api/health`.
2. Success response is HTTP `200` with `{ status: "ok" }`.
3. A degraded DB state returns HTTP `503`.

## 4. Release process

1. Build image from root `Dockerfile`.
2. Deploy release.
3. Startup command runs:
   - `npx prisma migrate deploy`
   - `npm run start`
4. Validate:
   - Login page loads.
   - NGO user login works.
   - Facilitator dashboard loads.
   - `/api/health` returns 200.

## 5. Backup and restore

1. Keep the SQLite file in persistent volume (`/app/data/prod.db`).
2. Snapshot the volume/VM on a regular cadence.
3. Verify restore drills against staging before production changes.
