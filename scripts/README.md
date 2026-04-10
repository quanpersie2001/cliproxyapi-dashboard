# Maintenance Scripts

Canonical documentation for the maintenance scripts now lives in [`docs/BACKUP.md`](../docs/BACKUP.md).

Scripts in this directory:

- [`backup.sh`](backup.sh)
- [`restore.sh`](restore.sh)
- [`rotate-backups.sh`](rotate-backups.sh)

Quick commands:

```bash
./scripts/backup.sh
./scripts/restore.sh backups/cliproxyapi_backup_YYYYMMDD_HHMMSS.tar.gz
./scripts/rotate-backups.sh 4
```
