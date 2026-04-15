#!/bin/bash
set -e

# Restauración de backups PostgreSQL para TPV.
# Uso:
# ./scripts/restore-db.sh /var/backups/tpv/tpv_20260101_040000.dump.gz
#
# Si usas autenticación por contraseña, también conviene configurar ~/.pgpass:
# hostname:port:database:username:password

DB_NAME="tpv_db"
DB_USER="tpv_user"
BACKUP_FILE="$1"
TMP_FILE=""

if [ -z "$BACKUP_FILE" ]; then
    echo "Uso: $0 <archivo_backup.dump|archivo_backup.dump.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "No existe el archivo: $BACKUP_FILE"
    exit 1
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
    TMP_FILE=$(mktemp /tmp/tpv_restore_XXXXXX.dump)
    gunzip -c "$BACKUP_FILE" > "$TMP_FILE"
    BACKUP_SOURCE="$TMP_FILE"
else
    BACKUP_SOURCE="$BACKUP_FILE"
fi

echo "Restaurando backup en $DB_NAME..."
pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists "$BACKUP_SOURCE"

if [ -n "$TMP_FILE" ] && [ -f "$TMP_FILE" ]; then
    rm -f "$TMP_FILE"
fi

echo "Restauracion completada."
