# VisionWear software verification

The volunteer and device sign in separately. The server owns request assignment and session state. Each device sends one stable request ID per button event. The server acknowledges the ID and presents the request to available volunteers. An atomic update assigns one volunteer. The assigned pair exchanges WebRTC signaling after acceptance. Media stays between the peers or their configured TURN relay.

The server returns distinct outcomes for delivery, assignment, readiness, and termination. The volunteer interface has signed out, available, unavailable, connecting, audio/video, audio-only, disconnected, and failed states. The device test console can replay sensor readings and simulate unavailable video or audio. Local obstacle control belongs to the ESP32.

| Check | Acceptance target | Evidence |
| --- | --- | --- |
| Notification | p95 ≤ 2 s and 99/100 displayed within 5 s in connected trials | Timestamp press, server receipt, and rendered request across synchronized clients |
| Acknowledgment and availability | Delivery deadline 5 s; volunteer wait 60 s | Separate timeout scenarios and device messages |
| Assignment | One winner per request; retries reuse the same ID | Competing helper requests and duplicate replay |
| Media readiness | Both audio directions and video within 10 s of acceptance; audio-only if video fails | Peer observations and first media timestamps |
| Loss and cleanup | 2 s heartbeats; stale peer detected within 6 s of last heartbeat | Forced network failure, endpoint closure, and access checks |
| Browser usability | Keyboard operation, visible focus and announced statuses | Desktop Chrome, Safari, Firefox and Edge matrix |
| Sensor states | 75 and 150 cm in CAUTION; invalid and stale data UNKNOWN | Boundary and stale-input fixtures |

Physical integration remains a distinct verification stage. Ian's notes identify Garmin LIDAR-Lite as the leading forward sensor and show a motor that did not activate in bench trials. Pending device checks include driver voltage and wiring, physical vibration, sensor-to-motor behavior, distance accuracy and target coverage, portable power, and full Pi/hotspot integration. Device diagnostics distinguish intended haptic classification from physical response. The 75/150 cm thresholds are bench thresholds.

## Protocol

The browser signs in at `POST /api/login` and opens `/ws` with the resulting HTTP-only session cookie. The authenticated account determines role and device identity. The device generates a UUID on each distinct press and retries that ID until it receives the `ack` event. The server publishes only the queue or session view that account can access.

| Client event | Sender | Fields and effect |
| --- | --- | --- |
| `heartbeat` | Both | Send every 2 s while connected |
| `availability` | Helper | Boolean `available` controls eligibility for new requests |
| `request` | Vest | UUID `id`; retries return existing state |
| `accept` | Helper | UUID `id`; SQLite assigns a waiting request once |
| `end` | Either | UUID `id`; cancels a pending request or ends an assigned session |
| `signal` | Assigned pair | UUID `id`; `signal` has `kind` and `data` for offer, answer, or ICE |
| `media` | Assigned pair | UUID `id`; boolean `audio` and `video` from received media |
| `sensor` | Vest | Short `sensor` ID and numeric `distance` in cm or null |

Server events include `state`, `ack`, `signal`, `sensor_state`, `ended`, `heartbeat`, and `error`. The vest initiates the WebRTC offer. For the prototype, a reported sensor sample expires after 3 s. The browser observes arriving audio packets and decoded video frames. Both peers must receive audio before the service reports a working session. The helper can keep speaking if video is lost. If required audio is lost during the call, both peers receive the end event and close their media tracks.

## Physical device verification backlog

| Area | Pending evidence |
| --- | --- |
| Driver and motor | Secure the thin motor leads, verify control and output voltage, then show repeatable physical motor activation |
| Haptic patterns | Verify no vibration for SAFE, slow for CAUTION, fast for DANGER, and a distinct UNKNOWN pattern; measure sensing-to-vibration timing |
| Sensor–motor integration | Pair each sensor and motor with the intended vest location, verify direction mapping and combined behavior |
| Ranging and coverage | Compare against reference distances; test glass, mirrors, clothing, low obstacles, mounting angles and walking speeds; evaluate a peripheral sensor alongside the directional Garmin |
| Power | Measure sensor and motor current together, select a portable source and verify operating time with the assembled prototype |
| Pi and hotspot | Connect Neev's endpoint to the web request/signaling protocol, verify the physical help button, test real camera/audio on the hotspot and verify TURN on separate networks |
| System qualification | Run the notification and timeout sampling plan, desktop browser matrix, accessibility review and authorized session cleanup on the target deployment |

Record firmware and app versions, equipment, conditions, raw observations and pass/fail criteria. The web console exposes warning classification only. Ian's motor circuit and Neev's component A/V setup have separate evidence records.
