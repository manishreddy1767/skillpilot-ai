from collections.abc import Iterator
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.db import build_engine, get_db


def test_liveness(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_unreachable_database(client: TestClient, tmp_path: Path) -> None:
    broken = build_engine(f"sqlite:///{tmp_path / 'missing-dir' / 'db.sqlite'}")

    def broken_db() -> Iterator[Session]:
        session = sessionmaker(bind=broken)()
        try:
            yield session
        finally:
            session.close()

    client.app.dependency_overrides[get_db] = broken_db  # type: ignore[attr-defined]
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_error"
