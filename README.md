This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Feature Flags

The phase workspace and deliverables rollout is controlled by environment flags:

- `PHASE_WORKSPACES_ENABLED` (`true` by default)
- `DELIVERABLES_LIFECYCLE_ENABLED` (`true` by default)

Examples:

```bash
PHASE_WORKSPACES_ENABLED=true
DELIVERABLES_LIFECYCLE_ENABLED=false
```

Recommended rollback order:

1. Disable `DELIVERABLES_LIFECYCLE_ENABLED`
2. Validate `/deliverables` and sidebar behavior
3. Disable `PHASE_WORKSPACES_ENABLED` if broader rollback is needed

## Hardening Operations

- Seed deterministic fixture orgs from `organizaciones.csv`:

```bash
npm run seed:hardening
```

- Runbooks:
  - `docs/operations/migration-safety-platform-hardening.md`
  - `docs/operations/backup-restore-runbook.md`
  - `docs/operations/authorization-audit-triage-runbook.md`
  - `docs/operations/hardening-rollout-checklist.md`

## Deployment (Coolify + Hetzner)

This repository now includes production deployment assets:

- `Dockerfile`
- `.dockerignore`
- `.env.example`
- `GET /api/health` health endpoint

Recommended settings:

1. Set app base directory to repository root (`.` or empty value).
2. Use the provided root `Dockerfile` build.
3. Configure a persistent volume mounted into `/app/data`.
4. Set `DATABASE_URL=file:/app/data/prod.db`.
5. Set `AUTH_ALLOW_MOCK_FALLBACK=false`.
6. Use `/api/health` as readiness/liveness probe.
7. After first deploy (or any fresh DB), provision credential users:

```bash
npm run seed:hardening
# optional bootstrap accounts:
# npm run provision:login
```

Both provisioning commands respect `DATABASE_URL`.

Production startup command is handled by the Docker image and runs:

```bash
npx prisma migrate deploy && npm run start
```
