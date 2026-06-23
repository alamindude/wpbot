# WhatsApp Order Bot — VPS Setup Guide

## Prerequisites

- Ubuntu 20.04 / 22.04 / 24.04 VPS
- A domain name pointing to your VPS IP
- Root or sudo access

---

## Option A: One-Click Deploy (Recommended)

```bash
git clone https://github.com/yourrepo/whatsapp-bot.git
cd whatsapp-bot
sudo bash scripts/deploy.sh
```

Follow the prompts. Done in ~5 minutes.

---

## Option B: Manual Step-by-Step

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # Should show v20.x.x
```

### 3. Install MongoDB

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
```

### 4. Install PM2

```bash
sudo npm install -g pm2
pm2 startup systemd -u $USER --hp $HOME
```

### 5. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 6. Clone & Configure App

```bash
sudo mkdir -p /var/www/whatsapp-bot
sudo chown $USER:$USER /var/www/whatsapp-bot
cd /var/www/whatsapp-bot

# Copy your project files here, then:
npm install --production

# Create .env
cp .env.example .env
nano .env   # Fill in your values
```

### 7. Configure .env

```env
PORT=3000
NODE_ENV=production
BASE_URL=https://yourdomain.com
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_strong_password
GLOBAL_ADMIN_NUMBER=+1234567890
FILES_DIR=/var/www/whatsapp-bot/files
```

### 8. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/whatsapp-bot
```

Paste the contents from `nginx.conf` in this project, replacing `yourdomain.com`.

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 9. SSL Certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com --email you@email.com --agree-tos
```

### 10. Start the App

```bash
cd /var/www/whatsapp-bot
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

---

## Post-Deploy Setup

### Connect WhatsApp Bot

1. Open `https://yourdomain.com` in your browser
2. Log in with admin credentials
3. Click **Bot Control** → **Show QR**
4. Open WhatsApp on your phone → Linked Devices → Link a Device
5. Scan the QR code

### Add Your First Product

1. Go to **Products** → **Add Product**
2. Fill in name, shortcode (e.g. `premiumbox`), price
3. Add your WhatsApp number as assigned admin
4. Click Create

### Approve Users

Users who message the bot with `/start` appear in the **Users** page with "pending" status. Click **Approve** to grant access.

---

## Useful Commands

```bash
# View live logs
pm2 logs whatsapp-bot

# Restart bot
pm2 restart whatsapp-bot

# Stop bot
pm2 stop whatsapp-bot

# Check status
pm2 status

# MongoDB shell
mongosh whatsapp_bot

# Nginx logs
sudo tail -f /var/log/nginx/whatsapp-bot.error.log

# Renew SSL (auto via cron, manual if needed)
sudo certbot renew
```

---

## Directory Structure

```
/var/www/whatsapp-bot/
├── src/
│   ├── index.js          # Entry point
│   ├── bot/
│   │   ├── whatsapp.js   # Baileys connection
│   │   ├── messageHandler.js    # User command handler
│   │   └── adminResponseHandler.js  # Admin reply matcher
│   ├── models/           # MongoDB schemas
│   ├── routes/           # Express API routes
│   ├── middleware/        # Auth, rate limiting
│   └── utils/            # Logger
├── admin-panel/
│   └── public/           # HTML/CSS/JS admin UI
├── config/
│   └── database.js
├── auth_info/            # WhatsApp session (DO NOT DELETE)
├── files/                # Order response files
├── logs/                 # PM2 logs
├── .env                  # Configuration
└── ecosystem.config.js   # PM2 config
```

---

## Security Notes

- Change default admin password immediately after first login
- Keep `auth_info/` directory backed up (it's your WhatsApp session)
- Never expose port 3000 directly — always use Nginx
- Run `sudo ufw allow ssh && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable`

---

## Troubleshooting

**Bot not connecting:**
```bash
pm2 logs whatsapp-bot --lines 50
# Check for QR code in logs or use admin panel
```

**MongoDB connection failed:**
```bash
sudo systemctl status mongod
sudo systemctl restart mongod
```

**Port 3000 already in use:**
```bash
sudo lsof -i :3000
kill -9 <PID>
pm2 restart whatsapp-bot
```

**QR expired (scan within 60 seconds):**
- Go to Bot Control → Restart → Show QR again

**Session lost after VPS reboot:**
```bash
pm2 resurrect   # Restores last saved PM2 processes
```
