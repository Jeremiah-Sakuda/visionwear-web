const paths = {
  pulse: '<path d="M2 12h4l3-7 4 14 3-7h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sliders: '<path d="M4 7h5m4 0h7M4 17h10m4 0h2"/><circle cx="11" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  exit: '<path d="M11 4H5v16h6m-2-8h12m-4-4 4 4-4 4"/>',
  headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v3m-18 0a2 2 0 0 1 2-2h2v7H5a2 2 0 0 1-2-2Zm18 0a2 2 0 0 0-2-2h-2v7h2a2 2 0 0 0 2-2Z"/>',
  signal: '<path d="M2 9a16 16 0 0 1 20 0M5 13a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01"/>',
  phone: '<path d="M20 16v3a2 2 0 0 1-2 2 16 16 0 0 1-15-15 2 2 0 0 1 2-2h3l2 5-2 2a12 12 0 0 0 5 5l2-2Z"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  cameraOff: '<path d="M10 6h4a2 2 0 0 1 2 2v2l5-3v10l-3-2M3 8v8a2 2 0 0 0 2 2h9m-12-16 20 20"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6"/>',
  micOff: '<path d="M9 9v3a3 3 0 0 0 4 3m2-4V5a3 3 0 0 0-5-2m-5 7v2a7 7 0 0 0 12 5m2-5v-2m-7 9v3m-3 0h6M2 2l20 20"/>',
  speaker: '<path d="M3 9v6h4l5 4V5L7 9Zm13 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  device: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M10 16h4m-4-8h4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2m2 6a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2"/>',
};

function icon(name) {
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
));

const mark = `<span class="brand-mark">${icon("pulse")}</span>`;
const brand = `<div class="brand">${mark}<span>VisionWear</span></div>`;

function badge(label, tone = "") {
  return `<span class="pill ${tone}"><span class="dot" aria-hidden="true"></span>${esc(label)}</span>`;
}

function notices(model) {
  return model.notice ? `<div class="notice" role="alert">${icon("alert")}<p>${esc(model.notice)}</p></div>` : "";
}

function heading(eyebrow, title, description, extra = "") {
  return `<header class="page-heading"><div><p class="eyebrow">${eyebrow}</p>
    <h1 tabindex="-1">${esc(title)}</h1><p class="description">${esc(description)}</p></div>${extra}</header>`;
}

function signalArt() {
  return `<svg class="signal-art" aria-hidden="true" viewBox="0 0 512 512" fill="none">
    <circle cx="256" cy="256" r="222"/><circle cx="256" cy="256" r="176"/>
    <circle cx="256" cy="256" r="130"/><circle cx="256" cy="256" r="84"/>
    <path d="M0 256h512M256 0v512"/><circle class="signal-point" cx="256" cy="80" r="6"/>
    <circle class="signal-point" cx="432" cy="256" r="6"/><circle class="signal-point" cx="126" cy="256" r="5"/>
    <path class="signal-wave" d="M200 256h30l15-36 22 72 15-36h30"/>
  </svg>`;
}

function login(model) {
  return `<div class="login-layout">
    <section class="login-art" aria-label="VisionWear">${brand}${signalArt()}
      <div class="login-story"><p class="eyebrow">Remote visual assistance</p>
      <p class="login-display">A clearer view.<br>A human voice.</p>
      <p>VisionWear connects a vest wearer to a volunteer who can see the live view and talk them through what’s ahead.</p></div>
    </section>
    <div class="login-entry"><div class="mobile-brand">${brand}</div><form id="login" class="login-form">
      <p class="eyebrow">Team access</p><h1 tabindex="-1">Sign in to VisionWear</h1>
      <p class="description">Use your assigned volunteer or vest account.</p>
      <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="120">
      <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256">
      <p class="error" id="login-error" role="alert">${esc(model.notice)}</p>
      <button class="primary wide" type="submit">Sign in ${icon("arrow")}</button>
    </form></div></div>`;
}

function header(view, model) {
  const inSession = view === "session";
  const dashboard = view === "dashboard" || view === "device" || view === "result";
  return `<header class="masthead"><div class="masthead-inner">
    ${brand}
    <nav aria-label="Workspace navigation">
      <button data-action="dashboard" ${dashboard ? 'aria-current="page"' : ""} ${inSession ? "disabled" : ""}>${icon("grid")}Dashboard</button>
      ${inSession ? '<span class="current-tab" aria-current="page">Active session</span>' : ""}
      <button data-action="settings" ${view === "settings" ? 'aria-current="page"' : ""} ${inSession ? "disabled" : ""}>${icon("sliders")}Settings</button>
    </nav>
    <div class="account"><span class="account-label">${esc(model.identity.label)}</span>
      <button data-action="logout" class="quiet">${icon("exit")}Sign out</button></div>
  </div></header>`;
}

function dashboard(model) {
  const available = model.online && model.available;
  const status = !model.online ? "Connecting to the service…" : available
    ? "You are available to receive help requests" : "You are currently unavailable";
  const requests = model.waiting.map(request => `<li class="request">
    <span class="tile-icon">${icon("device")}</span>
    <div class="request-meta"><h3>${esc(request.vest_label)}</h3>
      <p>Received <span data-elapsed="${request.created}" data-age></span></p>
    </div>
    ${badge("Vest connected", "good")}
    <button class="primary" data-action="accept" data-id="${esc(request.id)}">Accept request<span class="sr-only"> from ${esc(request.vest_label)}</span>${icon("arrow")}</button>
    </li>`).join("");

  return heading("Volunteer workspace", "Helper dashboard", "Receive help requests and guide a wearer in real time.") +
    notices(model) + `<section class="availability ${available ? "available" : ""}" aria-labelledby="availability-title">
      ${signalArt()}
      <div class="availability-copy">
        ${badge(!model.online ? "Offline" : available ? "Available" : "Unavailable", available ? "good" : "neutral")}
        <h2 id="availability-title">${status}</h2>
        <p>${available ? "New requests will appear in your queue below." : "Set yourself available when you’re ready to take a call."}</p>
      </div>
      <button class="${available ? "light" : "primary"}" data-action="availability" ${model.online ? "" : "disabled"}>${available ? "Set unavailable" : "Set available"}</button>
    </section>
    <div class="workspace-grid">
      <section class="surface queue" aria-labelledby="queue-title">
        <header class="section-heading"><div><p class="eyebrow">Live queue</p><h2 id="queue-title">Incoming help requests</h2></div><span class="count">${model.waiting.length}</span></header>
        ${requests ? `<ul class="request-list">${requests}</ul>` : `<div class="empty"><span class="tile-icon">${icon("headset")}</span><div>
          <h3>${available ? "Waiting for help requests." : "No requests while unavailable."}</h3>
          <p>${available ? "Keep this tab open to receive the next request." : "Your queue will appear when you go available."}</p></div></div>`}
      </section>
      <aside class="surface ready-panel"><span class="tile-icon">${icon("mic")}</span>
        <h2>Before a call</h2><p>Check your microphone and use headphones to avoid feedback.</p>
        <button class="quiet" data-action="settings" data-id="audio">Audio settings ${icon("arrow")}</button>
      </aside>
    </div>`;
}

function device(model, pending) {
  const request = model.request;
  const label = request ? "Request delivered. Waiting for a volunteer." : pending
    ? "Sending request. Waiting for acknowledgment…" : "Ready for a test request.";
  return heading("Device workspace", "Vest test console", "Send help requests and simulate sensor readings.", badge(model.online ? "Device connected" : "Offline", model.online ? "good" : "bad")) +
    notices(model) + `<div class="device-grid"><section class="surface request-panel">
      <div class="section-heading"><div><p class="eyebrow">01 / Assistance</p><h2>Help button</h2></div><span class="tile-icon">${icon("phone")}</span></div>
      <p>${label}</p>
      <label for="scenario">Call scenario</label><select id="scenario" ${request || pending ? "disabled" : ""}>
      ${[["normal","Camera and two-way audio"],["missing-video","Camera unavailable"],["missing-audio","Microphone unavailable"]].map(([value, label]) =>
        `<option value="${value}" ${model.scenario === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
      <div class="actions"><button class="primary" data-action="request" ${!model.online || request || pending ? "disabled" : ""}>${icon("phone")}Press help button</button>
      ${request || pending ? '<button class="secondary" data-action="cancel">Cancel request</button>' : ""}
      ${request ? '<button class="quiet" data-action="retry">Replay request ID</button>' : ""}</div>
    </section>
    <section class="surface sensor-panel">
      <div class="section-heading"><div><p class="eyebrow">02 / Diagnostics</p><h2>Simulated sensor readings</h2></div><span class="tile-icon">${icon("pulse")}</span></div>
      <p class="description">Send a sample to see the warning state that would be used on the vest.</p>
      <form id="sensor">
        <div class="field"><label for="sensor-position">Sensor</label><select id="sensor-position" name="sensor"><option>Front</option><option>Left</option><option>Right</option></select></div>
        <div class="field"><label for="sensor-distance">Distance in cm</label><input id="sensor-distance" name="distance" type="number" step="any" aria-describedby="distance-hint"><small id="distance-hint">Leave blank for UNKNOWN.</small></div>
        <button class="secondary" type="submit" ${model.online ? "" : "disabled"}>Send sample</button>
      </form>
      <ul id="readings" aria-label="Latest sensor readings"></ul>
    </section></div>
    <section class="connection-tools"><div><h2>Connection test</h2><p>Check what the volunteer sees when the vest drops offline.</p></div>
    <button class="secondary" data-action="disconnect" ${model.online ? "" : "disabled"}>${icon("link")}Simulate disconnect</button></section>`;
}

function session(model, call) {
  const request = model.request;
  const isHelper = model.identity.role === "helper";
  const ready = request.state === "active" || request.state === "audio_only";
  const hasVideo = isHelper && request.state === "active";
  const hasMic = !!call?.local.getAudioTracks().length;
  const details = (key, value) => `<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`;
  const phase = !ready ? "Establishing audio and video connection…" :
    request.state === "audio_only" ? "Video unavailable. You can continue speaking." : "Session in progress";
  const headerStatus = `<div class="session-clock">${badge(ready ? "In session" : "Connecting", ready ? "good" : "warn")}
    <span class="timer" data-elapsed="${request.accepted}" aria-label="Session duration"></span></div>`;
  return heading("Assistance session", isHelper ? `User ${request.vest_label}` : "Call with volunteer", phase, headerStatus) + notices(model) +
    `<div class="media-layout"><div class="media-card">
    <div class="media-heading"><span>${icon(isHelper ? "camera" : "headset")}${isHelper ? "Vest camera" : "Volunteer audio"}</span>
    ${hasVideo ? '<span class="pill live"><span class="dot" aria-hidden="true"></span>Live</span>' : ""}</div>
    <section class="stage" aria-label="Call media">
      ${hasVideo ? '<div id="video-mount"></div>' :
      `<div class="stage-message"><span class="tile-icon">${icon(!ready ? "signal" : isHelper ? "cameraOff" : "headset")}</span>
      <h2>${!ready ? "Connecting…" : isHelper ? "Video unavailable" : "Connected to volunteer"}</h2>
      <p>${!ready ? "Waiting for both audio directions." : isHelper ? "Two-way audio is still active." : "Speak through your microphone to reach your helper."}</p></div>`}
    </section>
    <div class="controls">
      <button class="call-button" data-action="mute" aria-pressed="${model.muted}" ${hasMic ? "" : "disabled"}>${icon(model.muted ? "micOff" : "mic")}${model.muted ? "Unmute microphone" : "Mute microphone"}</button>
      <button class="call-button" data-action="play">${icon("speaker")}Play call audio</button>
      <button class="danger" data-action="end">${icon("phone")}End session</button>
    </div></div><aside class="session-side">
    <section class="surface detail-panel"><p class="eyebrow">Live diagnostics</p><h2>Connection status</h2>
      <dl class="readout">${details("Camera", request.state === "active" ? "Online" : request.state === "audio_only" ? "Unavailable" : "Checking")}
      ${details(isHelper ? "Audio from wearer" : "Audio from volunteer", call?.status.audio ? "Receiving" : "Waiting")}
      ${details(isHelper ? "Audio to wearer" : "Audio to volunteer", ready ? (model.muted ? "Muted" : "Connected") : "Checking")}
      ${details("Your microphone", model.muted ? "Muted" : hasMic ? "On" : "Waiting")}</dl>
      ${call?.permissionError ? `<p class="error" role="alert">${esc(call.permissionError)}</p>` : ""}
    </section>
    <section class="surface detail-panel"><h2>Session information</h2><dl class="readout">
      ${details("User ID", request.vest_label)}
      ${details("Request time", new Date(request.created * 1000).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }))}</dl>
      ${isHelper ? "" : '<button class="secondary" data-action="disconnect">Simulate disconnect</button>'}
    </section></aside></div>`;
}

function settings(model) {
  return heading("Workspace preferences", "Settings", "Choose a microphone and check access before a call.") +
    notices(model) + `<section class="surface settings"><span class="tile-icon">${icon("mic")}</span><h2>Audio input</h2>
    <p class="description">Your microphone selection applies to the next session.</p>
    <label for="mic">Microphone</label><select id="mic"><option value="">System default</option>
    ${model.microphones.map((device, index) => `<option value="${esc(device.deviceId)}"
      ${device.deviceId === model.mic ? "selected" : ""}>${esc(device.label || `Microphone ${index + 1}`)}</option>`).join("")}</select>
    <button class="primary" data-action="check-mic">${icon("mic")}Check microphone</button></section>`;
}

function result(outcome) {
  const [title, subtitle] = outcome;
  const ended = title === "Session ended" || title === "Request cancelled";
  return `<section class="surface result">
    <span class="tile-icon ${ended ? "positive" : "negative"}">${icon(ended ? "check" : "alert")}</span>
    <p class="eyebrow">Call outcome</p><h1 tabindex="-1">${esc(title)}</h1><p class="description">${esc(subtitle)}</p>
    <button class="primary" data-action="dashboard" data-id="outcome">${icon("back")}Return to dashboard</button>
  </section>`;
}

export function viewMarkup(view, model, { call, pending, outcome }) {
  if (view === "login") return login(model);
  const content = {
    dashboard: () => dashboard(model),
    device: () => device(model, pending),
    session: () => session(model, call),
    settings: () => settings(model),
    result: () => result(outcome),
  };
  return `${header(view, model)}<div class="workspace workspace--${view}">${content[view]()}</div>`;
}
