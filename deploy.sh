#!/bin/bash
set -e

# Script de despliegue del TPV para un VPS Linux.
# Requisitos previos:
# - El repositorio debe estar clonado en $REPO_DIR
# - Node.js, npm, PM2 y PostgreSQL deben existir
# - El archivo .env de producción debe estar creado en /var/www/tpv/server o en el repo

# Variables
APP_DIR="/var/www/tpv"
REPO_DIR="/home/deploy/tpv"
LOG_DIR="/var/log/tpv"

echo "=== Desplegando TPV ==="

# 1. Ir al repo y pull
echo "→ Actualizando código..."
cd "$REPO_DIR"
git pull origin main

# 2. Instalar dependencias
echo "→ Instalando dependencias..."
npm install --production=false

# 3. Build
echo "→ Compilando..."
npm run build:all

# 4. Generar cliente Prisma y aplicar migraciones ya creadas
echo "→ Ejecutando migraciones..."
cd server
npx prisma generate
npx prisma migrate deploy
cd ..

# 5. Desplegar frontend para Nginx
echo "→ Desplegando frontend..."
mkdir -p "$APP_DIR" "$LOG_DIR"
rm -rf "$APP_DIR/client"
cp -r client/dist "$APP_DIR/client"

# 6. Reiniciar backend con PM2
echo "→ Reiniciando servidor..."
pm2 startOrRestart server/ecosystem.config.js --env production

# 7. Verificar que todo está corriendo
echo "→ Verificando..."
sleep 2
pm2 status
curl -s http://localhost:3001/api/health | head -c 100
echo ""

echo "=== Despliegue completado ==="
