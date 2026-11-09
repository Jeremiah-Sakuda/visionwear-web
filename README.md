# VisionWear Web

VisionWear connects a vest wearer with an authorized volunteer. The web prototype includes an availability dashboard, request and call states, one-way live video, two-way audio, and a separate vest test console. FastAPI serves the browser interface and WebSocket signaling. SQLite stores accounts, logins, and requests. WebRTC connects the endpoints directly or through a configured TURN relay.

## Run on one laptop

Use Python 3.12. In the repository root, run:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m app.accounts helper helper@example.test "Demo Helper"
.venv/bin/python -m app.accounts vest vest@example.test VW-001
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The account commands prompt for your chosen passwords. Open [the local website](http://127.0.0.1:8000) in two separate browser profiles or one regular and one private window. Sign in as the helper in one and the vest in the other. Set the helper available, press the vest console's help button, and accept from the dashboard. Allow microphone access on both sides and camera access on the vest side. Use headphones or mute one device's output to avoid feedback on one laptop.

The vest console offers missing-camera and missing-microphone scenarios and simulated sensor readings. For the audio-only case allow up to 10 seconds after acceptance. During a call the helper can mute, resume playback if blocked by the browser, or end the session.

## Run verification

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
.venv/bin/python -m playwright install chromium
VISIONWEAR_BROWSER_TEST=1 .venv/bin/python -m pytest -q
```

An installed Chrome can be selected with `VISIONWEAR_CHROME`. The browser tests use generated camera and microphone inputs, isolated browser profiles, and real WebRTC connections. They exercise the browser stand-in for the vest. For the hardware acceptance runs, use the team Pi and ESP32 and record results separately.

See [deployment](docs/deployment.md) and [software verification](docs/software-verification.md).
