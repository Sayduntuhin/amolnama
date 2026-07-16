# JVAI Management — VPS Deployment Guide (Dockerized Edition)

This guide details how to deploy, run, and configure the JVAI Management application on your VPS using **Docker**, **Docker Compose**, and **Nginx**.

---

## 1. Install Docker & Docker Compose on the VPS
Access your VPS terminal via SSH and run the following commands to install Docker and Docker Compose:

```bash
# Update package registry
apt update && apt upgrade -y

# Install Docker dependencies
apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up the stable Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/nginx/sites-available/docker.list > /dev/null
# (Alternatively install docker direct using apt-get)
apt update
apt install -y docker.io docker-compose-v2

# Verify Docker service is active
systemctl status docker --no-pager
```

---

## 2. Prepare Project Directory & Host Database Files
Make sure the target directory exists on your VPS:

```bash
mkdir -p /var/www/jvai-management
```

To run Docker Compose with volume persistence, **empty placeholders or existing database files must exist on the VPS host folder** before booting the container:

```bash
cd /var/www/jvai-management

# Create database json files if they do not exist
touch database.json
touch database_backup.json

# If you have existing data, write/copy it into database.json on the host. 
# Make sure database.json is valid JSON (e.g. at least contains empty object {} or [] if brand new).
echo "{}" > database.json
echo "{}" > database_backup.json
```

---

## 3. Upload Project Files from Local Machine (Windows)
Open a **new, separate PowerShell window** on your local Windows machine, and run the following `scp` commands to upload the Docker configuration files and source code to the VPS:

```powershell
cd "c:\Users\Saydun Nabi Tuhin\Projects\React\jvai_managment\jvai_managment"

# Upload docker, configs and source code (node_modules & local dist will be ignored)
scp -r src public package.json package-lock.json tsconfig.json vite.config.ts server.ts Dockerfile docker-compose.yml .dockerignore .env.example root@172.252.13.74:/var/www/jvai-management/
```

---

## 4. Run with Docker Compose
Switch back to your **VPS SSH terminal**, navigate to the project directory, and create your production environment configuration file:

```bash
cd /var/www/jvai-management

# Create the host env configuration file
echo "PORT=4000" > .env
echo "NODE_ENV=production" >> .env
# (Optional: Add your Gemini API Key)
# echo "GEMINI_API_KEY=your_key" >> .env

# Build and start the container in detached (background) mode
docker compose up -d --build
```

### Useful Docker commands:
- **View running containers:** `docker ps`
- **View container application logs:** `docker logs jvai-management`
- **Stop application:** `docker compose down`

---

## 5. Nginx Reverse Proxy Setup (`amolnama.jvaisite.com`)
Configure Nginx to map port 80 requests for your domain to the Docker container running on port 4000.

1. **Install Nginx:**
   ```bash
   apt install nginx -y
   ```

2. **Create Nginx site configuration:**
   ```bash
   nano /etc/nginx/sites-available/jvai-management
   ```

   Paste the following config block:
   ```nginx
   server {
       listen 80;
       server_name amolnama.jvaisite.com;

       location / {
           proxy_pass http://localhost:4000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           client_max_body_size 50M;
       }
   }
   ```

   *Save and exit Nano (`CTRL + O`, `Enter`, then `CTRL + X`).*

3. **Activate the site configuration:**
   ```bash
   ln -s /etc/nginx/sites-available/jvai-management /etc/nginx/sites-enabled/
   rm /etc/nginx/sites-enabled/default
   nginx -t
   systemctl restart nginx
   ```

---

## 6. Secure with Free Let's Encrypt SSL (HTTPS)
Secure your domain `amolnama.jvaisite.com` with a secure SSL certificate:

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Generate certificate and configure HTTPS redirect automatically
certbot --nginx -d amolnama.jvaisite.com
```
