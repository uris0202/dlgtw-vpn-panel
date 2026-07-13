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

        for key, value in values.items():
            if value is None:
                continue

            if key in {
                "panel_name",
                "support_contact",
                "payment_phone",
                "payment_recipient",
                "payment_instructions",
            }:
                value = value.strip()

            if key == "panel_name" and not value:
                value = "DLGTW VPN"

            if key == "subscription_path":
                value = value.strip().strip("/") or "subs"

            setattr(settings, key, value)

        self.db.commit()
        self.db.refresh(settings)

        return settings
