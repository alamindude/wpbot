#!/bin/bash
# =============================================
# WhatsApp Bot - One-Click VPS Deploy Script
# Usage: sudo bash deploy.sh
# Tested on Ubuntu 20.04 / 22.04 / 24.04
# =============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓] $1${NC}"; }
warn()   { echo -e "${YELLOW}[!] $1${NC}"; }
error()  { echo -e "${RED}[✗] $1${NC}"; exit 1; }
info()   { echo -e "${BLUE}[→] $1${NC}"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   WhatsApp Order Bot - VPS Deploy        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Root check ──────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  error "Please run as root: sudo bash deploy.sh"
fi

# ─── Collect config ──────────────────────────────────
read -p "Enter your domain name (e.g. bot.example.com): " DOMAIN
read -p "Enter your email (for SSL cert): " EMAIL
read -p "Admin panel username [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}
read -s -p "Admin panel password: " ADMIN_PASS
echo ""
read -p "Global admin WhatsApp number (e.g. +1234567890): " GLOBAL_ADMIN
read -p "MongoDB URI [mongodb://localhost:27017/whatsapp_bot]: " MONGO_URI
MONGO_URI=${MONGO_URI:-mongodb://localhost:27017/whatsapp_bot}

APP_DIR="/var/www/whatsapp-bot"

info "Starting deployment for domain: $DOMAIN"

# ─── System Update ───────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ─── Node.js 20 ──────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
log "Node.js $(node -v) installed"

# ─── MongoDB ─────────────────────────────────────────
if ! command -v mongod &>/dev/null; then
  log "Installing MongoDB..."
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -qq
  apt-get install -y mongodb-org >/dev/null
  systemctl enable mongod
  systemctl start mongod
fi
log "MongoDB installed and running"

# ─── PM2 ─────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  npm install -g pm2 >/dev/null 2>&1
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1
fi
log "PM2 installed"

# ─── Nginx ───────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  log "Installing Nginx..."
  apt-get install -y nginx >/dev/null
fi
systemctl enable nginx
log "Nginx installed"

# ─── Certbot ─────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  log "Installing Certbot..."
  apt-get install -y certbot python3-certbot-nginx >/dev/null
fi
log "Certbot installed"

# ─── App Files ───────────────────────────────────────
log "Setting up application directory..."
mkdir -p "$APP_DIR"

# Copy files if running from source dir
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/package.json" ]; then
  cp -r "$SCRIPT_DIR/." "$APP_DIR/"
  log "Files copied from $SCRIPT_DIR"
else
  warn "Run this script from inside the project directory"
fi

# ─── .env ────────────────────────────────────────────
log "Generating .env configuration..."
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

cat > "$APP_DIR/.env" << EOF
# Server
PORT=3000
NODE_ENV=production
BASE_URL=https://$DOMAIN

# MongoDB
MONGODB_URI=$MONGO_URI

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Admin
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASS
SESSION_SECRET=$SESSION_SECRET

# WhatsApp
GLOBAL_ADMIN_NUMBER=$GLOBAL_ADMIN

# Files
FILES_DIR=$APP_DIR/files
MAX_FILE_SIZE_MB=50

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
EOF

log ".env created"

# ─── npm install ─────────────────────────────────────
log "Installing Node.js dependencies..."
cd "$APP_DIR"
npm install --production >/dev/null 2>&1
log "Dependencies installed"

# ─── Directories ─────────────────────────────────────
mkdir -p "$APP_DIR"/{logs,files,auth_info}
chmod 700 "$APP_DIR/auth_info"
log "Directories created"

# ─── Nginx Config ────────────────────────────────────
log "Configuring Nginx..."
cat > /etc/nginx/sites-available/whatsapp-bot << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 55M;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx
log "Nginx configured"

# ─── SSL ─────────────────────────────────────────────
log "Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect >/dev/null 2>&1 || warn "SSL cert failed - you can run: certbot --nginx -d $DOMAIN manually"
log "SSL configured"

# ─── PM2 Start ───────────────────────────────────────
log "Starting application with PM2..."
cd "$APP_DIR"
pm2 stop whatsapp-bot 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
log "Application started"

# ─── Firewall ────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow ssh >/dev/null
  ufw allow 80 >/dev/null
  ufw allow 443 >/dev/null
  ufw --force enable >/dev/null
  log "Firewall configured"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           DEPLOYMENT COMPLETE!                   ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Admin Panel: https://$DOMAIN"
echo "║  Username:    $ADMIN_USER"
echo "║  Password:    [as entered]"
echo "║"
echo "║  NEXT STEPS:"
echo "║  1. Open admin panel and go to Bot Control"
echo "║  2. Click 'Show QR' and scan with WhatsApp"
echo "║  3. Add products and approve users"
echo "║"
echo "║  USEFUL COMMANDS:"
echo "║  pm2 logs whatsapp-bot    # View logs"
echo "║  pm2 restart whatsapp-bot # Restart"
echo "║  pm2 status               # Check status"
echo "╚══════════════════════════════════════════════════╝"
echo ""
