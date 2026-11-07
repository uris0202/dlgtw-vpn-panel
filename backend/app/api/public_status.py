from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.request import get_client_ip
from app.db.deps import get_db
from app.services.public_status_service import public_status
from app.services.rate_limit import RateLimiter
from app.services.server_service import ServerService
from app.services.settings_service import SettingsService


router = APIRouter(prefix="/public/status", tags=["Public"])
limiter = RateLimiter(limit=120, window_seconds=60)


@router.get("")
def get_public_status(request: Request, response: Response, db: Session = Depends(get_db)):
    if not limiter.allow(get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Слишком частое обновление статуса.", headers={"Retry-After": "60"})
    response.headers["Cache-Control"] = "no-store"
    return {**public_status(ServerService(db).get_all()), "panel_name": SettingsService(db).get().panel_name}
