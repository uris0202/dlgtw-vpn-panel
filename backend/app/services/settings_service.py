from sqlalchemy.orm import Session

from app.models.settings import PanelSettings


class SettingsService:

    def __init__(self, db: Session):
        self.db = db

    def get(self):
        settings = self.db.get(PanelSettings, 1)

        if settings is None:
            settings = PanelSettings(id=1)

            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)

        return settings

    def update(self, data):
        settings = self.get()

        values = data.model_dump(
            exclude_unset=True,
        )
        clear_telegram_token = values.pop(
            "telegram_bot_token_clear",
            False,
        )
        telegram_bot_token = values.pop(
            "telegram_bot_token",
            None,
        )

        for key, value in values.items():
            if value is None:
                continue

            if key in {
                "panel_name",
                "support_contact",
                "payment_phone",
                "payment_recipient",
                "payment_instructions",
                "telegram_chat_id",
            }:
                value = value.strip()

            if key == "panel_name" and not value:
                value = "DLGTW VPN"

            if key == "subscription_path":
                value = value.strip().strip("/") or "subs"

            setattr(settings, key, value)

        if clear_telegram_token:
            settings.telegram_bot_token = ""
            settings.telegram_notifications_enabled = False
        elif telegram_bot_token is not None:
            normalized_token = telegram_bot_token.strip()

            if normalized_token:
                if len(normalized_token) < 20 or ":" not in normalized_token:
                    raise ValueError("Некорректный токен Telegram-бота.")

                settings.telegram_bot_token = normalized_token

        if settings.telegram_notifications_enabled and not (
            settings.telegram_bot_token
            and settings.telegram_chat_id
        ):
            raise ValueError(
                "Для включения Telegram укажите токен бота и Chat ID."
            )

        self.db.commit()
        self.db.refresh(settings)

        return settings
