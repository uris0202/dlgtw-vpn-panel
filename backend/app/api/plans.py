from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.schemas.plan import PlanCreate
from app.schemas.plan import PlanResponse
from app.schemas.plan import PlanUpdate
from app.services.plan_service import PlanService


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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    return PlanService(db).create(payload)


@router.patch(
    "/{plan_id}",
    response_model=PlanResponse,
)
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
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

    return service.update(plan, payload)


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
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

    service.delete(plan)

    return {
        "success": True,
    }
