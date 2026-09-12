# Резервное копирование PostgreSQL

## Как это работает

Сервис `db-backup` запускается вместе с проектом, создаёт первую копию базы сразу после запуска и затем повторяет копирование каждые 24 часа.

- Копии сохраняются в `~/vpnpanel/backups/postgres`.
- По умолчанию сохраняются 14 последних автоматических копий.
- Для каждого архива создаётся файл SHA-256.
- Каждый новый архив автоматически разворачивается во временную базу. Рабочая база при этой проверке не изменяется.
- Успешно проверенные копии имеют формат `vpnpanel_YYYYMMDDTHHMMSSZ.dump`.

Параметры можно изменить в `.env`:

```text
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_COUNT=14
BACKUP_RETRY_SECONDS=300
BACKUP_VERIFY_RESTORE=true
BACKUP_HEALTH_MAX_AGE_MINUTES=1560
```

## Проверка состояния

```bash
cd ~/vpnpanel
docker compose ps db-backup
docker compose logs --tail=50 db-backup
ls -lh backups/postgres
```

Рабочий сервис имеет статус `healthy`. В журнале последней успешной операции присутствует сообщение `Backup completed and test-restored successfully`.

## Создание дополнительной копии вручную

```bash
cd ~/vpnpanel
docker compose run --rm -e BACKUP_RUN_ONCE=true db-backup
```

## Восстановление

Сначала выберите архив:

```bash
cd ~/vpnpanel
ls -1t backups/postgres/*.dump
```

Остановите панель и сервис автоматического копирования. PostgreSQL останавливать не нужно:

```bash
docker compose stop caddy frontend backend db-backup
```

Запустите восстановление, заменив имя файла на выбранное из предыдущей команды:

```bash
docker compose run --rm --no-deps \
  -e CONFIRM_RESTORE=RESTORE_NOW \
  --entrypoint /bin/sh \
  db-backup /usr/local/bin/postgres-restore.sh /backups/vpnpanel_YYYYMMDDTHHMMSSZ.dump
```

Сценарий проверит SHA-256 и формат архива, затем создаст дополнительную копию текущей базы с пометкой `pre_restore`. Выбранная копия сначала полностью разворачивается и проверяется в отдельной временной базе. Только после успешной проверки она переключается на рабочее имя, поэтому старая база не изменяется при повреждённом или несовместимом архиве.

После успешного восстановления примените отсутствующие миграции и запустите панель:

```bash
docker compose run --rm backend alembic upgrade head
docker compose up -d
docker compose ps
curl -fsS https://dlgtw.ru/api/health
```

Архивы находятся на том же сервере. Они защищают от ошибочного изменения или удаления данных, но не от поломки диска или потери сервера. Периодически переносите проверенную копию на другой носитель.
