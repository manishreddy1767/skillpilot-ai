import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.profile.models import Profile
from app.modules.profile.schemas import ProfileCreate


class DuplicateEmailError(ConflictError):
    code = "duplicate_email"
    message = "A profile with this email already exists."

    def __init__(self) -> None:
        super().__init__(details=[{"field": "email", "message": self.message}])


class ProfileNotFoundError(NotFoundError):
    code = "profile_not_found"
    message = "Profile not found."


def create_profile(db: Session, data: ProfileCreate) -> Profile:
    profile = Profile(**data.model_dump())
    db.add(profile)
    # Rely on the unique constraint rather than check-then-insert, which races under concurrency.
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "email" in str(exc.orig).lower():
            raise DuplicateEmailError() from None
        raise
    db.refresh(profile)
    return profile


def get_profile(db: Session, profile_id: uuid.UUID) -> Profile:
    profile = db.get(Profile, profile_id)
    if profile is None:
        raise ProfileNotFoundError()
    return profile


def list_profiles(db: Session, limit: int, offset: int) -> tuple[list[Profile], int]:
    total = db.scalar(select(func.count()).select_from(Profile)) or 0
    items = db.scalars(
        select(Profile).order_by(Profile.created_at.desc(), Profile.id).limit(limit).offset(offset)
    ).all()
    return list(items), total
