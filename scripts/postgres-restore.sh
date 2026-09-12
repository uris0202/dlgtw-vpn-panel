#!/bin/sh
set -eu

umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

BACKUP_FILE="${1:-}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
CURRENT_ARCHIVE=""
CURRENT_CHECKSUM=""
RESTORE_DATABASE=""
BLOCKED_DATABASE=""

log() {
    printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
    log "ERROR: $*"
    exit 1
}

cleanup() {
    if [ -n "$CURRENT_ARCHIVE" ]; then
        rm -f "$CURRENT_ARCHIVE"
    fi

    if [ -n "$CURRENT_CHECKSUM" ]; then
        rm -f "$CURRENT_CHECKSUM"
    fi

    if [ -n "$RESTORE_DATABASE" ]; then
        dropdb --maintenance-db=postgres --if-exists "$RESTORE_DATABASE" >/dev/null 2>&1 || true
    fi

    if [ -n "$BLOCKED_DATABASE" ]; then
        psql \
            --dbname=postgres \
            --no-psqlrc \
            --command="ALTER DATABASE \"$BLOCKED_DATABASE\" WITH ALLOW_CONNECTIONS true" \
            >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[ "${CONFIRM_RESTORE:-}" = "RESTORE_NOW" ] || fail "Set CONFIRM_RESTORE=RESTORE_NOW to confirm database restoration"
[ -n "$BACKUP_FILE" ] || fail "Usage: postgres-restore.sh /backups/<backup>.dump"

case "$PGDATABASE" in
    ''|*[!A-Za-z0-9_]*) fail "PGDATABASE may contain only letters, numbers, and underscores during restore" ;;
esac

case "$BACKUP_FILE" in
    "$BACKUP_DIR"/*.dump) ;;
    *) fail "Backup file must be a .dump file inside $BACKUP_DIR" ;;
esac

[ -f "$BACKUP_FILE" ] || fail "Backup file does not exist: $BACKUP_FILE"
[ ! -L "$BACKUP_FILE" ] || fail "Symbolic links are not accepted as backup files"

backup_directory="$(dirname "$BACKUP_FILE")"
backup_name="$(basename "$BACKUP_FILE")"
checksum_file="$BACKUP_FILE.sha256"

[ -f "$checksum_file" ] || fail "Checksum file is missing: $checksum_file"

if ! (cd "$backup_directory" && sha256sum -c "$backup_name.sha256"); then
    fail "Backup checksum verification failed"
fi

if ! pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1; then
    fail "Backup archive is unreadable"
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
safe_database="$(printf '%s' "$PGDATABASE" | tr -c 'A-Za-z0-9_.-' '_')"
safety_name="${safe_database}_pre_restore_${timestamp}.dump"
safety_archive="$BACKUP_DIR/$safety_name"
CURRENT_ARCHIVE="$BACKUP_DIR/.$safety_name.$$.tmp"
CURRENT_CHECKSUM="$BACKUP_DIR/.$safety_name.$$.sha256.tmp"

log "Creating safety backup of the current database"

if ! pg_dump \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges \
    --file="$CURRENT_ARCHIVE" \
    "$PGDATABASE"; then
    fail "Could not create the pre-restore safety backup"
fi

if ! pg_restore --list "$CURRENT_ARCHIVE" >/dev/null 2>&1; then
    fail "Pre-restore safety backup validation failed"
fi

safety_checksum="$(sha256sum "$CURRENT_ARCHIVE" | awk '{print $1}')"
printf '%s  %s\n' "$safety_checksum" "$safety_name" > "$CURRENT_CHECKSUM"
mv "$CURRENT_ARCHIVE" "$safety_archive"
CURRENT_ARCHIVE=""
mv "$CURRENT_CHECKSUM" "$safety_archive.sha256"
CURRENT_CHECKSUM=""

log "Safety backup created: $safety_name"
RESTORE_DATABASE="vpnpanel_restore_$(date -u '+%Y%m%d%H%M%S')_$$"
PREVIOUS_DATABASE="vpnpanel_previous_$(date -u '+%Y%m%d%H%M%S')_$$"

dropdb --maintenance-db=postgres --if-exists "$RESTORE_DATABASE" >/dev/null 2>&1 || true

log "Creating isolated restore database $RESTORE_DATABASE"

if ! createdb --maintenance-db=postgres --template=template0 --owner="$PGUSER" "$RESTORE_DATABASE"; then
    fail "Could not create isolated restore database"
fi

log "Restoring and validating $backup_name without changing the active database"

if ! pg_restore \
    --dbname="$RESTORE_DATABASE" \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-privileges \
    "$BACKUP_FILE"; then
    fail "Restore failed; the active database was not changed"
fi

alembic_version="$(psql \
    --dbname="$RESTORE_DATABASE" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --quiet \
    --command='SELECT version_num FROM alembic_version LIMIT 1' 2>/dev/null || true)"

if [ -z "$alembic_version" ]; then
    fail "Selected backup has no Alembic version; the active database was not changed"
fi

log "Restore candidate is valid; Alembic version: $alembic_version"
log "Blocking new connections and terminating active connections before database switch"

if ! psql \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --command="ALTER DATABASE \"$PGDATABASE\" WITH ALLOW_CONNECTIONS false"; then
    fail "Could not prepare the active database for switching"
fi

BLOCKED_DATABASE="$PGDATABASE"

if ! psql \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$PGDATABASE', '$RESTORE_DATABASE') AND pid <> pg_backend_pid();" \
    >/dev/null; then
    fail "Could not terminate active database connections"
fi

if ! psql \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --command="ALTER DATABASE \"$PGDATABASE\" RENAME TO \"$PREVIOUS_DATABASE\""; then
    fail "Could not move the active database; no database changes were made"
fi


BLOCKED_DATABASE="$PREVIOUS_DATABASE"

if ! psql \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --command="ALTER DATABASE \"$RESTORE_DATABASE\" RENAME TO \"$PGDATABASE\""; then
    log "Database switch failed; restoring the original database name"

    if ! psql \
        --dbname=postgres \
        --no-psqlrc \
        --set=ON_ERROR_STOP=1 \
        --command="ALTER DATABASE \"$PREVIOUS_DATABASE\" RENAME TO \"$PGDATABASE\""; then
        RESTORE_DATABASE=""
        fail "CRITICAL: database switch and automatic name rollback both failed"
    fi

    BLOCKED_DATABASE="$PGDATABASE"
    fail "Database switch failed; the original database was restored"
fi

RESTORE_DATABASE=""

probe="$(psql --dbname="$PGDATABASE" --no-psqlrc --tuples-only --no-align --quiet --command='SELECT 1')"
[ "$probe" = "1" ] || fail "Restored database did not pass the final connection check"

if ! dropdb --maintenance-db=postgres "$PREVIOUS_DATABASE"; then
    log "WARNING: restored database is active, but previous database $PREVIOUS_DATABASE could not be removed"
else
    BLOCKED_DATABASE=""
fi

log "Database restore completed successfully; Alembic version: $alembic_version"
log "Pre-restore safety backup retained at $safety_archive"
