from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app, classify
from app.store import Store

PASSWORD = "integration-test-only"


@pytest.fixture
def database(tmp_path, monkeypatch):
    path = tmp_path / "test.sqlite"
    monkeypatch.setenv("VISIONWEAR_DB", str(path))
    db = Store(path)
    for name, role in (("vest", "vest"), ("first", "helper"), ("second", "helper")):
        db.add_account(f"{name}@example.test", role, name, PASSWORD)
    db.db.close()
    return path


def session(client, name):
    return client.post("/api/login", json={"email": f"{name}@example.test", "password": PASSWORD})


def receive(socket, event, matches=lambda message: True):
    for _ in range(24):
        message = socket.receive_json()
        if message["type"] == event and matches(message):
            return message
    raise AssertionError(f"No {event} message matched")


@pytest.mark.parametrize(("reading", "expected"), [
    (74.9, "DANGER"), (75, "CAUTION"), (150, "CAUTION"), (150.1, "SAFE"),
    (None, "UNKNOWN"), (0, "UNKNOWN"), (-1, "UNKNOWN"), ("100", "UNKNOWN"),
    (float("nan"), "UNKNOWN"), (True, "UNKNOWN"),
])
def test_sensor_thresholds(reading, expected):
    assert classify(reading) == expected


def test_duplicate_assignment_and_access(database):
    with TestClient(app) as client:
        assert client.get("/api/me").status_code == 401
        with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws"):
            pytest.fail("An unauthenticated WebSocket was accepted")
        assert client.post("/api/login", headers={"origin": "https://other.example"},
                           json={"email": "vest@example.test", "password": PASSWORD}).status_code == 403
        cookies = {name: session(client, name).headers["set-cookie"].split(";")[0]
                   for name in ("vest", "first", "second")}
        def connect(name):
            return client.websocket_connect("/ws", headers={"cookie": cookies[name]})
        request_id = str(uuid4())
        with connect("vest") as vest, connect("first") as first, connect("second") as second:
            for helper in (first, second):
                helper.send_json({"type": "availability", "available": True})
                receive(helper, "state", lambda m: m["available"])
            for _ in range(2):
                vest.send_json({"type": "request", "id": request_id})
                assert receive(vest, "ack")["id"] == request_id
            assert len(receive(first, "state", lambda m: m["waiting"])["waiting"]) == 1
            assert len(receive(second, "state", lambda m: m["waiting"])["waiting"]) == 1
            first.send_json({"type": "accept", "id": request_id})
            second.send_json({"type": "accept", "id": request_id})
            receive(first, "state", lambda m: m["request"] and m["request"]["state"] == "connecting")
            assert "no longer available" in receive(second, "error")["message"]
            assert client.get("/api/ice", headers={"cookie": cookies["second"]}).status_code == 403
            second.send_json({"type": "signal", "id": request_id, "signal": {"kind": "ice", "data": {}}})
            assert "access" in receive(second, "error")["message"]
            vest.send_json({"type": "signal", "id": request_id, "signal": {"kind": "offer", "data": {"type": "offer"}}})
            assert receive(first, "signal")["signal"]["kind"] == "offer"
            vest.send_json({"type": "media", "id": request_id, "audio": True, "video": False})
            first.send_json({"type": "media", "id": request_id, "audio": True, "video": True})
            receive(first, "state", lambda m: m["request"] and m["request"]["state"] == "active")
            first.send_json({"type": "end", "id": request_id})
            assert receive(vest, "ended")["request"]["reason"] == "helper_ended"
            assert client.get("/api/ice", headers={"cookie": cookies["first"]}).status_code == 403
            vest.send_json({"type": "request", "id": request_id})
            assert receive(vest, "ack")["state"] == "ended"
            vest.send_json({"type": "signal", "id": request_id, "signal": {"kind": "ice", "data": {}}})
            assert "closed" in receive(vest, "error")["message"]
