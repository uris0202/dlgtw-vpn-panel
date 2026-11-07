# Профиль администратора и двухфакторная защита

## Возможности

В разделе `Профиль и безопасность` администратор может:

- изменить email для входа;
- изменить пароль;
- включить вход с одноразовым кодом TOTP;
- создать новый набор резервных кодов;
- завершить все остальные административные сеансы.

Изменение email, пароля, состояния 2FA или резервных кодов автоматически аннулирует ранее выданные административные токены. Текущий браузер получает новый токен и остаётся авторизованным.

## Включение 2FA

1. Откройте `Профиль и безопасность`.
2. В блоке двухфакторной защиты введите текущий пароль.
3. Отсканируйте QR-код приложением Google Authenticator, Microsoft Authenticator, 1Password или другим TOTP-приложением.
4. Введите шестизначный код из приложения.
5. Сохраните показанные резервные коды вне сервера. Каждый код действует один раз.

При следующем входе после email и пароля панель запросит код из приложения. В этом же поле можно ввести резервный код.

## Важное о JWT_SECRET

TOTP-секреты в базе зашифрованы ключом, производным от `JWT_SECRET`. Не меняйте `JWT_SECRET` без необходимости. После его изменения все текущие токены станут недействительными, а ранее настроенный TOTP потребуется аварийно отключить и подключить заново.

Значение `JWT_SECRET`, QR-код, ручной TOTP-ключ и резервные коды нельзя публиковать в GitHub, журналах или сообщениях.

## Аварийное отключение 2FA

Используйте этот способ только если утрачен телефон и все резервные коды. Сначала создайте резервную копию базы:

```bash
cd ~/vpnpanel
docker compose run --rm -e BACKUP_RUN_ONCE=true db-backup
```

Посмотрите email администратора:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, email, totp_enabled FROM users ORDER BY id;"'
```

Затем замените `admin@example.com` на email администратора и выполните:

```bash
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
UPDATE users
SET totp_enabled = false,
    totp_secret_encrypted = '',
    totp_pending_secret_encrypted = '',
    totp_last_used_step = -1,
    recovery_code_hashes = '[]'::json,
    two_factor_challenge_hash = '',
    two_factor_enabled_at = NULL,
    session_version = session_version + 1
WHERE email = 'admin@example.com';
SQL
```

После этого войдите по email и паролю и настройте 2FA заново. Перезапуск контейнеров не требуется.
