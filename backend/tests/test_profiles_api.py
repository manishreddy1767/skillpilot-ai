import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.modules.profile.models import Profile

PROFILES = "/api/v1/profiles"


def test_create_profile_returns_201_with_location(
    client: TestClient, profile_payload: dict[str, str]
) -> None:
    response = client.post(PROFILES, json=profile_payload)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Ada Lovelace"
    assert body["email"] == "ada@example.com"
    assert body["career_goal"] == "Machine learning engineer"
    assert body["bio"] == "Enjoys analytical engines."
    assert response.headers["location"].endswith(f"{PROFILES}/{body['id']}")


def test_create_profile_normalizes_input(client: TestClient) -> None:
    response = client.post(
        PROFILES,
        json={
            "name": "  Ada  ",
            "email": "  Ada@Example.COM ",
            "career_goal": " Data scientist ",
            "bio": "   ",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Ada"
    assert body["email"] == "ada@example.com"
    assert body["career_goal"] == "Data scientist"
    assert body["bio"] is None


def test_timestamps_are_utc(client: TestClient, profile_payload: dict[str, str]) -> None:
    created = client.post(PROFILES, json=profile_payload).json()
    fetched = client.get(f"{PROFILES}/{created['id']}").json()

    for value in (created["created_at"], fetched["created_at"], fetched["updated_at"]):
        assert datetime.fromisoformat(value).utcoffset().total_seconds() == 0


def test_bio_is_optional(client: TestClient, profile_payload: dict[str, str]) -> None:
    del profile_payload["bio"]
    response = client.post(PROFILES, json=profile_payload)
    assert response.status_code == 201
    assert response.json()["bio"] is None


def test_duplicate_email_is_rejected_case_insensitively(
    client: TestClient, profile_payload: dict[str, str]
) -> None:
    assert client.post(PROFILES, json=profile_payload).status_code == 201

    response = client.post(PROFILES, json={**profile_payload, "email": "ADA@example.com"})

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "duplicate_email"
    assert error["details"][0]["field"] == "email"


@pytest.mark.parametrize(
    ("override", "field", "error_type"),
    [
        ({"name": ""}, "name", "string_too_short"),
        ({"name": "   "}, "name", "string_too_short"),
        ({"name": "x" * 101}, "name", "string_too_long"),
        ({"email": "not-an-email"}, "email", "value_error"),
        ({"career_goal": ""}, "career_goal", "string_too_short"),
        ({"career_goal": "x" * 201}, "career_goal", "string_too_long"),
        ({"bio": "x" * 2001}, "bio", "string_too_long"),
        ({"unexpected": "x"}, "unexpected", "extra_forbidden"),
    ],
)
def test_create_profile_validation(
    client: TestClient,
    profile_payload: dict[str, str],
    override: dict[str, str],
    field: str,
    error_type: str,
) -> None:
    response = client.post(PROFILES, json={**profile_payload, **override})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert {"field": field, "type": error_type} in [
        {"field": d["field"], "type": d["type"]} for d in error["details"]
    ]


def test_missing_required_fields(client: TestClient) -> None:
    response = client.post(PROFILES, json={})
    assert response.status_code == 422
    fields = {d["field"] for d in response.json()["error"]["details"]}
    assert fields == {"name", "email", "career_goal"}


def test_validation_errors_do_not_echo_input(client: TestClient) -> None:
    response = client.post(PROFILES, json={"email": "secret-value"})
    assert "secret-value" not in response.text


def test_malformed_json(client: TestClient) -> None:
    response = client.post(PROFILES, content=b"{bad", headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["error"]["details"][0] == {
        "field": "",
        "message": "JSON decode error",
        "type": "json_invalid",
    }


def test_get_profile(client: TestClient, profile_payload: dict[str, str]) -> None:
    created = client.post(PROFILES, json=profile_payload).json()

    response = client.get(f"{PROFILES}/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_missing_profile_returns_404(client: TestClient) -> None:
    response = client.get(f"{PROFILES}/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "profile_not_found"


def test_get_profile_with_malformed_id_returns_422(client: TestClient) -> None:
    response = client.get(f"{PROFILES}/not-a-uuid")
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "profile_id"


def test_list_profiles_empty(client: TestClient) -> None:
    response = client.get(PROFILES)
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_list_profiles_newest_first_with_pagination(
    client: TestClient, db: Session, profile_payload: dict[str, str]
) -> None:
    # Pin creation times explicitly: the OS clock can be too coarse to order rapid inserts.
    for i in range(3):
        created = client.post(PROFILES, json={**profile_payload, "email": f"user{i}@example.com"})
        db.execute(
            update(Profile)
            .where(Profile.id == uuid.UUID(created.json()["id"]))
            .values(created_at=datetime(2026, 1, 1 + i, tzinfo=UTC))
        )
        db.commit()

    page = client.get(PROFILES, params={"limit": 2, "offset": 0}).json()
    rest = client.get(PROFILES, params={"limit": 2, "offset": 2}).json()

    assert page["total"] == 3
    assert [p["email"] for p in page["items"]] == ["user2@example.com", "user1@example.com"]
    assert [p["email"] for p in rest["items"]] == ["user0@example.com"]


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_list_profiles_rejects_bad_pagination(client: TestClient, params: dict[str, int]) -> None:
    response = client.get(PROFILES, params=params)
    assert response.status_code == 422
