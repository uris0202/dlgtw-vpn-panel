from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.request import get_client_ip
from app.schemas.order import OrderAccountAccessCreate
from app.schemas.order import OrderCreate
from app.schemas.order import OrderResponse
from app.schemas.order import OrderUpdate
from app.services.client_service import ClientService
from app.services.audit_log_service import AuditLogService
from app.services.order_service import OrderService
from app.services.plan_service import PlanService
from app.services.server_service import ServerService
from app.services.settings_service import SettingsService
from app.services.telegram_service import TelegramNotificationService


router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
)


@router.get(
    "",
    response_model=list[OrderResponse],
)
def get_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    return OrderService(db).get_all()


@router.post(
    "",
    response_model=OrderResponse,
)
def create_order(
    payload: OrderCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    validate_order_plan(payload, db)

    created = OrderService(db).create(payload)
    AuditLogService(db).record_admin(
        current_user,
        action="order.created",
        entity_type="order",
        entity_id=created.id,
        summary=f"Создан заказ #{created.id} для {created.client_email}",
        details=order_audit_details(created),
        ip_address=get_client_ip(request),
    )

    return created


@router.post(
    "/account-access",
    response_model=OrderResponse,
)
def create_account_access(
    payload: OrderAccountAccessCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    client_email = payload.client_email.strip()

    if not client_email:
        raise HTTPException(
            status_code=400,
            detail="Укажите клиента.",
        )

    selected_server_ids = normalize_server_ids(
        payload.server_ids,
        payload.server_id,
    )
    detected_server_ids = find_client_server_ids(
        db,
        client_email,
    )
    server_ids = merge_server_ids(
        selected_server_ids,
        detected_server_ids,
    )

    if not server_ids:
        raise HTTPException(
            status_code=400,
            detail="Клиент не найден на VPN-серверах.",
        )

    service = OrderService(db)
    existing_orders = service.get_all_by_client_email(client_email)
    account_token = next(
        (
            order.account_token
            for order in existing_orders
            if order.account_token
        ),
        "",
    )

    for order in existing_orders:
        order_server_ids = normalize_server_ids(
            order.server_ids,
            order.server_id,
        )

        if all(server_id in order_server_ids for server_id in server_ids):
            return order

    account_order = next(
        (
            order
            for order in existing_orders
            if order.account_token == account_token
        ),
        None,
    )
    order = service.create(
        OrderCreate(
            client_email=client_email,
            customer_contact=payload.customer_contact,
            account_token=account_token,
            server_id=server_ids[0],
            server_ids=server_ids,
            duration_days=0,
            traffic_gb=0,
            amount=0,
            currency="RUB",
            status="access",
            note="Доступ в ЛК для существующего клиента.",
        )
    )

    if account_order is not None:
        service.inherit_account_credentials(order, account_order)

    AuditLogService(db).record_admin(
        current_user,
        action="account.access_created",
        entity_type="account",
        entity_id=order.id,
        summary=f"Создан доступ в личный кабинет для {client_email}",
        details={"server_ids": server_ids},
        ip_address=get_client_ip(request),
    )

    return order


@router.patch(
    "/{order_id}",
    response_model=OrderResponse,
)
def update_order(
    order_id: int,
    payload: OrderUpdate,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = OrderService(db)
    order = service.get_for_update(order_id)

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )

    previous_status = order.status
    validate_order_plan(payload, db, order)

    updated_order = service.update(order, payload)

    if payload.status == "paid":
        TelegramNotificationService.queue_activation_result(
            background_tasks,
            SettingsService(db).get(),
            updated_order,
        )

    action, summary = get_order_update_audit(
        updated_order,
        previous_status,
        payload,
    )
    details = order_audit_details(updated_order)
    details.update({
        "previous_status": previous_status,
        "changed_fields": sorted(payload.model_dump(exclude_unset=True).keys()),
        "activation_error": bool(updated_order.activation_error),
    })
    AuditLogService(db).record_admin(
        current_user,
        action=action,
        entity_type="order",
        entity_id=updated_order.id,
        summary=summary,
        details=details,
        ip_address=get_client_ip(request),
    )

    return updated_order


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = OrderService(db)
    order = service.get(order_id)

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )

    order_summary = {
        "id": order.id,
        "client_email": order.client_email,
        "status": order.status,
        "amount": order.amount,
        "currency": order.currency,
    }
    service.delete(order)
    AuditLogService(db).record_admin(
        current_user,
        action="order.deleted",
        entity_type="order",
        entity_id=order_id,
        summary=f"Удалён заказ #{order_id} клиента {order_summary['client_email']}",
        details=order_summary,
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
    }


def get_order_update_audit(order, previous_status, payload):
    if payload.status == "paid" and order.activation_error:
        return (
            "order.activation_failed",
            f"Ошибка выдачи доступа по заказу #{order.id}",
        )

    if payload.status == "paid" and previous_status != "paid":
        return (
            "order.payment_confirmed",
            f"Подтверждена оплата заказа #{order.id} для {order.client_email}",
        )

    if payload.status == "paid":
        return (
            "order.activation_retried",
            f"Повторная выдача доступа по заказу #{order.id}",
        )

    if payload.status == "canceled" and previous_status != "canceled":
        return (
            "order.canceled",
            f"Отменён заказ #{order.id} клиента {order.client_email}",
        )

    return (
        "order.updated",
        f"Изменён заказ #{order.id} клиента {order.client_email}",
    )


def order_audit_details(order):
    return {
        "status": order.status,
        "plan_name": order.plan_name,
        "server_ids": normalize_server_ids(order.server_ids, order.server_id),
        "amount": order.amount,
        "currency": order.currency,
    }


def validate_order_plan(payload, db, order=None):

    status = payload.status

    if status is None and order is not None:
        status = order.status

    status = status or "pending"

    plan_id = payload.plan_id

    if plan_id is None and order is not None:
        plan_id = order.plan_id

    if status == "access":
        return

    if not plan_id:
        raise HTTPException(
            status_code=400,
            detail="Выберите тариф для заказа.",
        )

    should_validate_servers = (
        order is None
        or payload.status == "paid"
        or payload.plan_id is not None
        or payload.server_id is not None
        or payload.server_ids is not None
    )

    if not should_validate_servers:
        return

    plan = PlanService(db).get(plan_id)

    if plan is None:
        raise HTTPException(
            status_code=400,
            detail="Выбранный тариф не найден.",
        )

    if (
        payload.server_ids is None
        and payload.server_id is None
        and order is not None
    ):
        raw_server_ids = order.server_ids
        raw_server_id = order.server_id
    else:
        raw_server_ids = payload.server_ids or []
        raw_server_id = payload.server_id

    server_ids = normalize_server_ids(
        raw_server_ids,
        raw_server_id,
    )

    if len(server_ids) != plan.server_limit:
        raise HTTPException(
            status_code=400,
            detail=f"По выбранному тарифу нужно выбрать серверов: {plan.server_limit}.",
        )

    enabled_server_ids = {
        server.id
        for server in ServerService(db).get_all()
        if server.enabled
    }

    if len(enabled_server_ids) < plan.server_limit:
        raise HTTPException(
            status_code=400,
            detail="Для выбранного тарифа недостаточно доступных VPN-серверов.",
        )

    if any(server_id not in enabled_server_ids for server_id in server_ids):
        raise HTTPException(
            status_code=400,
            detail="В заказе выбран недоступный VPN-сервер.",
        )


def normalize_server_ids(server_ids, server_id):

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


def find_client_server_ids(db, client_email):

    expected = client_email.strip().lower()
    result = []

    for client in ClientService(db).search(client_email):

        if (client.get("email") or "").strip().lower() != expected:
            continue

        server_id = client.get("server_id")

        if server_id and server_id not in result:
            result.append(server_id)

    return result


def merge_server_ids(*groups):

    result = []

    for group in groups:
        for server_id in group or []:
            if server_id not in result:
                result.append(server_id)

    return result
