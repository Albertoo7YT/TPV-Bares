#!/bin/bash
set -e

# Backup automático de PostgreSQL para TPV.
# Para evitar que pg_dump solicite contraseña, configura ~/.pgpass con formato:
# hostname:port:database:username:password
# Ejemplo:
# localhost:5432:tpv_db:tpv_user:tu_password
# Luego aplica permisos seguros: chmod 600 ~/.pgpass
#
# Crontab recomendado para ejecutar el backup diariamente a las 4:00 AM:
# 0 4 * * * /ruta/al/proyecto/scripts/backup-db.sh >> /var/log/tpv/backup.log 2>&1
#
# Restauración manual de referencia:
# pg_restore -U tpv_user -d tpv_db backup.dump

BACKUP_DIR="/var/backups/tpv"
DB_NAME="tpv_db"
DB_USER="tpv_user"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Crear directorio si no existe
mkdir -p "$BACKUP_DIR"

# Dump de la base de datos
pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_DIR/tpv_$DATE.dump"

# Comprimir
gzip "$BACKUP_DIR/tpv_$DATE.dump"

# Eliminar backups de más de X días
find "$BACKUP_DIR" -name "*.dump.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup completado: tpv_$DATE.dump.gz"
