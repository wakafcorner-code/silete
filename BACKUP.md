# ERP Manajemen — Backup & Disaster Recovery Strategy

This document outlines the backup policy, Recovery Point Objective (RPO), Recovery Time Objective (RTO), automated backup schedules, storage replication, and disaster recovery restoration procedures for **ERP Manajemen**.

---

## 1. Disaster Recovery Objectives

- **Recovery Point Objective (RPO)**: $\le 1$ hour (Maximum acceptable data loss window during catastrophic hardware failure).
- **Recovery Time Objective (RTO)**: $\le 30$ minutes (Target duration to restore full operational service from backup).
- **Data Integrity Guarantee**: 100% transactional consistency across multi-company ledgers ($\sum \text{Debit} \equiv \sum \text{Credit}$).

---

## 2. Backup Strategy & Schedules

| Backup Type | Frequency | Schedule | Retention Period | Storage Target |
| :--- | :--- | :--- | :--- | :--- |
| **Hourly Incremental / Binary Logs** | Every 1 Hour | Minute 0 of every hour | 7 Days | Local SSD + Offsite Object Storage |
| **Daily Full Backup** | Every 24 Hours | 01:00 AM UTC (Off-peak) | 30 Days | Encrypted S3 / Cloud Storage Bucket |
| **Weekly Master Snapshot** | Every Sunday | 02:00 AM UTC | 12 Months | Cold Archive / GCS Nearline |
| **Monthly Financial Snapshot** | End of Month | After Period Closing | 7 Years (Statutory Audit) | Immutable WORM Cloud Storage |

---

## 3. Automated Backup Execution

### 3.1 Using Integrated TypeScript Utility
The system includes an automated backup utility in `scripts/backup-db.ts` that dumps tables, validates row counts, and verifies foreign key integrity:

```bash
# Execute manual database backup
npm run backup

# Output:
# ✅ Backup successful!
#    File: /var/www/erp-manajemen/backups/backup_erp_manajemen_2026-08-20T17-00-00-000Z.sql
#    Tables: 35
#    Rows: 4250
#    Size: 450.20 KB
```z

### 3.2 Automated Linux Cron Job (`/etc/cron.d/erp-backup`)
```cron
# Daily full database backup at 01:00 AM
0 1 * * * root cd /var/www/erp-manajemen && npm run backup >> /var/log/erp-manajemen/backup.log 2>&1

# Sync backups to offsite encrypted storage at 01:30 AM
30 1 * * * root aws s3 sync /var/www/erp-manajemen/backups s3://company-erp-backups/database/ --sse AES256 --delete
```

### 3.3 Direct `mysqldump` Production Command
For large-scale enterprise databases, `mysqldump` with single-transaction consistency can be used:

```bash
mysqldump -u root -p \
  --single-transaction \
  --quick \
  --lock-tables=false \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --default-character-set=utf8mb4 \
  erp_manajemen | gzip > /var/backups/erp_manajemen_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz
```

---

## 4. Disaster Recovery & Restore Runbook

In the event of database corruption, ransomware, or server hardware loss:

### Step 1: Provision Clean Database Instance
```bash
mysql -u root -p -e "DROP DATABASE IF EXISTS erp_manajemen; CREATE DATABASE erp_manajemen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Step 2: Execute Database Restore
```bash
# Option A: Using TypeScript Restore Script
npm run restore -- /var/www/erp-manajemen/backups/backup_erp_manajemen_latest.sql

# Option B: Using MySQL CLI
gunzip < /var/backups/erp_manajemen_latest.sql.gz | mysql -u root -p erp_manajemen
```

### Step 3: Run Full System Health & Accounting Reconciliation Verification
```bash
# Run complete test suite to verify data integrity post-restore
npm run test:all
```

---

## 5. Routine Disaster Recovery Drill

Disaster recovery drills must be performed **quarterly**:
1. Restore the latest backup dump into an isolated staging database.
2. Run `npm run test:all` against the staging instance.
3. Validate Trial Balance equality ($\sum \text{Dr} = \sum \text{Cr}$) and subledger AR/AP integrity.
4. Record drill results and RTO duration in the audit compliance log.
