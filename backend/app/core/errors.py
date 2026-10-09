"""Domain errors and their mapping to the API error envelope.

Services raise the domain errors below and never import FastAPI. This module is the single place
where they are translated into HTTP responses of the form:

    {"error": {"code": "...", "message": "...", "details": [...]}}
"""

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class DomainError(Exception):
    code = "domain_error"
    message = "The request could not be completed."

    def __init__(self, message: str | None = None, details: list[dict[str, Any]] | None = None):
        self.message = message or self.message
        self.details = details or []
        super().__init__(self.message)


class NotFoundError(DomainError):
    code = "not_found"
    message = "The requested resource was not found."


class ConflictError(DomainError):
    code = "conflict"
    message = "The request conflicts with existing data."


_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
}


def error_response(
    status_code: int, code: str, message: str, details: list[dict[str, Any]] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or []}},
    )


def _status_for(exc: DomainError) -> int:
    for error_type, status_code in _STATUS_BY_ERROR.items():
        if isinstance(exc, error_type):
            return status_code
    return status.HTTP_400_BAD_REQUEST


async def _handle_domain_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return error_response(_status_for(exc), exc.code, exc.message, exc.details)


def _field_name(loc: tuple[Any, ...], error_type: str) -> str:
    # For unparseable JSON, loc holds a character offset rather than a field.
    if error_type == "json_invalid":
        return ""
    return ".".join(str(part) for part in loc if part not in ("body", "query", "path"))


async def _handle_validation_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Deliberately omit the rejected input values: they may contain personal data.
    details = [
        {
            "field": _field_name(err["loc"], err["type"]),
            "message": err["msg"],
            "type": err["type"],
        }
        for err in exc.errors()
    ]
    return error_response(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "validation_error",
        "The request contains invalid data.",
        details,
    )


async def _handle_http_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    return error_response(exc.status_code, "http_error", str(exc.detail))


async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    # Log method and path only; never the request body.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR, "internal_error", "An unexpected error occurred."
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _handle_domain_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
