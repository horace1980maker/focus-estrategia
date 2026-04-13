# Backup and Restore Runbook

Date: 2026-04-05  
Owner: Platform Operations

## Backup procedure (SQLite)

1. Stop write-heavy jobs or put app in maintenance mode.
2. Copy database file (local dev path example):

```bash
copy prisma\dev.db backups\dev-<YYYYMMDD-HHMM>.db
```

Production container path example:

```bash
cp /app/data/prod.db /backups/prod-<YYYYMMDD-HHMM>.db
```

3. If WAL mode is enabled, copy sidecar files too:

```bash
copy prisma\dev.db-wal backups\dev-<timestamp>.db-wal
copy prisma\dev.db-shm backups\dev-<timestamp>.db-shm
```

4. Record checksum and owner in backup log.

## Restore procedure

1. Stop the app process.
2. Move current DB out of the way:

```bash
move prisma\dev.db prisma\dev.db.pre-restore
```

3. Copy backup into place:

```bash
copy backups\dev-<timestamp>.db prisma\dev.db
```

Production container path example:

```bash
cp /backups/prod-<timestamp>.db /app/data/prod.db
```

4. Start app and run health checks:
   - authentication login endpoint
   - org dashboard endpoint
   - cohort dashboard endpoint
   - audit events endpoint

## Validation checklist after restore

1. `Organization`, `User`, and `PhaseTracker` row counts are expected.
2. `AuditEvent` table contains recent records.
3. ROI settings and benchmark history are readable.
4. Phase actions still enforce authorization.

## Ownership

- Backup execution: Platform operator on duty
- Restore approval: Engineering lead or facilitator lead
- Verification sign-off: Product operations
