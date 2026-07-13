from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.schemas.order import OrderAccountAccessCreate
from app.schemas.order import OrderCreate
from app.schemas.order import OrderResponse
from app.schemas.order import OrderUpdate
from app.services.client_service import ClientService
from app.services.order_service import OrderService


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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    validate_order_plan(payload)

    return OrderService(db).create(payload)


@router.post(
    "/account-access",
    response_model=OrderResponse,
)
def create_account_access(
    payload: OrderAccountAccessCreate,
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

    return service.create(
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


@router.patch(
    "/{order_id}",
    response_model=OrderResponse,
)
def update_order(
    order_id: int,
    payload: OrderUpdate,
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

    validate_order_plan(payload, order)

    return service.update(order, payload)


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
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

    service.delete(order)

    return {
        "success": True,
    }


def validate_order_plan(payload, order=None):

    status = payload.status

    if status is None and order is not None:
        status = order.status

    status = status or "pending"

    plan_id = payload.plan_id

    if plan_id is None and order is not None:
        plan_id = order.plan_id

    if status != "access" and not plan_id:
        raise HTTPException(
            status_code=400,
            detail="Выберите тариф для заказа.",
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
