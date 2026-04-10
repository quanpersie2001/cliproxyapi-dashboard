# Backup and Restore

Canonical docs hub: [`docs/README.md`](README.md)

## Scripts

The backup workflow is implemented by:

- [`../scripts/backup.sh`](../scripts/backup.sh)
- [`../scripts/restore.sh`](../scripts/restore.sh)
- [`../scripts/rotate-backups.sh`](../scripts/rotate-backups.sh)

## Create a Backup

```bash
./scripts/backup.sh
```

Backups are written to:

```text
backups/cliproxyapi_backup_YYYYMMDD_HHMMSS.tar.gz
```

## What Is Included

The current backup script archives:

- PostgreSQL dump from the bundled `postgres` container
- `infrastructure/config/config.yaml`
- `infrastructure/.env.backup` when `infrastructure/.env` exists
- `infrastructure/docker-compose.override.yml.backup` when an override file exists
- `auth-dir.tar.gz` when the `cliproxyapi_auths` volume exists

Notes:

- Logs are not backed up by default.
- The `.env` snapshot is stored for recovery reference; restore will not overwrite an existing `infrastructure/.env` automatically.

## Restore From Backup

```bash
./scripts/restore.sh backups/cliproxyapi_backup_20260411_020000.tar.gz
```

The restore script currently:

1. extracts the archive to a temp directory
2. restores `infrastructure/.env` only if one does not already exist
3. restores `docker-compose.override.yml` only if one does not already exist
4. stops the stack
5. starts `postgres`
6. drops and recreates the `public` schema
7. imports the SQL dump
8. restores `config.yaml`
9. restores the auth volume if `auth-dir.tar.gz` is present
10. brings the stack back up with `--wait`

If an existing `.env` or override file is already present, the backup copy is written alongside it with a `.restored-from-backup` suffix for manual review.

## Rotate Backups

```bash
./scripts/rotate-backups.sh 4
```

This keeps the newest `N` archives and deletes older ones.

## Automated Backups

When enabled through `install.sh`, cron is configured like this:

- daily backup: `0 2 * * *`
- weekly backup: `0 2 * * 0`

The cron job also runs backup rotation after each backup.

View the current cron setup:

```bash
sudo crontab -l
```

View backup logs:

```bash
tail -f backups/backup.log
```

## Operational Advice

- test restores periodically
- copy archives off-host
- encrypt backup archives before remote transfer when possible
- keep `infrastructure/.env` protected because it contains the secrets required to use the restored stack
