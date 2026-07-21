from datetime import datetime
from datetime import timezone
import secrets

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.password import hash_password
from app.auth.password import verify_password
from app.models.order import Order
from app.services.client_service import ClientService
from app.services.plan_service import PlanService
from app.services.server_service import ServerService
from app.services.settings_service import SettingsService


class OrderService:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self):
        return (
            self.db.query(Order)
            .order_by(Order.id.desc())
            .all()
        )

    def get(self, order_id: int):
        return self.db.get(Order, order_id)

    def get_for_update(self, order_id: int):
        return (
            self.db.query(Order)
            .filter(Order.id == order_id)
            .with_for_update()
            .first()
        )

    def get_by_public_request_id(self, request_id: str):
        normalized_request_id = (request_id or "").strip()

        if not normalized_request_id:
            return None

        return (
            self.db.query(Order)
            .filter(Order.public_request_id == normalized_request_id)
            .first()
        )

    def get_all_by_client_email(self, client_email: str):
        email = (client_email or "").strip().lower()

        if not email:
            return []

        return (
            self.db.query(Order)
            .filter(func.lower(Order.client_email) == email)
            .order_by(Order.id.desc())
            .all()
        )

    def get_by_account_token(self, account_token: str):
        token = (account_token or "").strip()

        if not token:
            return None

        return (
            self.db.query(Order)
            .filter(Order.account_token == token)
            .order_by(Order.id.asc())
            .first()
        )

    def get_all_by_account_token(self, account_token: str):
        token = (account_token or "").strip()

        if not token:
            return []

        return (
            self.db.query(Order)
            .filter(Order.account_token == token)
            .order_by(Order.id.desc())
            .all()
        )

    def get_by_account_login(self, account_login: str):
        login = (account_login or "").strip().lower()

        if not login:
            return None

        return (
            self.db.query(Order)
            .filter(func.lower(Order.account_login) == login)
            .filter(Order.account_password_hash != "")
            .order_by(Order.id.asc())
            .first()
        )

    def login_to_account(self, account_login: str, password: str):
        order = self.get_by_account_login(account_login)

        if order is None or not verify_password(
            password,
            order.account_password_hash,
        ):
            return None

        return order

    def update_account_credentials(
        self,
        order: Order,
        account_login: str,
        password: str,
        current_password: str = "",
    ):

        login = (account_login or "").strip()
        new_password = password or ""

        if len(login) < 3:
            raise ValueError("Логин должен быть не короче 3 символов.")

        if len(new_password) < 6:
            raise ValueError("Пароль должен быть не короче 6 символов.")

        existing = self.get_by_account_login(login)

        if existing is not None and existing.account_token != order.account_token:
            raise ValueError("Такой логин уже занят.")

        if order.account_password_hash and not verify_password(
            current_password or "",
            order.account_password_hash,
        ):
            raise ValueError("Текущий пароль указан неверно.")

        now = datetime.now(timezone.utc)
        password_hash = hash_password(new_password)
        account_orders = self.get_all_by_account_token(order.account_token)
        session_version = max(
            (
                account_order.account_session_version
                for account_order in account_orders
            ),
            default=0,
        ) + 1

        for account_order in account_orders:
            account_order.account_login = login
            account_order.account_password_hash = password_hash
            account_order.account_password_changed_at = now
            account_order.account_session_version = session_version

        self.db.commit()
        self.db.refresh(order)

        return order

    def reset_account_credentials(self, account_token: str):
        orders = self.get_all_by_account_token(account_token)
        new_account_token = self._generate_account_token()
        session_version = max(
            (
                order.account_session_version
                for order in orders
            ),
            default=0,
        ) + 1

        for order in orders:
            order.account_token = new_account_token
            order.account_login = ""
            order.account_password_hash = ""
            order.account_password_changed_at = None
            order.account_session_version = session_version

        self.db.commit()

        return orders

    def inherit_account_credentials(self, order: Order, account: Order):
        order.account_login = account.account_login
        order.account_password_hash = account.account_password_hash
        order.account_password_changed_at = account.account_password_changed_at
        order.account_session_version = account.account_session_version

        self.db.commit()
        self.db.refresh(order)

        return order

    def create(self, data):
        values = self._normalize_values(
            data.model_dump(),
            ensure_account_token=True,
        )

        order = Order(**values)

        self.db.add(order)
        self.db.flush()

        if order.status == "paid":
            self._activate_order(order)

        self.db.commit()
        self.db.refresh(order)

        return order

    def update(self, order: Order, data):
        values = self._normalize_values(
            data.model_dump(exclude_unset=True),
        )

        for key, value in values.items():
            if value is not None:
                setattr(order, key, value)

        should_activate = (
            order.status == "paid"
            and (
                order.activated_at is None
                or order.activation_error
            )
        )

        if should_activate:
            self._activate_order(order)

        self.db.commit()
        self.db.refresh(order)

        return order

    def delete(self, order: Order):
        self.db.delete(order)
        self.db.commit()

    def _normalize_values(self, values, ensure_account_token=False):
        normalized = {}

        if ensure_account_token and not values.get("account_token"):
            values["account_token"] = self._generate_account_token()

        plan_id = values.get("plan_id")

        if plan_id:
            plan = PlanService(self.db).get(plan_id)

            if plan:
                values["plan_name"] = plan.name
                values["duration_days"] = plan.duration_days
                values["traffic_gb"] = plan.traffic_gb
                values["amount"] = plan.price
                values["currency"] = plan.currency

                if values.get("server_ids"):
                    values["server_ids"] = values["server_ids"][:plan.server_limit]

        server_ids = self._normalize_server_ids(
            values.get("server_ids"),
            values.get("server_id"),
        )

        if server_ids:
            values["server_ids"] = server_ids
            values["server_id"] = server_ids[0]

            server_names = self._get_server_names(server_ids)

            values["server_names"] = ", ".join(server_names)

            if server_names:
                values["server_name"] = server_names[0]

        for key, value in values.items():
            if isinstance(value, str):
                value = value.strip()

            if key == "client_email" and not value:
                value = "client"

            if key == "currency":
                value = (value or "RUB").upper()[:10]

            if key == "status":
                value = value or "pending"

            normalized[key] = value

        status = normalized.get("status")

        if status == "paid":
            normalized["paid_at"] = datetime.now(timezone.utc)
        elif status in {"pending", "canceled", "access"}:
            normalized["paid_at"] = None

        return normalized

    def _generate_account_token(self):
        while True:
            token = secrets.token_urlsafe(24)

            exists = (
                self.db.query(Order.id)
                .filter(Order.account_token == token)
                .first()
            )

            if not exists:
                return token

    def _activate_order(self, order: Order):
        server_ids = self._normalize_server_ids(
            order.server_ids,
            order.server_id,
        )

        if not server_ids:
            order.activation_error = "Не выбраны VPN-серверы для выдачи доступа."
            order.activated_at = None
            return

        settings = SettingsService(self.db).get()
        client_service = ClientService(self.db)
        activated_server_ids = self._get_activated_server_ids(
            order,
            server_ids,
        )
        errors = []

        for server_id in server_ids:

            if server_id in activated_server_ids:
                continue

            try:
                client_service.renew_or_create(
                    server_id=server_id,
                    email=order.client_email,
                    inbound_id=settings.default_inbound_id,
                    days=order.duration_days,
                    total_gb=order.traffic_gb,
                    comment=f"Заказ #{order.id} {order.plan_name}".strip(),
                )

                activated_server_ids.append(server_id)
                order.activated_server_ids = list(activated_server_ids)
            except Exception as error:
                server_name = self._get_server_name(server_id)
                errors.append(f"{server_name}: {error}")

        if errors:
            order.activation_error = "; ".join(errors)
            order.activated_at = None
            return

        order.activation_error = ""
        order.activated_at = datetime.now(timezone.utc)

    def _get_activated_server_ids(self, order, server_ids):

        activated_server_ids = self._normalize_server_ids(
            order.activated_server_ids,
            None,
        )

        if activated_server_ids:
            return activated_server_ids

        if order.activated_at and not order.activation_error:
            return list(server_ids)

        if not order.activation_error:
            return []

        failed_server_ids = [
            server_id
            for server_id in server_ids
            if f"{self._get_server_name(server_id)}:" in order.activation_error
        ]

        if not failed_server_ids:
            return []

        return [
            server_id
            for server_id in server_ids
            if server_id not in failed_server_ids
        ]

    def _normalize_server_ids(self, server_ids, server_id):
        result = []

        if isinstance(server_ids, list):
            result.extend(server_ids)

        if server_id:
            result.append(server_id)

        normalized = []

        for item in result:

            try:
                value = int(item)
            except (TypeError, ValueError):
                continue

            if value not in normalized:
                normalized.append(value)

        return normalized

    def _get_server_names(self, server_ids):
        names = []

        for server_id in server_ids:
            names.append(self._get_server_name(server_id))

        return names

    def _get_server_name(self, server_id):
        server = ServerService(self.db).get(server_id)

        if server is None:
            return f"Сервер #{server_id}"

        return server.name
