from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from pydantic import BaseModel
from pydantic import Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.settings import SettingsResponse
from app.schemas.settings import SettingsUpdate
from app.services.settings_service import SettingsService
from app.services.telegram_service import TelegramNotificationError
from app.services.telegram_service import TelegramNotificationService


router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
)


class TelegramTestRequest(BaseModel):
    chat_id: str | None = Field(default=None, max_length=100)


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

    try:
        return SettingsService(db).update(payload)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@router.post("/telegram/test")
def test_telegram_notifications(
    payload: TelegramTestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = SettingsService(db).get()

    try:
        message = TelegramNotificationService.send_message(
            settings.telegram_bot_token,
            (payload.chat_id or settings.telegram_chat_id).strip(),
            (
                f"Тестовое уведомление {settings.panel_name}\n\n"
                "Telegram-уведомления настроены правильно."
            ),
        )
    except TelegramNotificationError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    return {
        "success": True,
        "message_id": message.get("message_id"),
    }


@router.get("/telegram/chats")
def get_telegram_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = SettingsService(db).get()

    try:
        chats = TelegramNotificationService.get_recent_chats(
            settings.telegram_bot_token,
        )
    except TelegramNotificationError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    return {
        "chats": chats,
    }
