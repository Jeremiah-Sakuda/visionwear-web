import asyncio
import json
import math
import os
import sqlite3
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .store import PAIRED, Store

STATIC = Path(__file__).with_name("static")
COOKIE = "visionwear_session"


def classify(distance):
    if type(distance) not in (int, float) or not math.isfinite(distance) or distance <= 0:
        return "UNKNOWN"
    if distance < 75:
        return "DANGER"
    return "CAUTION" if distance <= 150 else "SAFE"


def same_origin(headers):
    origin = headers.get("origin")
    expected = os.getenv("VISIONWEAR_ORIGIN")
    if origin is None:
        return True
    if expected:
        return origin == expected.rstrip("/")
    parsed = urlsplit(origin)
    return parsed.scheme in ("http", "https") and parsed.netloc == headers.get("host")


@dataclass
class Peer:
    identity: dict
    token: str
    last_seen: float = field(default_factory=time.monotonic)
    available: bool = False
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=256))

    @property
    def id(self):
        return self.identity["id"]

    def send(self, message):
        if self.queue.full():
            while not self.queue.empty():
                self.queue.get_nowait()
            self.queue.put_nowait(None)
            return
        self.queue.put_nowait(message)


class Coordinator:
    def __init__(self, store):
        self.store = store
        self.peers = {}
        self.media = {}
        self.sensors = {}

    def snapshot(self, peer):
        request = self.store.current(peer.identity)
        waiting = []
        if peer.available and not request:
            waiting = [r for r in self.store.pending() if r["vest"] in self.peers]
        peer.send({"type": "state", "available": peer.available, "request": request, "waiting": waiting})

    def publish(self):
        for peer in self.peers.values():
            self.snapshot(peer)

    def end(self, request, reason):
        ended = self.store.end(request["id"], reason)
        if ended:
            self.media.pop(ended["id"], None)
            for name in (ended["helper"], ended["vest"]):
                if name in self.peers:
                    self.peers[name].send({"type": "ended", "request": ended})
            self.publish()

    def remove(self, peer):
        if self.peers.get(peer.id) is not peer:
            return
        self.peers.pop(peer.id)
        self.sensors.pop(peer.id, None)
        request = self.store.current(peer.identity)
        if request:
            reason = "device_disconnected" if peer.identity["role"] == "vest" else "helper_disconnected"
            self.end(request, reason)
        self.publish()
        peer.send(None)

    def update_media(self, request, peer, message):
        if type(message.get("audio")) is not bool or type(message.get("video")) is not bool:
            raise ValueError("Media readiness requires audio and video flags.")
        state = self.media.setdefault(request["id"], {})
        state[peer.id] = (message["audio"], message["video"])
        audio = all(state.get(account, (False, False))[0] for account in (request["vest"], request["helper"]))
        video = state.get(request["helper"], (False, False))[1]
        if audio and (video or request["state"] != "connecting"):
            self.store.set_media(request["id"], "active" if video else "audio_only")
            self.publish()
        elif request["state"] != "connecting":
            self.end(request, "audio_lost")

    def handle(self, peer, message):
        if not isinstance(message, dict):
            raise ValueError("Expected a message object.")
        event = message.get("type")
        role = peer.identity["role"]
        if event == "heartbeat":
            peer.last_seen = time.monotonic()
            peer.send({"type": "heartbeat"})
            return
        if event == "availability" and role == "helper":
            if type(message.get("available")) is not bool:
                raise ValueError("Availability must be a boolean.")
            peer.available = message["available"]
            self.publish()
            return
        if event == "sensor" and role == "vest":
            sensor = message.get("sensor")
            if not isinstance(sensor, str) or not 1 <= len(sensor) <= 40:
                raise ValueError("Expected a sensor identifier.")
            readings = self.sensors.setdefault(peer.id, {})
            if sensor not in readings and len(readings) >= 16:
                raise ValueError("Sensor limit reached.")
            distance = message.get("distance")
            state = classify(distance)
            value = distance if state != "UNKNOWN" else None
            readings[sensor] = (time.monotonic(), state)
            peer.send({"type": "sensor_state", "sensor": sensor, "state": state, "distance": value})
            return
        raw_id = message.get("id")
        if not isinstance(raw_id, str) or len(raw_id) != 36:
            raise ValueError("Expected a UUID request ID.")
        request_id = str(UUID(raw_id))
        request = self.store.request(request_id)
        if event == "request" and role == "vest":
            if request and request["vest"] != peer.id:
                raise ValueError("Request ID is already in use.")
            if not request:
                if self.store.current(peer.identity):
                    raise ValueError("The vest already has an open request.")
                request = self.store.create(request_id, peer.id)
            peer.send({"type": "ack", "id": request_id, "state": request["state"]})
            self.publish()
            return
        if event == "accept" and role == "helper":
            if not peer.available or self.store.current(peer.identity):
                raise ValueError("Set your status to Available before accepting.")
            if not request or request["vest"] not in self.peers or not self.store.accept(request_id, peer.id):
                raise ValueError("This request is no longer available.")
            self.publish()
            return
        if not request or peer.id not in (request["vest"], request["helper"]):
            raise ValueError("You do not have access to this request.")
        if event == "end":
            self.end(request, "cancelled" if request["state"] == "waiting"
                     else "wearer_ended" if role == "vest" else "helper_ended")
            return
        if request["state"] not in PAIRED:
            raise ValueError("This session is closed.")
        if event == "signal":
            signal = message.get("signal")
            if not isinstance(signal, dict) or signal.get("kind") not in ("offer", "answer", "ice"):
                raise ValueError("Invalid media signal.")
            if (signal["kind"] == "offer" and role != "vest") or (signal["kind"] == "answer" and role != "helper"):
                raise ValueError("Invalid signaling direction.")
            json.dumps(signal, allow_nan=False)
            other = request["helper"] if role == "vest" else request["vest"]
            if other in self.peers:
                self.peers[other].send({"type": "signal", "id": request_id, "signal": signal})
        elif event == "media":
            self.update_media(request, peer, message)
        else:
            raise ValueError("Unsupported event.")

    async def sweep(self):
        while True:
            await asyncio.sleep(0.2)
            monotonic = time.monotonic()
            for peer in list(self.peers.values()):
                if monotonic - peer.last_seen >= 6 or not self.store.identity(peer.token):
                    self.remove(peer)
            for request in self.store.open_requests():
                now = time.time()
                if request["state"] == "waiting" and now - request["created"] >= 60:
                    self.end(request, "no_volunteer")
                if request["state"] == "connecting" and now - request["accepted"] >= 10:
                    flags = self.media.get(request["id"], {})
                    if all(flags.get(name, (False, False))[0] for name in (request["vest"], request["helper"])):
                        self.store.set_media(request["id"], "audio_only")
                        self.publish()
                    else:
                        self.end(request, "connection_failed")
            for name, readings in self.sensors.items():
                for sensor, (received, state) in list(readings.items()):
                    if state != "UNKNOWN" and monotonic - received >= 3:
                        readings[sensor] = (received, "UNKNOWN")
                        self.peers[name].send({"type": "sensor_state", "sensor": sensor,
                                               "state": "UNKNOWN", "distance": None, "stale": True})


def database_path():
    return os.getenv("VISIONWEAR_DB", "data/visionwear.sqlite")


@asynccontextmanager
async def lifespan(app):
    store = Store(database_path())
    for request in store.open_requests():
        store.end(request["id"], "server_restarted")
    app.state.coordinator = Coordinator(store)
    app.state.login_attempts = {}
    task = asyncio.create_task(app.state.coordinator.sweep())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        store.db.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self)"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; connect-src 'self'; img-src 'self' data:; "
        "media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'"
    )
    return response


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


@app.get("/health")
async def health():
    return {"status": "ok"}


def identify(request):
    return request.app.state.coordinator.store.identity(request.cookies.get(COOKIE))


class Login(BaseModel):
    email: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=256)


@app.post("/api/login")
async def login(request: Request, payload: Login, response: Response):
    if not same_origin(request.headers):
        raise HTTPException(403, "Origin denied.")
    attempts = request.app.state.login_attempts
    now = time.monotonic()
    for address, (_, reset) in list(attempts.items()):
        if reset <= now:
            attempts.pop(address)
    address = request.client.host
    count, reset = attempts.get(address, (0, now + 60))
    if count >= 20 or (address not in attempts and len(attempts) >= 4096):
        raise HTTPException(429, "Too many sign-in attempts. Try again in a minute.")
    attempts[address] = (count + 1, reset)
    store = request.app.state.coordinator.store
    token = store.login(payload.email.strip().lower(), payload.password)
    if not token:
        raise HTTPException(401, "Email or password is incorrect.")
    secure = os.getenv("VISIONWEAR_SECURE_COOKIE") == "1" or request.url.scheme == "https"
    response.set_cookie(COOKIE, token, httponly=True, secure=secure, samesite="strict", max_age=8 * 3600)
    return store.identity(token)


@app.get("/api/me")
async def me(request: Request):
    identity = identify(request)
    if not identity:
        raise HTTPException(401, "Sign in to continue.")
    return identity


@app.get("/api/ice")
async def ice(request: Request):
    identity = identify(request)
    if not identity:
        raise HTTPException(401, "Sign in to continue.")
    coordinator = request.app.state.coordinator
    active = coordinator.store.current(identity)
    if not active or active["state"] not in PAIRED:
        raise HTTPException(403, "Join an assigned session first.")
    servers = json.loads(os.getenv("VISIONWEAR_ICE_SERVERS", "[]"))
    return {"iceServers": servers}


@app.post("/api/logout")
async def logout(request: Request, response: Response):
    if not same_origin(request.headers):
        raise HTTPException(403, "Origin denied.")
    token = request.cookies.get(COOKIE)
    coordinator = request.app.state.coordinator
    identity = coordinator.store.identity(token)
    coordinator.store.logout(token)
    peer = coordinator.peers.get(identity["id"]) if identity else None
    if peer and peer.token == token:
        coordinator.remove(peer)
    response.delete_cookie(COOKIE)
    return {"ok": True}


async def transmit(websocket, peer):
    while (message := await peer.queue.get()) is not None:
        await asyncio.wait_for(websocket.send_json(message), timeout=3)
    await websocket.close(code=4001)


@app.websocket("/ws")
async def events(websocket: WebSocket):
    coordinator = websocket.app.state.coordinator
    token = websocket.cookies.get(COOKIE)
    identity = coordinator.store.identity(token)
    if not identity or not same_origin(websocket.headers):
        await websocket.close(code=4401)
        return
    if identity["id"] in coordinator.peers:
        await websocket.accept()
        await websocket.close(code=4409)
        return
    peer = Peer(identity, token)
    coordinator.peers[peer.id] = peer
    try:
        await websocket.accept()
        coordinator.publish()
        async with asyncio.TaskGroup() as group:
            sender = group.create_task(transmit(websocket, peer))
            try:
                while coordinator.peers.get(peer.id) is peer:
                    raw = await websocket.receive_text()
                    if coordinator.peers.get(peer.id) is not peer or len(raw) > 65536:
                        break
                    try:
                        coordinator.handle(peer, json.loads(raw))
                    except (ValueError, OverflowError, sqlite3.IntegrityError) as error:
                        peer.send({"type": "error", "message": str(error)})
            except WebSocketDisconnect:
                pass
            finally:
                sender.cancel()
    except* (WebSocketDisconnect, TimeoutError, RuntimeError):
        pass
    finally:
        coordinator.remove(peer)
