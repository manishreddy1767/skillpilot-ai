import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

EMAIL_MAX_LENGTH = 254


class ProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    career_goal: str = Field(min_length=1, max_length=200)
    bio: str | None = Field(default=None, max_length=2000)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        # Treat addresses case-insensitively. Strictly the local part may be case-sensitive,
        # but in practice providers ignore case and users expect it.
        if len(value) > EMAIL_MAX_LENGTH:
            raise ValueError(f"Email must be at most {EMAIL_MAX_LENGTH} characters.")
        return value.lower()

    @field_validator("bio")
    @classmethod
    def blank_bio_is_none(cls, value: str | None) -> str | None:
        return value or None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    career_goal: str
    bio: str | None
    created_at: datetime
    updated_at: datetime


class ProfileList(BaseModel):
    items: list[ProfileRead]
    total: int
    limit: int
    offset: int
