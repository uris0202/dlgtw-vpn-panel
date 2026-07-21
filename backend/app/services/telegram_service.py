import logging
import time

import httpx


logger = logging.getLogger(__name__)


class TelegramNotificationError(Exception):
    pass


class TelegramNotificationService:
    API_URL = "https://api.telegram.org/bot{token}/{method}"
    MAX_ATTEMPTS = 3
    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

    @classmethod
    def send_message(cls, bot_token: str, chat_id: str, text: str):
        token = (bot_token or "").strip()
        target_chat = (chat_id or "").strip()

        if not token or not target_chat:
            raise TelegramNotificationError(
                "Токен Telegram-бота или Chat ID не настроены."
            )

        payload = cls.request(
            token,
            "sendMessage",
            {
                "chat_id": target_chat,
                "text": text[:4096],
                "disable_web_page_preview": True,
            },
        )

        return payload.get("result") or {}

    @classmethod
    def get_recent_chats(cls, bot_token: str):
        payload = cls.request(
            bot_token,
            "getUpdates",
            {
                "limit": 100,
                "timeout": 0,
            },
        )
        chats = {}

        for update in payload.get("result") or []:
            candidates = [
                update.get("message"),
                update.get("edited_message"),
                update.get("channel_post"),
                update.get("edited_channel_post"),
                update.get("my_chat_member"),
                update.get("chat_member"),
                update.get("chat_join_request"),
            ]
            callback_query = update.get("callback_query") or {}
            candidates.append(callback_query.get("message"))

            for candidate in candidates:
                chat = (candidate or {}).get("chat") or {}
                chat_id = chat.get("id")

                if chat_id is None:
                    continue

                normalized_id = str(chat_id)
                chats[normalized_id] = {
                    "id": normalized_id,
                    "name": cls.get_chat_name(chat, normalized_id),
                    "type": str(chat.get("type") or "chat"),
                }

        return list(chats.values())

    @classmethod
    def request(cls, bot_token: str, method: str, data: dict):
        token = (bot_token or "").strip()

        if not token:
            raise TelegramNotificationError("Токен Telegram-бота не настроен.")

        transport = httpx.HTTPTransport(
            local_address="0.0.0.0",
            retries=1,
        )

        try:
            with httpx.Client(
                transport=transport,
                timeout=httpx.Timeout(
                    connect=10.0,
                    read=20.0,
                    write=10.0,
                    pool=5.0,
                ),
                trust_env=False,
            ) as client:
                for attempt in range(1, cls.MAX_ATTEMPTS + 1):
                    try:
                        response = client.post(
                            cls.API_URL.format(token=token, method=method),
                            json=data,
                        )
                    except httpx.RequestError as error:
                        if attempt >= cls.MAX_ATTEMPTS:
                            raise TelegramNotificationError(
                                "Telegram API недоступен из сети сервера."
                            ) from error

                        cls.wait_before_retry(attempt)
                        continue

                    try:
                        payload = response.json()
                    except ValueError:
                        payload = {}

                    if (
                        response.status_code in cls.RETRYABLE_STATUS_CODES
                        and attempt < cls.MAX_ATTEMPTS
                    ):
                        cls.wait_before_retry(
                            attempt,
                            cls.get_retry_after(response, payload),
                        )
                        continue

                    if response.is_error or not payload.get("ok"):
                        description = str(
                            payload.get("description")
                            or f"Telegram API вернул HTTP {response.status_code}."
                        )
                        raise TelegramNotificationError(description[:500])

                    return payload
        except httpx.RequestError as error:
            raise TelegramNotificationError(
                "Telegram API недоступен из сети сервера."
            ) from error

        raise TelegramNotificationError("Telegram API не подтвердил отправку.")

    @classmethod
    def wait_before_retry(cls, attempt: int, retry_after: float | None = None):
        delay = retry_after if retry_after is not None else float(attempt)
        delay = max(0.5, min(delay, 15.0))
        logger.warning(
            "Telegram API request retry %s/%s in %.1f seconds",
            attempt + 1,
            cls.MAX_ATTEMPTS,
            delay,
        )
        time.sleep(delay)

    @staticmethod
    def get_retry_after(response, payload):
        value = (payload.get("parameters") or {}).get("retry_after")

        if value is None:
            value = response.headers.get("Retry-After")

        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @classmethod
    def send_safely(cls, bot_token: str, chat_id: str, text: str):
        try:
            cls.send_message(bot_token, chat_id, text)
        except TelegramNotificationError as error:
            logger.warning("Telegram notification failed: %s", error)

    @classmethod
    def queue_new_order(
        cls,
        background_tasks,
        settings,
        order,
        title="Новый заказ",
    ):
        if not cls.is_enabled(settings):
            return

        text = cls.build_order_message(order, title)
        background_tasks.add_task(
            cls.send_safely,
            settings.telegram_bot_token,
            settings.telegram_chat_id,
            text,
        )

    @classmethod
    def queue_activation_result(cls, background_tasks, settings, order):
        if not cls.is_enabled(settings):
            return

        text = cls.build_activation_message(order)
        background_tasks.add_task(
            cls.send_safely,
            settings.telegram_bot_token,
            settings.telegram_chat_id,
            text,
        )

    @staticmethod
    def is_enabled(settings):
        return bool(
            settings.telegram_notifications_enabled
            and settings.telegram_bot_token
            and settings.telegram_chat_id
        )

    @classmethod
    def build_order_message(cls, order, title):
        return "\n".join(
            [
                f"{title} #{order.id}",
                "",
                f"Клиент: {order.client_email}",
                f"Контакт: {order.customer_contact or '-'}",
                f"Тариф: {order.plan_name or '-'}",
                f"Серверы: {order.server_names or '-'}",
                f"Сумма: {cls.format_amount(order.amount, order.currency)}",
                "Статус: ожидает подтверждения оплаты",
            ]
        )

    @classmethod
    def build_activation_message(cls, order):
        if order.activation_error:
            result = "VPN-доступ выдан не полностью."
            details = f"Ошибка: {order.activation_error[:800]}"
        else:
            result = "VPN-доступ успешно выдан."
            details = f"Серверы: {order.server_names or '-'}"

        return "\n".join(
            [
                f"Оплата подтверждена: заказ #{order.id}",
                "",
                f"Клиент: {order.client_email}",
                f"Тариф: {order.plan_name or '-'}",
                f"Сумма: {cls.format_amount(order.amount, order.currency)}",
                f"Результат: {result}",
                details,
            ]
        )

    @staticmethod
    def format_amount(amount, currency):
        value = int(amount or 0)
        formatted = f"{value:,}".replace(",", " ")
        return f"{formatted} {currency or 'RUB'}"

    @staticmethod
    def get_chat_name(chat, fallback):
        title = str(chat.get("title") or "").strip()

        if title:
            return title

        person_name = " ".join(
            part
            for part in [
                str(chat.get("first_name") or "").strip(),
                str(chat.get("last_name") or "").strip(),
            ]
            if part
        )

        if person_name:
            return person_name

        username = str(chat.get("username") or "").strip()

        if username:
            return f"@{username}"

        return fallback
