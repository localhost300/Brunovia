# Disaster recovery

Targets: production RPO 24 hours or better, RTO 4 hours. Enable Supabase point-in-time recovery for a tighter RPO; the repository scripts provide an independent logical backup and restore test.

## Routine

1. Run `scripts/backup-database.ps1` from a protected runner using a short-lived database URL.
2. Encrypt and copy the SQL files and checksum manifest to immutable storage in a second region/account.
3. Run `scripts/verify-restore.ps1` against the newest backup weekly. It restores only into a disposable PostgreSQL container and deletes that container afterward.
4. Record evidence, duration, row-count checks, and operator identity in the compliance system.

## Incident recovery

Declare an incident, freeze writes, identify the recovery point, preserve logs, create a new Supabase project, restore schema before data, configure Auth/Storage secrets, deploy Edge Functions, run smoke tests, rotate credentials, then switch traffic. Never restore experimentally into the active production database.

## Migration rollback

Database migrations are forward-only. Before a high-risk migration, take and verify a backup. Prefer a compensating migration that restores compatible schema/data over editing an applied file. For destructive changes, use expand/migrate/contract across separate releases. Application releases must remain compatible with both the old and expanded schema until backfill verification completes.
