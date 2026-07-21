from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi import Response
from pydantic import BaseModel
from pydantic import Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import time

from app.db.deps import get_db
from app.auth.account import clear_account_session_cookie
from app.auth.account import get_current_account
from app.auth.account import set_account_session_cookie
from app.schemas.order import OrderCreate
from app.services.client_service import ClientService
from app.services.order_service import OrderService
from app.services.plan_service import PlanService
from app.services.rate_limit import RateLimiter
from app.services.server_service import ServerService
from app.services.settings_service import SettingsService
from app.services.telegram_service import TelegramNotificationService
from app.services.vless_service import attach_client_links
from app.services.xui_service import XUIService


router = APIRouter(
    prefix="/public",
    tags=["Public"],
)

account_login_limiter = RateLimiter(
    limit=12,
    window_seconds=600,
)
public_order_limiter = RateLimiter(
    limit=20,
    window_seconds=3600,
)


class PublicOrderCreate(BaseModel):
    client_email: str = Field(min_length=2, max_length=255)
    customer_contact: str = Field(min_length=2, max_length=255)
    request_id: str = Field(
        min_length=16,
        max_length=80,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    plan_id: int
    server_ids: list[int]


class PublicRenewOrderCreate(BaseModel):
    plan_id: int
    server_ids: list[int]


class PublicAccountLogin(BaseModel):
    login: str
    password: str


class PublicAccountCredentials(BaseModel):
    login: str
    password: str
    current_password: str = ""


@router.get("/checkout")
def get_checkout_data(
    db: Session = Depends(get_db),
):

    return {
        "settings": get_public_settings(db),
        "plans": get_public_plans(db),
        "servers": get_public_servers(db),
    }


@router.post("/orders")
def create_public_order(
    payload: PublicOrderCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):

    service = OrderService(db)
    request_id = payload.request_id.strip()
    existing_order = service.get_by_public_request_id(request_id)

    if existing_order is not None:
        return build_payment_response(db, existing_order)

    if not public_order_limiter.allow(get_client_ip(request)):
        raise HTTPException(
            status_code=429,
            detail="Слишком много заявок. Попробуйте позже.",
        )

    client_email = payload.client_email.strip()
    customer_contact = payload.customer_contact.strip()

    if len(client_email) < 2 or len(customer_contact) < 2:
        raise HTTPException(
            status_code=400,
            detail="Укажите имя клиента и контакт для связи.",
        )

    plan, server_ids = validate_order_choice(
        db,
        payload.plan_id,
        payload.server_ids,
    )

    created = False

    try:
        order = service.create(
            OrderCreate(
                client_email=client_email,
                customer_contact=customer_contact,
                public_request_id=request_id,
                plan_id=plan.id,
                server_ids=server_ids,
                status="pending",
                note="Публичная заявка с сайта покупки.",
            )
        )
        created = True
    except IntegrityError:
        db.rollback()
        order = service.get_by_public_request_id(request_id)

        if order is None:
            raise

    if created:
        TelegramNotificationService.queue_new_order(
            background_tasks,
            SettingsService(db).get(),
            order,
        )

    return build_payment_response(db, order)


@router.post("/account/login")
def login_public_account(
    payload: PublicAccountLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):

    rate_limit_key = get_client_ip(request)

    if not account_login_limiter.allow(rate_limit_key):
        raise HTTPException(
            status_code=429,
            detail="Слишком много попыток входа. Попробуйте через 10 минут.",
        )

    order = OrderService(db).login_to_account(
        payload.login,
        payload.password,
    )

    if order is None:
        raise HTTPException(
            status_code=401,
            detail="Неверный логин или пароль.",
        )

    account_login_limiter.reset(rate_limit_key)
    set_account_session_cookie(response, order)

    return {
        "success": True,
    }


@router.post("/account/logout")
def logout_public_account(response: Response):
    clear_account_session_cookie(response)

    return {
        "success": True,
    }


@router.get("/account/session")
def get_session_account(
    response: Response,
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
):
    set_account_session_cookie(response, account)

    return build_account_response(db, account)


@router.patch("/account/session/credentials")
def update_session_account_credentials(
    payload: PublicAccountCredentials,
    response: Response,
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return update_account_credentials_response(
        db,
        account,
        payload,
        response,
    )


@router.post("/account/session/renew")
def create_session_renew_order(
    payload: PublicRenewOrderCreate,
    background_tasks: BackgroundTasks,
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return create_renew_order_response(
        db,
        account,
        payload,
        background_tasks,
    )


@router.get("/account/{account_token}")
def get_public_account(
    account_token: str,
    db: Session = Depends(get_db),
):

    service = OrderService(db)
    anchor_order = service.get_by_account_token(account_token)

    if anchor_order is None:
        raise HTTPException(
            status_code=404,
            detail="Личный кабинет не найден.",
        )

    ensure_activation_access(anchor_order)

    return build_account_response(db, anchor_order)


@router.patch("/account/{account_token}/credentials")
def update_public_account_credentials(
    account_token: str,
    payload: PublicAccountCredentials,
    response: Response,
    db: Session = Depends(get_db),
):

    service = OrderService(db)
    anchor_order = service.get_by_account_token(account_token)

    if anchor_order is None:
        raise HTTPException(
            status_code=404,
            detail="Личный кабинет не найден.",
        )

    ensure_activation_access(anchor_order)

    return update_account_credentials_response(
        db,
        anchor_order,
        payload,
        response,
    )


@router.post("/account/{account_token}/renew")
def create_public_renew_order(
    account_token: str,
    payload: PublicRenewOrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):

    service = OrderService(db)
    anchor_order = service.get_by_account_token(account_token)

    if anchor_order is None:
        raise HTTPException(
            status_code=404,
            detail="Личный кабинет не найден.",
        )

    ensure_activation_access(anchor_order)

    return create_renew_order_response(
        db,
        anchor_order,
        payload,
        background_tasks,
    )


def build_account_response(db, anchor_order):
    service = OrderService(db)
    orders = service.get_all_by_account_token(anchor_order.account_token)
    pending_order = next(
        (
            order
            for order in orders
            if order.status == "pending"
        ),
        None,
    )
    subscriptions = build_subscriptions(
        db,
        anchor_order.client_email,
        orders,
    )

    return {
        "settings": get_public_settings(db),
        "account": build_account_summary(anchor_order, orders, subscriptions),
        "subscriptions": subscriptions,
        "orders": [serialize_order(order) for order in orders],
        "pending_payment": (
            build_payment_response(db, pending_order)
            if pending_order is not None
            else None
        ),
        "plans": get_public_plans(db),
        "servers": get_public_servers(db),
    }


def update_account_credentials_response(
    db,
    anchor_order,
    payload,
    response,
):
    service = OrderService(db)

    try:
        service.update_account_credentials(
            anchor_order,
            payload.login,
            payload.password,
            payload.current_password,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    set_account_session_cookie(response, anchor_order)

    return {
        "success": True,
        "account_login": anchor_order.account_login,
        "has_password": bool(anchor_order.account_password_hash),
    }


def create_renew_order_response(
    db,
    anchor_order,
    payload,
    background_tasks,
):
    plan, server_ids = validate_order_choice(
        db,
        payload.plan_id,
        payload.server_ids,
    )
    service = OrderService(db)
    order = service.create(
        OrderCreate(
            client_email=anchor_order.client_email,
            customer_contact=anchor_order.customer_contact,
            account_token=anchor_order.account_token,
            account_login=anchor_order.account_login,
            plan_id=plan.id,
            server_ids=server_ids,
            status="pending",
            note=f"Продление из личного кабинета. Кабинет заказа #{anchor_order.id}.",
        )
    )
    service.inherit_account_credentials(order, anchor_order)
    TelegramNotificationService.queue_new_order(
        background_tasks,
        SettingsService(db).get(),
        order,
        title="Запрос на продление",
    )

    return build_payment_response(db, order)


def ensure_activation_access(anchor_order):
    if anchor_order.account_password_hash:
        raise HTTPException(
            status_code=401,
            detail="Ссылка активации уже использована. Войдите по логину и паролю.",
        )


def get_client_ip(request):
    forwarded_for = request.headers.get("x-forwarded-for", "")

    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()[:64]

    if request.client:
        return request.client.host[:64]

    return "unknown"


def validate_order_choice(db, plan_id, raw_server_ids):

    plan = PlanService(db).get(plan_id)

    if plan is None or not plan.is_active:
        raise HTTPException(
            status_code=404,
            detail="Тариф не найден.",
        )

    server_ids = normalize_server_ids(raw_server_ids)

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

    if any(server_id not in enabled_server_ids for server_id in server_ids):
        raise HTTPException(
            status_code=400,
            detail="Выбран недоступный VPN-сервер.",
        )

    return plan, server_ids


def build_payment_response(db, order):

    settings = SettingsService(db).get()

    return {
        "id": order.id,
        "client_email": order.client_email,
        "customer_contact": order.customer_contact,
        "account_token": order.account_token,
        "plan_name": order.plan_name,
        "server_names": order.server_names,
        "amount": order.amount,
        "currency": order.currency,
        "status": order.status,
        "payment_phone": settings.payment_phone,
        "payment_recipient": settings.payment_recipient,
        "payment_instructions": settings.payment_instructions,
        "payment_comment": f"Заказ #{order.id}",
        "support_contact": settings.support_contact,
    }


def get_public_settings(db):

    settings = SettingsService(db).get()

    return {
        "panel_name": settings.panel_name,
        "support_contact": settings.support_contact,
        "payment_phone": settings.payment_phone,
        "payment_recipient": settings.payment_recipient,
        "payment_instructions": settings.payment_instructions,
    }


def get_public_plans(db):

    return [
        {
            "id": plan.id,
            "name": plan.name,
            "description": plan.description,
            "duration_days": plan.duration_days,
            "traffic_gb": plan.traffic_gb,
            "server_limit": plan.server_limit,
            "price": plan.price,
            "currency": plan.currency,
        }
        for plan in PlanService(db).get_all()
        if plan.is_active
    ]


def get_public_servers(db):

    return [
        {
            "id": server.id,
            "name": server.name,
            "country": server.country,
        }
        for server in ServerService(db).get_all()
        if server.enabled
    ]


def build_subscriptions(db, client_email, orders):

    server_ids = collect_server_ids(orders)
    server_service = ServerService(db)
    settings = SettingsService(db).get()
    servers = []

    for server_id in server_ids:
        server = server_service.get(server_id)

        if server:
            servers.append(server_ref(server))
        else:
            servers.append(SimpleNamespace(
                id=server_id,
                name=f"Сервер #{server_id}",
                country="",
                host="",
                username="",
                password="",
                base_path="",
            ))

    with ThreadPoolExecutor(max_workers=worker_count(servers)) as executor:
        return list(executor.map(
            lambda server: build_subscription(
                server,
                client_email,
                settings.subscription_port,
                settings.subscription_path,
            ),
            servers,
        ))


def build_subscription(
    server,
    client_email,
    subscription_port,
    subscription_path,
):

    item = {
        "server_id": server.id,
        "server_name": server.name,
        "country": server.country,
        "email": client_email,
        "enabled": False,
        "traffic": 0,
        "up": 0,
        "down": 0,
        "expiry": 0,
        "vless_url": "",
        "subscription_url": "",
        "error": "",
    }
    xui = None

    try:
        xui = XUIService.connect(server)
        data = xui.get_all()
        clients = [
            format_client(item)
            for item in data.get("items", [])
        ]
        clients = attach_client_links(
            server=server,
            clients=clients,
            inbounds=xui.get_inbounds(),
            subscription_port=subscription_port,
            subscription_path=subscription_path,
        )
        client = find_client_by_email(
            clients,
            client_email,
        )

        if client is None:
            item["error"] = "Клиент пока не выдан на этом сервере."
        else:
            item.update(client)

    except Exception as error:
        item["error"] = str(error)
    finally:
        close_xui(xui)

    return item


def format_client(item):

    traffic = item.get("traffic", {})
    up = traffic.get("up", item.get("up", 0))
    down = traffic.get("down", item.get("down", 0))

    return {
        "email": item.get("email"),
        "group": item.get("group", ""),
        "comment": item.get("comment", ""),
        "enabled": item.get("enable", item.get("enabled", False)),
        "traffic": up + down,
        "up": up,
        "down": down,
        "last_online": traffic.get("lastOnline", item.get("lastOnline", 0)),
        "expiry": item.get("expiryTime", item.get("expiry", 0)),
        "created": item.get("createdAt", 0),
        "updated": item.get("updatedAt", 0),
    }


def server_ref(server):

    return SimpleNamespace(
        id=server.id,
        name=server.name,
        country=server.country,
        host=server.host,
        username=server.username,
        password=server.password,
        base_path=server.base_path,
    )


def worker_count(items):

    return max(1, min(6, len(items) or 1))


def close_xui(xui):

    if xui is None:
        return

    try:
        xui.client.close()
    except Exception:
        pass


def build_account_summary(anchor_order, orders, subscriptions):

    pending_orders = [
        order for order in orders
        if order.status == "pending"
    ]
    paid_orders = [
        order for order in orders
        if order.status == "paid"
    ]
    expires = [
        int(subscription.get("expiry") or 0)
        for subscription in subscriptions
        if int(subscription.get("expiry") or 0) > 0
    ]
    now_ms = int(time.time() * 1000)
    is_active = any(
        subscription.get("enabled")
        and (
            int(subscription.get("expiry") or 0) == 0
            or int(subscription.get("expiry") or 0) > now_ms
        )
        for subscription in subscriptions
    )

    latest_order = orders[0] if orders else anchor_order

    return {
        "account_token": anchor_order.account_token,
        "client_email": anchor_order.client_email,
        "customer_contact": anchor_order.customer_contact,
        "account_login": anchor_order.account_login,
        "has_password": bool(anchor_order.account_password_hash),
        "password_changed_at": anchor_order.account_password_changed_at,
        "status": get_account_status(is_active, pending_orders, paid_orders),
        "expires_at": max(expires) if expires else None,
        "server_ids": get_order_server_ids(latest_order),
        "latest_order_id": latest_order.id,
        "pending_orders": len(pending_orders),
        "paid_orders": len(paid_orders),
    }


def get_account_status(is_active, pending_orders, paid_orders):

    if is_active:
        return "active"

    if pending_orders:
        return "pending"

    if paid_orders:
        return "expired"

    return "new"


def serialize_order(order):

    return {
        "id": order.id,
        "client_email": order.client_email,
        "customer_contact": order.customer_contact,
        "account_login": order.account_login,
        "plan_name": order.plan_name,
        "server_names": order.server_names,
        "duration_days": order.duration_days,
        "traffic_gb": order.traffic_gb,
        "amount": order.amount,
        "currency": order.currency,
        "status": order.status,
        "note": order.note,
        "paid_at": order.paid_at,
        "activated_at": order.activated_at,
        "activation_error": order.activation_error,
        "activated_server_ids": order.activated_server_ids,
        "created_at": order.created_at,
    }


def collect_server_ids(orders):

    result = []

    for order in orders:
        for server_id in get_order_server_ids(order):
            if server_id not in result:
                result.append(server_id)

    return result


def get_order_server_ids(order):

    server_ids = normalize_server_ids(order.server_ids)

    if not server_ids and order.server_id:
        server_ids = [order.server_id]

    return server_ids


def find_client_by_email(clients, email):

    expected = (email or "").strip()

    for client in clients:
        if (client.get("email") or "").strip() == expected:
            return client

    return None


def normalize_server_ids(values):

    result = []

    for item in values or []:

        try:
            value = int(item)
        except (TypeError, ValueError):
            continue

        if value not in result:
            result.append(value)

    return result
