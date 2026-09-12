#!/bin/sh
set -eu

umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
BACKUP_RETRY_SECONDS="${BACKUP_RETRY_SECONDS:-300}"
BACKUP_VERIFY_RESTORE="${BACKUP_VERIFY_RESTORE:-true}"
BACKUP_RUN_ONCE="${BACKUP_RUN_ONCE:-false}"

CURRENT_ARCHIVE=""
CURRENT_CHECKSUM=""
VERIFY_DATABASE=""

log() {
    printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
    log "ERROR: $*"
    exit 1
}

positive_integer() {
    value="$1"
    name="$2"

    case "$value" in
        ''|*[!0-9]*) fail "$name must be a positive integer" ;;
    esac

    [ "$value" -gt 0 ] || fail "$name must be greater than zero"
}

boolean_value() {
    value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"

    case "$value" in
        1|true|yes|on) printf 'true' ;;
        0|false|no|off) printf 'false' ;;
        *) fail "$2 must be true or false" ;;
    esac
}

cleanup() {
    if [ -n "$CURRENT_ARCHIVE" ]; then
        rm -f "$CURRENT_ARCHIVE"
    fi

    if [ -n "$CURRENT_CHECKSUM" ]; then
        rm -f "$CURRENT_CHECKSUM"
    fi

    if [ -n "$VERIFY_DATABASE" ]; then
        dropdb --maintenance-db=postgres --if-exists "$VERIFY_DATABASE" >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_postgres() {
    until pg_isready --quiet; do
        log "PostgreSQL is unavailable; retrying in 5 seconds"
        sleep 5
    done
}

verify_archive() {
    archive="$1"

    if ! pg_restore --list "$archive" >/dev/null 2>&1; then
        log "Backup archive validation failed"
        return 1
    fi

    if [ "$BACKUP_VERIFY_RESTORE" != "true" ]; then
        return 0
    fi

    VERIFY_DATABASE="vpnpanel_verify_$(date -u '+%Y%m%d%H%M%S')_$$"
    dropdb --maintenance-db=postgres --if-exists "$VERIFY_DATABASE" >/dev/null 2>&1 || true

    if ! createdb --maintenance-db=postgres --template=template0 "$VERIFY_DATABASE"; then
        log "Could not create temporary verification database"
        VERIFY_DATABASE=""
        return 1
    fi

    verification_result=0

    if ! pg_restore \
        --dbname="$VERIFY_DATABASE" \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges \
        "$archive" >/dev/null; then
        log "Test restore into temporary database failed"
        verification_result=1
    else
        probe="$(psql --dbname="$VERIFY_DATABASE" --no-psqlrc --tuples-only --no-align --quiet --command='SELECT 1')"
        if [ "$probe" != "1" ]; then
            log "Temporary database verification query failed"
            verification_result=1
        fi
    fi

    if ! dropdb --maintenance-db=postgres "$VERIFY_DATABASE"; then
        log "Could not remove temporary verification database"
        verification_result=1
    fi

    VERIFY_DATABASE=""
    return "$verification_result"
}

prune_old_backups() {
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "${SAFE_DATABASE}_[0-9]*.dump" -print \
        | sort -r \
        | awk -v keep="$BACKUP_RETENTION_COUNT" 'NR > keep' \
        | while IFS= read -r old_archive; do
            [ -n "$old_archive" ] || continue
            if rm -f "$old_archive" "$old_archive.sha256"; then
                log "Removed expired backup $(basename "$old_archive")"
            else
                log "WARNING: Could not remove expired backup $old_archive"
            fi
        done
}

create_backup() {
    timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    filename="${SAFE_DATABASE}_${timestamp}.dump"
    final_archive="$BACKUP_DIR/$filename"
    suffix=1

    while [ -e "$final_archive" ]; do
        filename="${SAFE_DATABASE}_${timestamp}_${suffix}.dump"
        final_archive="$BACKUP_DIR/$filename"
        suffix=$((suffix + 1))
    done

    CURRENT_ARCHIVE="$BACKUP_DIR/.$filename.$$.tmp"
    CURRENT_CHECKSUM="$BACKUP_DIR/.$filename.$$.sha256.tmp"

    log "Creating PostgreSQL backup $filename"

    if ! pg_dump \
        --format=custom \
        --compress=6 \
        --no-owner \
        --no-privileges \
        --file="$CURRENT_ARCHIVE" \
        "$PGDATABASE"; then
        log "Backup creation failed"
        return 1
    fi

    if ! verify_archive "$CURRENT_ARCHIVE"; then
        log "Backup verification failed; incomplete archive will be removed"
        return 1
    fi

    checksum="$(sha256sum "$CURRENT_ARCHIVE" | awk '{print $1}')"
    printf '%s  %s\n' "$checksum" "$filename" > "$CURRENT_CHECKSUM"

    mv "$CURRENT_ARCHIVE" "$final_archive"
    CURRENT_ARCHIVE=""
    mv "$CURRENT_CHECKSUM" "$final_archive.sha256"
    CURRENT_CHECKSUM=""

    marker="$BACKUP_DIR/.last_success.$$.tmp"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$marker"
    mv "$marker" "$BACKUP_DIR/.last_success"

    prune_old_backups

    backup_size="$(du -h "$final_archive" 2>/dev/null | awk '{print $1}' || true)"
    log "Backup completed and test-restored successfully: $filename ${backup_size:-unknown-size}"
    return 0
}

positive_integer "$BACKUP_INTERVAL_SECONDS" BACKUP_INTERVAL_SECONDS
positive_integer "$BACKUP_RETENTION_COUNT" BACKUP_RETENTION_COUNT
positive_integer "$BACKUP_RETRY_SECONDS" BACKUP_RETRY_SECONDS
BACKUP_VERIFY_RESTORE="$(boolean_value "$BACKUP_VERIFY_RESTORE" BACKUP_VERIFY_RESTORE)"
BACKUP_RUN_ONCE="$(boolean_value "$BACKUP_RUN_ONCE" BACKUP_RUN_ONCE)"

SAFE_DATABASE="$(printf '%s' "$PGDATABASE" | tr -c 'A-Za-z0-9_.-' '_')"
mkdir -p "$BACKUP_DIR"

wait_for_postgres

while :; do
    if create_backup; then
        if [ "$BACKUP_RUN_ONCE" = "true" ]; then
            exit 0
        fi

        log "Next backup is scheduled in $BACKUP_INTERVAL_SECONDS seconds"
        sleep "$BACKUP_INTERVAL_SECONDS"
    else
        if [ "$BACKUP_RUN_ONCE" = "true" ]; then
            exit 1
        fi

        log "Retrying backup in $BACKUP_RETRY_SECONDS seconds"
        sleep "$BACKUP_RETRY_SECONDS"
    fi
done
