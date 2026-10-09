"""The service layer works without HTTP: future jobs, CLIs, and agent tools call it directly."""

import uuid

import pytest
from sqlalchemy.orm import Session

from app.modules.profile import service
from app.modules.profile.schemas import ProfileCreate


def _data(email: str = "grace@example.com") -> ProfileCreate:
    return ProfileCreate(name="Grace Hopper", email=email, career_goal="Compiler engineer")


def test_create_and_get(db: Session) -> None:
    created = service.create_profile(db, _data())
    assert service.get_profile(db, created.id).email == "grace@example.com"


def test_duplicate_email_raises_domain_error(db: Session) -> None:
    service.create_profile(db, _data())
    with pytest.raises(service.DuplicateEmailError):
        service.create_profile(db, _data("GRACE@example.com"))


def test_session_usable_after_duplicate(db: Session) -> None:
    service.create_profile(db, _data())
    with pytest.raises(service.DuplicateEmailError):
        service.create_profile(db, _data())
    # The failed transaction was rolled back, so the session keeps working.
    service.create_profile(db, _data("other@example.com"))
    _, total = service.list_profiles(db, limit=10, offset=0)
    assert total == 2


def test_get_missing_raises_not_found(db: Session) -> None:
    with pytest.raises(service.ProfileNotFoundError):
        service.get_profile(db, uuid.uuid4())
