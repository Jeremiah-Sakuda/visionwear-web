# Hosting VisionWear

For a one-laptop demonstration, use the localhost instructions in the README. A second physical device can use a single HTTPS origin on an existing lab server or laptop with a reverse proxy and a certificate its browsers trust. Bind the application privately behind that proxy, forward WebSocket upgrades, and provide a writable directory for the SQLite database. A Pi browser using the camera and microphone needs a secure origin, so use HTTPS for physical devices that connect over the network.

## Recommended hosted setup

Use one Render Python web service with a paid persistent disk for a hosted demo where the vest can connect at any time. Sign in to Render through GitHub and authorize the private repository. Run one app instance and one Uvicorn worker because connected peers are tracked in memory. The Render service terminates HTTPS and serves both the browser interface and WebSocket connection.

| Setting | Value |
| --- | --- |
| Git branch | `main` |
| Runtime | Python 3.12 |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --ws-max-size 65536` |
| Health check | `/health` |
| Persistent disk | Mount at `/var/data` |
| `VISIONWEAR_DB` | `/var/data/visionwear.sqlite` |
| `VISIONWEAR_ORIGIN` | The assigned HTTPS origin, with no path |
| `VISIONWEAR_SECURE_COOKIE` | `1` |
| `VISIONWEAR_ICE_SERVERS` | JSON array of browser ICE server configurations |

Create one account per helper or test vest from the service shell using `python -m app.accounts`. Set passwords interactively and keep relay credentials in hosting secrets. With no ICE configuration, the same-machine demo uses direct local candidates. For the Pi on a phone hotspot and a helper on a separate network, configure and verify a TURN relay. Choose a relay the team can access, and use scoped credentials. Confirm a relay path in the browser's WebRTC diagnostics under a forced relay test. Media traffic goes through the peer connection or TURN service.

After deployment, verify the health endpoint, account persistence across a restart, protected WebSocket access, and a real request from the Pi on the hotspot. Disable automatic deploys or schedule them around demonstrations if a deploy would interrupt a test call. Keep the app authenticated when using a public HTTPS URL.

Render's free service is suitable for a disposable preview. Idle startup and loss of SQLite files on restart affect the vest acknowledgment target and account persistence. Vercel's WebSocket beta pins a connection to a function for its maximum duration. Using it with this app would require shared durable coordination and storage across function instances.

Sources: [Render login via GitHub](https://render.com/docs/git-provider), [Render WebSockets](https://render.com/docs/websocket), [Render persistent disks](https://render.com/docs/disks), [Render free services](https://render.com/docs/free), and [Vercel WebSockets](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).
