from __future__ import annotations

import importlib
import os

import requests


def _load_app():
    os.environ["SNOWFLAKE_ENGINE_MODE"] = "mock"
    os.environ["SNOWFLAKE_SECRET"] = "test-secret"
    os.environ["FORGE_SOCKET_TOKEN"] = "test-secret"
    module = importlib.import_module("app")
    importlib.reload(module)
    return module


def test_api_options() -> None:
    module = _load_app()
    client = module.app.test_client()
    response = client.get("/api/options")

    assert response.status_code == 200
    data = response.get_json()
    assert "phases" in data
    assert "globalOptions" in data


def test_ai_health_uses_requests(monkeypatch) -> None:
    module = _load_app()
    client = module.app.test_client()

    class DummyResponse:
        ok = True
        status_code = 200
        headers = {"content-type": "application/json"}

        @staticmethod
        def json():
            return {"version": "0.0.test"}

    def fake_get(*args, **kwargs):
        return DummyResponse()

    monkeypatch.setattr(requests, "get", fake_get)

    response = client.get("/api/health/ai")

    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"
    assert data["providers"]["ollama"]["status"] == "healthy"
