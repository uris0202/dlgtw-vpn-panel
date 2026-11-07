# Исправление соединения с 3X-UI при выдаче подписки

Наблюдение: последовательная диагностика нашла активный профиль на каждом из трёх серверов. При реальном HTTP-запросе backend получает httpx.ConnectTimeout на /csrf-token сервера #2, ещё до авторизации. Это не ошибка формата VLESS или QR-кода. Конкретная причина потери TCP-соединения пока не установлена; после обновления нужно проверить реальный HTTP-ответ.

Обновление применяет уже используемый в проекте способ прямого IPv4-подключения с одной повторной попыткой при ошибке установления TCP-соединения. Тайм-аут каждой попытки подключения ограничен тремя секундами; тайм-аут чтения остаётся прежним. Соединение закрывается, если авторизация не удалась.

Повтор выполняется транспортом только до отправки HTTP-запроса. После отправки изменения клиента ошибка чтения ответа не запускает повторную запись. Настройка проверки TLS-сертификата сохраняется и передаётся непосредственно в транспорт.

Техническая основа: [HTTPX transports](https://www.python-httpx.org/advanced/transports/), [HTTPX timeouts](https://www.python-httpx.org/advanced/timeouts/).

## Применение

Загрузить ZIP в /root. На сервере сайта выполнить:

```sh
cd ~/vpnpanel
umask 077
mkdir -p ~/vpnpanel-backups
STAMP=$(date +%Y%m%d-%H%M%S)
tar -czf ~/vpnpanel-backups/pre-xui-connection-$STAMP.tar.gz backend/app/services/xui/client.py backend/app/services/xui_service.py scripts/diagnose-vpn-subscription.py
unzip -o ~/vpn-xui-connection-fix-20261030.zip -d ~/vpnpanel
docker compose build backend
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend
docker compose restart caddy
sh scripts/wait-panel-health.sh
```

Миграции БД и пересборка frontend не требуются. Изменения не затрагивают записи PostgreSQL; резервная копия исходных файлов создаётся перед заменой.

## Проверка реального HTTP-запроса

```sh
cd ~/vpnpanel
docker compose exec -T backend python - 12 --http-only < scripts/diagnose-vpn-subscription.py
```

Проверка обращается к работающему HTTP API, а не только к отдельным функциям. Ожидается status=200, profiles=3 и три адреса 139.100.235.247 с портами 24443, 24444, 24445. Порядок профилей может отличаться. Ключи и токен подписки в вывод не попадают.

Если снова получен 503, сохранить этот вывод и последние ошибки backend. Не переключать подписку на частичный список и не менять оплаченные серверы: следующий шаг — проверка подключения из работающего процесса с указанием конкретного адреса назначения.

## Файлы обновления

- backend/app/services/xui/client.py
- backend/app/services/xui_service.py
- backend/tests/test_xui_transport.py
- scripts/diagnose-vpn-subscription.py
- XUI_CONNECTION_FIX.md
