from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.request import get_client_ip
from app.schemas.plan import PlanCreate
from app.schemas.plan import PlanResponse
from app.schemas.plan import PlanUpdate
from app.services.plan_service import PlanService
from app.services.audit_log_service import AuditLogService


router = APIRouter(
    prefix="/plans",
    tags=["Plans"],
)


@router.get(
    "",
    response_model=list[PlanResponse],
)
def get_plans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    return PlanService(db).get_all()


@router.post(
    "",
    response_model=PlanResponse,
)
def create_plan(
    payload: PlanCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    created = PlanService(db).create(payload)
    AuditLogService(db).record_admin(
        current_user,
        action="plan.created",
        entity_type="plan",
        entity_id=created.id,
        summary=f"Создан тариф {created.name}",
        details={
            "price": created.price,
            "currency": created.currency,
            "server_limit": created.server_limit,
        },
        ip_address=get_client_ip(request),
    )

    return created


@router.patch(
    "/{plan_id}",
    response_model=PlanResponse,
)
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = PlanService(db)
    plan = service.get(plan_id)

    if plan is None:
        raise HTTPException(
            status_code=404,
            detail="Plan not found",
        )

    updated = service.update(plan, payload)
    AuditLogService(db).record_admin(
        current_user,
        action="plan.updated",
        entity_type="plan",
        entity_id=updated.id,
        summary=f"Изменён тариф {updated.name}",
        details={
            "changed_fields": sorted(payload.model_dump(exclude_unset=True).keys()),
        },
        ip_address=get_client_ip(request),
    )

    return updated


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = PlanService(db)
    plan = service.get(plan_id)

    if plan is None:
        raise HTTPException(
            status_code=404,
            detail="Plan not found",
        )

    plan_name = plan.name
    service.delete(plan)
    AuditLogService(db).record_admin(
        current_user,
        action="plan.deleted",
        entity_type="plan",
        entity_id=plan_id,
        summary=f"Удалён тариф {plan_name}",
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
    }
