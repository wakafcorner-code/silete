# ERP Manajemen — Production Deployment & Operations Guide

This guide outlines the production deployment architecture, prerequisites, orchestration with PM2, Nginx reverse proxy configuration with TLS/SSL, system monitoring, zero-downtime deployments, and rollback procedures.

---

## 1. System Requirements & Production Environment

### 1.1 Minimum Server Specifications
- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9) or Windows Server 2022
- **CPU**: 4 vCPUs (Recommended: 8 vCPUs for > 100 concurrent users)
- **RAM**: 8 GB RAM (Recommended: 16 GB with MariaDB buffer pool tuned)
- **Storage**: 100 GB NVMe SSD (with dedicated disk for database backups)
- **Network**: 1 Gbps dedicated network interface

### 1.2 Software Stack
- **Node.js**: `v20.x LTS` or `v22.x LTS`
- **Package Manager**: `npm v10.x+`
- **Process Manager**: `PM2 v5.x+`
- **Database Engine**: `MariaDB 10.11+ LTS` or `MySQL 8.0+ Enterprise`
- **Web Server / Reverse Proxy**: `Nginx 1.24+` with HTTP/2 and TLS 1.3

---

## 2. Production Environment Configuration

Create `/var/www/erp-manajemen/.env.production` (strictly owned by `www-data:www-data` with mode `600`):

```env
# Node Environment
NODE_ENV=production
PORT=3000

# Database Configuration (Connection Pooling)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=erp_prod_user
DB_PASSWORD=YOUR_STRONG_RANDOM_DATABASE_PASSWORD_HERE
DB_NAME=erp_manajemen
DB_CONNECTION_LIMIT=30

# Application URL & Security
NEXT_PUBLIC_APP_NAME="ERP Manajemen"
NEXT_PUBLIC_APP_URL="https://erp.yourcompany.com"

# Authentication & Cryptographic Secrets
AUTH_SECRET=GENERATE_64_CHAR_HEX_SECRET_KEY_HERE_FOR_PRODUCTION
AUTH_EXPIRES_IN=8h
```

> **Security Note**: Never commit production `.env.production` or `.env.local` to version control.

---

## 3. Production Build & Startup Workflow

### 3.1 Step-by-Step Build Pipeline

```bash
# 1. Navigate to deployment root
cd /var/www/erp-manajemen

# 2. Pull latest release tag
git fetch --tags
git checkout tags/v1.0.0

# 3. Clean install production dependencies
npm ci --omit=dev

# 4. Run database verification and regression suite
npm run test:all

# 5. Build Next.js optimized production bundle
npm run build
```

---

## 4. Process Management with PM2

Create `ecosystem.config.js` in project root:

```javascript
module.exports = {
  apps: [
    {
      name: "erp-manajemen",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: "max", // Cluster mode utilizing all available CPU cores
      exec_mode: "cluster",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "1G",
      error_file: "/var/log/erp-manajemen/error.log",
      out_file: "/var/log/erp-manajemen/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
```

### PM2 Commands
```bash
# Start application in cluster mode
pm2 start ecosystem.config.js --env production

# Save PM2 state for automatic restart on server reboot
pm2 save
pm2 startup

# Monitor live CPU, memory, and cluster health
pm2 status
pm2 monit
```

---

## 5. Nginx Reverse Proxy & SSL Configuration

Create `/etc/nginx/sites-available/erp-manajemen.conf`:

```nginx
# Upstream Next.js Cluster
upstream nextjs_upstream {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name erp.yourcompany.com;
    return 301 https://$host$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name erp.yourcompany.com;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/erp.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.yourcompany.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;" always;

    # Client Request Limits
    client_max_body_size 30M; # Max attachment upload limit
    client_body_buffer_size 128k;

    # Static Assets Caching
    location /_next/static {
        alias /var/www/erp-manajemen/.next/static;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /public {
        alias /var/www/erp-manajemen/public;
        expires 30d;
        access_log off;
    }

    # Proxy to Next.js App
    location / {
        proxy_pass http://nextjs_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable site and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/erp-manajemen.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Zero-Downtime Deployment & Rolling Updates

Use the automated zero-downtime deployment script `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "=== [1/5] Creating pre-deployment database backup ==="
npm run backup

echo "=== [2/5] Fetching latest source code ==="
git fetch origin main
git checkout main
git pull origin main

echo "=== [3/5] Installing dependencies & running tests ==="
npm ci --omit=dev
npm run test:all

echo "=== [4/5] Building production Next.js assets ==="
npm run build

echo "=== [5/5] Reloading PM2 Cluster (Zero-Downtime) ==="
pm2 reload ecosystem.config.js --env production

echo "✅ Deployment completed successfully with zero downtime!"
```

---

## 7. Rollback Procedures

If a critical incident or regression is detected post-deployment:

```bash
# Step 1: Immediately revert to previous stable release tag
git checkout tags/v1.0.0-previous

# Step 2: Reinstall dependencies & rebuild bundle
npm ci --omit=dev
npm run build

# Step 3: Reload PM2 cluster
pm2 reload ecosystem.config.js --env production

# Step 4: (If database schema/data was corrupted) Restore pre-deployment backup
npm run restore -- /var/www/erp-manajemen/backups/pre_deploy_backup.sql

# Step 5: Verify system health
npm run test:all
```
