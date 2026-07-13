from pydantic import BaseModel
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.client import ClientUpdate
from app.services.client_service import ClientService
from app.services.order_service import OrderService
from app.services.server_service import ServerService


router = APIRouter(
    prefix="/accounts",
    tags=["Accounts"],
)


class AccountVpnAccessUpdate(BaseModel):
    enabled: bool


@router.get("")
def get_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    account_orders = {}

    for order in service.get_all():
        if not order.account_token:
            continue

        account_orders.setdefault(order.account_token, []).append(order)

    return [
        serialize_account(db, orders)
        for orders in account_orders.values()
    ]


@router.post("/{account_token}/reset-credentials")
def reset_account_credentials(
    account_token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    account = service.get_by_account_token(account_token)

    if account is None:
        raise HTTPException(
            status_code=404,
            detail="Личный кабинет не найден.",
        )

    orders = service.reset_account_credentials(account_token)

    return serialize_account(db, orders)


@router.patch("/{account_token}/vpn-access")
def update_account_vpn_access(
    account_token: str,
    payload: AccountVpnAccessUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    orders = service.get_all_by_account_token(account_token)

    if not orders:
        raise HTTPException(
            status_code=404,
            detail="Личный кабинет не найден.",
        )

    client_email = orders[0].client_email
    server_ids = collect_server_ids(orders)

    if not server_ids:
        raise HTTPException(
            status_code=400,
            detail="У кабинета нет связанных VPN-серверов.",
        )

    client_service = ClientService(db)
    updated_server_ids = []
    errors = []

    for server_id in server_ids:
        try:
            client_service.update(
                server_id,
                client_email,
                ClientUpdate(enable=payload.enabled),
            )
            updated_server_ids.append(server_id)
        except Exception as error:
            errors.append(
                f"{get_server_name(db, server_id)}: {error}"
            )

    if not updated_server_ids:
        raise HTTPException(
            status_code=400,
            detail="; ".join(errors) or "Не удалось изменить VPN-доступ.",
        )

    return {
        "success": True,
        "enabled": payload.enabled,
        "updated_server_ids": updated_server_ids,
        "errors": errors,
    }


def serialize_account(db, orders):
    latest_order = orders[0]
    server_ids = collect_server_ids(orders)
    account_login = next(
        (
            order.account_login
            for order in orders
            if order.account_login
        ),
        "",
    )
    has_password = any(
        bool(order.account_password_hash)
        for order in orders
    )

    return {
        "account_token": latest_order.account_token,
        "client_email": latest_order.client_email,
        "customer_contact": latest_order.customer_contact,
        "account_login": account_login,
        "has_password": has_password,
        "server_ids": server_ids,
        "server_names": [
            get_server_name(db, server_id)
            for server_id in server_ids
        ],
        "orders_count": len(orders),
        "paid_orders": sum(order.status == "paid" for order in orders),
        "pending_orders": sum(order.status == "pending" for order in orders),
        "activation_errors": sum(bool(order.activation_error) for order in orders),
        "latest_order_id": latest_order.id,
        "latest_order_status": latest_order.status,
        "latest_plan_name": latest_order.plan_name,
        "created_at": latest_order.created_at,
    }


def collect_server_ids(orders):
    result = []
    eligible_orders = [
        order
        for order in orders
        if order.status in {"paid", "access"}
    ]

    for order in eligible_orders or orders:
        server_ids = order.server_ids or []

        if not server_ids and order.server_id:
            server_ids = [order.server_id]

        for server_id in server_ids:
            try:
                normalized_server_id = int(server_id)
            except (TypeError, ValueError):
                continue

            if normalized_server_id not in result:
                result.append(normalized_server_id)

    return result


def get_server_name(db, server_id):
    server = ServerService(db).get(server_id)

    if server is None:
        return f"Сервер #{server_id}"

    return server.name
