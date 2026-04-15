#!/bin/bash
set -e

# Configuración de HTTPS con Let's Encrypt.
# Requisitos antes de ejecutar este script:
# - El dominio debe apuntar al VPS mediante un registro A o AAAA en DNS.
# - Los puertos 80 y 443 deben estar abiertos en el firewall del servidor.
# - La configuración de Nginx debe estar activa y responder para ese dominio.
# - Certbot modificará automáticamente la configuración de Nginx para añadir el bloque SSL.

DOMAIN=${1:-"tpv.tudominio.com"}

echo "=== Configurando SSL para $DOMAIN ==="

# 1. Instalar Certbot si no está
if ! command -v certbot &> /dev/null; then
    echo "→ Instalando Certbot..."
    apt update
    apt install -y certbot python3-certbot-nginx
fi

# 2. Obtener certificado
echo "→ Obteniendo certificado SSL..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN"

# 3. Verificar renovación automática
echo "→ Verificando renovación automática..."
certbot renew --dry-run

# 4. Crear cron de renovación si no existe
if ! crontab -l 2>/dev/null | grep -q certbot; then
    echo "→ Añadiendo cron de renovación..."
    (crontab -l 2>/dev/null; echo "0 3 1 */2 * certbot renew --quiet && systemctl reload nginx") | crontab -
fi

echo "=== SSL configurado correctamente ==="
echo "Tu TPV ya es accesible en https://$DOMAIN"
