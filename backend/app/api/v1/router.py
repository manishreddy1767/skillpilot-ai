from fastapi import APIRouter

from app.modules.health.router import router as health_router
from app.modules.profile.router import router as profile_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(profile_router)
