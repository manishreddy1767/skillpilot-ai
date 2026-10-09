import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status

from app.core.db import DbSession
from app.modules.profile import service
from app.modules.profile.schemas import ProfileCreate, ProfileList, ProfileRead

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.post("", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
def create_profile(
    data: ProfileCreate, request: Request, response: Response, db: DbSession
) -> ProfileRead:
    profile = service.create_profile(db, data)
    response.headers["Location"] = str(request.url_for("get_profile", profile_id=profile.id))
    return ProfileRead.model_validate(profile)


@router.get("", response_model=ProfileList)
def list_profiles(
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ProfileList:
    items, total = service.list_profiles(db, limit=limit, offset=offset)
    return ProfileList(
        items=[ProfileRead.model_validate(p) for p in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{profile_id}", response_model=ProfileRead)
def get_profile(profile_id: uuid.UUID, db: DbSession) -> ProfileRead:
    return ProfileRead.model_validate(service.get_profile(db, profile_id))
