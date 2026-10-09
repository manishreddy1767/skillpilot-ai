import logging

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import DbSession
from app.core.errors import error_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def liveness() -> dict[str, str]:
    """The process is up and serving requests."""
    return {"status": "ok"}


@router.get("/ready", response_model=None)
def readiness(db: DbSession) -> dict[str, str] | JSONResponse:
    """The application can reach its database."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Readiness check failed: database unreachable")
        return error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE, "database_unavailable", "Database is unreachable."
        )
    return {"status": "ok"}
