#!/bin/bash
set -e

# Configuración inicial del VPS para el TPV.
# Ejecutar como root o con sudo.

APP_DIR="/var/www/tpv"
LOG_DIR="/var/log/tpv"
NGINX_AVAILABLE="/etc/nginx/sites-available/tpv.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/tpv.conf"
DB_NAME="${DB_NAME:-tpv}"
DB_USER="${DB_USER:-tpv_user}"
DB_PASSWORD="${DB_PASSWORD:-cambia-esta-password}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

echo "=== Preparando VPS para TPV ==="

echo "→ Creando directorios..."
mkdir -p "$APP_DIR" "$LOG_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" "$LOG_DIR"

echo "→ Instalando paquetes base..."
apt update
apt install -y curl git nginx postgresql postgresql-contrib

echo "→ Instalando Node.js 20 LTS si no está disponible..."
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

echo "→ Instalando PM2 globalmente..."
npm install -g pm2

echo "→ Creando usuario y base de datos PostgreSQL..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "→ Copiando configuración de Nginx..."
cp nginx/tpv.conf "$NGINX_AVAILABLE"
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

echo "→ Configurando PM2 al arranque..."
su - "$DEPLOY_USER" -c "pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER" || true
su - "$DEPLOY_USER" -c "pm2 save" || true

echo "=== VPS preparado ==="
echo "Siguientes pasos:"
echo "1. Clona el repositorio en /home/$DEPLOY_USER/tpv"
echo "2. Crea el .env de producción con DATABASE_URL, PORT, CLIENT_URL y JWT_SECRET"
echo "3. Ejecuta ./deploy.sh para compilar y arrancar la app"
echo "4. Configura SSL con Certbot usando ./setup-ssl.sh una vez que el dominio apunte al VPS"
