import logging

from fastapi import FastAPI
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.dashboard import router as dashboard_router
from app.api.auth import router as auth_router
from app.api.servers import router as servers_router
from app.api.clients import router as clients_router
from app.api.search import router as search_router
from app.api.settings import router as settings_router
from app.api.plans import router as plans_router
from app.api.orders import router as orders_router
from app.api.public import router as public_router
from app.api.accounts import router as accounts_router

import app.models.user
import app.models.server
import app.models.settings
import app.models.plan
import app.models.order

from app.db.database import Base
from app.db.database import engine
from app.core.config import settings


logger = logging.getLogger(__name__)
docs_url = "/docs" if settings.API_DOCS_ENABLED else None
redoc_url = "/redoc" if settings.API_DOCS_ENABLED else None
openapi_url = "/openapi.json" if settings.API_DOCS_ENABLED else None


app = FastAPI(
    title="DLGTW VPN API",
    version="1.0",
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
    root_path="/api",
)

app.include_router(auth_router)
app.include_router(servers_router)
app.include_router(dashboard_router)
app.include_router(clients_router)
app.include_router(search_router)
app.include_router(settings_router)
app.include_router(plans_router)
app.include_router(orders_router)
app.include_router(public_router)
app.include_router(accounts_router)


@app.get("/")
def root():
    return {
        "status": "ok"
    }


@app.get("/health", include_in_schema=False)
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        logger.error("Database health check failed: %s", type(error).__name__)
        raise HTTPException(
            status_code=503,
            detail="Service unavailable",
        ) from error

    return {
        "status": "ok",
    }
