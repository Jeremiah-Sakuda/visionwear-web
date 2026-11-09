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
