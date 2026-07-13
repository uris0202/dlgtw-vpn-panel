from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.settings import SettingsResponse
from app.schemas.settings import SettingsUpdate
from app.services.settings_service import SettingsService


router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
)


@router.get(
    "",
    response_model=SettingsResponse,
)
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    return SettingsService(db).get()


@router.patch(
    "",
    response_model=SettingsResponse,
)
def update_settings(
    payload: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    return SettingsService(db).update(payload)
