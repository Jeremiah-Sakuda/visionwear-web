import { Call } from "./media.js";

const main = document.querySelector("#main");
const live = document.querySelector("#announcement");
const brand = '<div class="brand"><span>Vision</span>Wear</div>';
const video = document.createElement("video");
video.autoplay = video.playsInline = video.muted = true;
video.setAttribute("aria-label", "Live video from the vest");
const audio = document.createElement("audio");
audio.autoplay = true;
document.body.append(audio);

const model = {
  identity: null, online: false, available: false, waiting: [], request: null,
  result: null, page: "dashboard", notice: "", scenario: "normal", readings: new Map(),
  microphones: [], mic: localStorage.getItem("visionwear-microphone") || "", muted: false,
};
let socket, reconnect, heartbeat, lastReply, call, pending, retry, streamWithVideo, streamWithAudio;
let signaling = Promise.resolve();
let previousView;

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
));
const badge = (label, tone = "") => `<span class="pill ${tone}">${esc(label)}</span>`;
const helper = () => model.identity?.role === "helper";
const inCall = () => model.request && model.request.state !== "waiting";
const announce = message => { live.textContent = message; };
const notices = () => model.notice ? `<p class="toast" role="alert">${esc(model.notice)}</p>` : "";

const outcomes = {
  cancelled: ["Request cancelled", "The wearer cancelled the request."],
  no_volunteer: ["No volunteer available", "Nobody accepted before the request expired. You can send a new request."],
  connection_failed: ["Connection failed", "Two-way audio could not be established. The session has ended."],
  audio_lost: ["Connection failed", "Two-way audio was interrupted. The session has ended."],
  device_disconnected: ["User disconnected", "The connection to the VisionWear device was lost. This session has ended."],
  helper_disconnected: ["Volunteer disconnected", "The volunteer connection was lost. This session has ended."],
  wearer_ended: ["Session ended", "The wearer ended the session."],
  helper_ended: ["Session ended", "The volunteer ended the session."],
  server_restarted: ["Connection interrupted", "The service restarted. Return to the dashboard to continue."],
  delivery_failed: ["Request delivery failed", "The server did not acknowledge the request within five seconds."],
};

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The request could not be completed.");
  return data;
}

function send(event) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(event));
  return true;
}

function openSocket() {
  clearTimeout(reconnect);
  if (!model.identity) return;
  const peer = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket = peer;
  peer.onopen = () => {
    lastReply = performance.now();
    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (performance.now() - lastReply > 6500) peer.close();
      else send({ type: "heartbeat" });
    }, 2000);
    send({ type: "heartbeat" });
  };
  peer.onmessage = ({ data }) => {
    lastReply = performance.now();
    const event = JSON.parse(data);
    switch (event.type) {
      case "state": {
        model.online = true;
        model.available = event.available;
        const oldCount = model.waiting.length;
        const oldState = model.request?.state;
        model.waiting = event.waiting;
        model.request = event.request;
        if (helper() && event.waiting.length > oldCount) announce("New help request.");
        if (oldState !== event.request?.state && event.request?.state === "audio_only") {
          announce("Video unavailable. Two-way audio is active.");
        }
        if (inCall() && call?.id !== event.request.id) startCall(event.request.id);
        if (!inCall()) stopCall();
        render();
        break;
      }
      case "signal":
        if (call?.id === event.id) {
          const current = call;
          signaling = signaling.then(() => current.receive(event.signal)).catch(error => {
            if (!current.closed) {
              model.notice = `Media negotiation failed: ${error.name}`;
              render();
            }
          });
        }
        break;
      case "ack":
        if (event.id === pending?.id) {
          clearPending();
          announce("Help request delivered.");
          render();
        }
        break;
      case "ended":
        stopCall();
        clearPending();
        model.request = null;
        model.result = event.request.reason;
        model.page = "dashboard";
        model.notice = "";
        render();
        break;
      case "sensor_state":
        model.readings.set(event.sensor, event);
        updateReadings();
        break;
      case "error":
        model.notice = event.message;
        render();
        break;
    }
  };
  peer.onclose = async ({ code }) => {
    if (socket !== peer) return;
    clearInterval(heartbeat);
    const wasPaired = inCall();
    model.online = false;
    model.available = false;
    model.request = null;
    model.waiting = [];
    model.readings.clear();
    stopCall();
    if (wasPaired) model.result = "server_restarted";
    if (code === 4409) {
      model.notice = "This account already has an open tab. Close it and reload to connect here.";
      render();
      return;
    }
    render();
    try {
      await api("/api/me");
      if (socket === peer) reconnect = setTimeout(openSocket, 1500);
    } catch {
      if (socket !== peer) return;
      model.identity = null;
      model.notice = "Sign in to reconnect.";
      render();
    }
  };
}

function startCall(id) {
  stopCall();
  const current = new Call(id, model.identity.role, send, () => {
    if (call === current) render();
  });
  call = current;
  model.result = null;
  model.page = "dashboard";
  signaling = api("/api/ice").then(ice => {
    if (!current.closed) return current.prepare(ice, { scenario: model.scenario, mic: model.mic });
  }).catch(error => {
    if (!current.closed) {
      model.notice = error.message;
      render();
    }
  });
}

function stopCall() {
  if (!call) return;
  call.close();
  call = null;
  model.muted = false;
  audio.srcObject = null;
  video.srcObject = null;
  streamWithAudio = streamWithVideo = null;
}

function clearPending() {
  clearInterval(retry);
  pending = null;
}

function newRequest() {
  if (pending || model.request || !model.online) return;
  pending = { id: crypto.randomUUID(), started: performance.now() };
  const sendRequest = () => send({ type: "request", id: pending.id });
  sendRequest();
  retry = setInterval(() => {
    if (performance.now() - pending.started >= 5000) {
      send({ type: "end", id: pending.id });
      clearPending();
      model.result = "delivery_failed";
      render();
    } else {
      sendRequest();
    }
  }, 1000);
  render();
}

function showLogin() {
  main.innerHTML = `<div class="login"><header>${brand}</header><div class="center">
    <form id="login">
      <p class="kicker">Volunteer assistance</p><h1 tabindex="-1">Welcome, Helper</h1>
      <p class="muted">Sign in with your assigned VisionWear account.</p>
      <label>Email<input name="email" type="email" autocomplete="username" required maxlength="120"></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
      <p class="error" id="login-error" role="alert">${esc(model.notice)}</p>
      <button class="primary" type="submit">Sign in</button>
    </form></div></div>`;
}

function topbar(title, subtitle) {
  const status = !model.online ? badge("Offline", "bad") : inCall() ? badge("In session", "good")
    : helper() ? badge(model.available ? "Available" : "Unavailable", model.available ? "good" : "bad")
      : badge("Device connected", "good");
  return `<header class="topbar"><div><p class="kicker">VisionWear assistance</p>
    <h1 tabindex="-1">${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div>
    <div class="actions">${status}<span>${esc(model.identity.label)}</span><button data-action="logout">Sign out</button></div></header>`;
}

function dashboard() {
  const available = model.online && model.available;
  const message = !model.online ? "Connecting to the service…" : available
    ? "You are available to receive help requests" : "You are currently unavailable";
  const requests = model.waiting.map(request => `
    <article class="request"><div class="identity"><span class="avatar" aria-hidden="true">VW</span><div>
    <h3>${esc(request.vest_label)}</h3><small>Received <span data-elapsed="${request.created}" data-age></span></small></div></div>
    <div class="actions">${badge("Vest connected", "good")}
    <button class="primary" data-action="accept" data-id="${esc(request.id)}">Accept request<span class="sr-only"> from ${esc(request.vest_label)}</span></button></div></article>`).join("");
  return topbar("Helper dashboard", "Assist VisionWear users in real time.") +
    notices() + `<div class="banner ${available ? "" : "bad"}"><strong>${message}</strong>
    <p>${available ? "When a wearer requests assistance, it will appear here." : "Set your status to Available when you’re ready to assist."}</p>
    <div><button data-action="availability" ${model.online ? "" : "disabled"}>${available ? "Set unavailable" : "Set available"}</button></div></div>
    <div class="section-head"><h2>Incoming help requests</h2>${badge(model.waiting.length)}</div>
    ${requests || `<p class="panel empty">${available ? "Waiting for help requests." : "No requests while unavailable."}</p>`}`;
}

function device() {
  const request = model.request;
  const label = request ? "Request delivered. Waiting for a volunteer." : pending
    ? "Sending request. Waiting for acknowledgment…" : "Ready for a test request.";
  return topbar("Vest test console", "Device-side browser endpoint and sensor simulator.") + notices() +
    `<div class="device-grid"><section class="panel device-panel">
    <h2>Help button</h2><p>${label}</p>
    <label>Call scenario<select id="scenario" ${request || pending ? "disabled" : ""}>
      ${[["normal","Camera and two-way audio"],["missing-video","Camera unavailable"],["missing-audio","Microphone unavailable"]].map(([value, label]) =>
        `<option value="${value}" ${model.scenario === value ? "selected" : ""}>${label}</option>`).join("")}
    </select></label>
    <div class="actions"><button class="primary" data-action="request" ${!model.online || request || pending ? "disabled" : ""}>Press help button</button>
    ${request || pending ? '<button data-action="cancel">Cancel request</button>' : ""}
    ${request ? '<button data-action="retry">Replay request ID</button>' : ""}
    </div></section>
    <section class="panel device-panel"><h2>Simulated sensor readings</h2>
    <p class="muted">Diagnostics show the intended warning state. Physical vibration is verified on the vest.</p>
    <form id="sensor">
    <label>Sensor<select name="sensor"><option>Front</option><option>Left</option><option>Right</option></select></label>
    <label>Distance in cm<input name="distance" type="number" step="any" placeholder="Leave blank for UNKNOWN"></label>
    <button type="submit">Send sample</button></form>
    <ul id="readings"></ul></section></div>
    <button data-action="disconnect" ${model.online ? "" : "disabled"}>Simulate disconnect</button>`;
}

function session() {
  const request = model.request;
  const ready = request.state === "active" || request.state === "audio_only";
  const hasVideo = helper() && request.state === "active";
  const hasMic = !!call?.local.getAudioTracks().length;
  const details = (key, value) => `<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`;
  const phase = request.state === "connecting" ? "Establishing audio and video connection…" :
    request.state === "audio_only" ? "Video unavailable. You can continue speaking." : "Session in progress";
  return topbar(`User ${request.vest_label}`, phase) + notices() +
    `<div class="media-layout"><div><section class="stage" aria-label="Call media">
    ${hasVideo ? '<div id="video-mount"></div><span class="pill live">● Live</span>' :
    `<div class="stage-message"><h2>${!ready ? "Connecting…" :
      helper() ? "Video unavailable" : "Connected to volunteer"}</h2>
    <p>${!ready ? "Waiting for both audio directions." :
      helper() ? "Two-way audio is still active." : "Use the microphone to speak with your helper."}</p></div>`}
    </section><div class="controls">
    <button data-action="mute" aria-pressed="${model.muted}" ${hasMic ? "" : "disabled"}>${model.muted ? "Unmute microphone" : "Mute microphone"}</button>
    <button data-action="play">Play call audio</button>
    <button class="danger" data-action="end">End session</button></div>
    ${!helper() ? '<button data-action="disconnect">Simulate disconnect</button>' : ""}
    </div><aside><section class="panel"><h2>Connection status</h2>
    <dl class="readout">${details("Camera", request.state === "active" ? "Online" : request.state === "audio_only" ? "Unavailable" : "Checking")}
    ${details(helper() ? "Audio from wearer" : "Audio from volunteer", call?.status.audio ? "Receiving" : "Waiting")}
    ${details(helper() ? "Audio to wearer" : "Audio to volunteer", ready ? (model.muted ? "Muted" : "Connected") : "Checking")}
    ${details("Your microphone", model.muted ? "Muted" : hasMic ? "On" : "Waiting")}
    </dl>${call?.permissionError ? `<p class="error" role="alert">${esc(call.permissionError)}</p>` : ""}</section>
    <section class="panel"><h2>Session information</h2><dl class="readout">
    ${details("User ID", request.vest_label)}
    <div><dt>Duration</dt><dd data-elapsed="${request.accepted}"></dd></div>
    ${details("Request time", new Date(request.created * 1000).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }))}
    </dl></section></aside></div>`;
}

function settings() {
  return topbar("Settings", "Set up your microphone before accepting a call.") +
    notices() + `<section class="panel settings"><h2>Audio input</h2>
    <p>Check microphone access and choose a device for the next session.</p>
    <label>Microphone<select id="mic"><option value="">System default</option>
    ${model.microphones.map((device, index) => `<option value="${esc(device.deviceId)}"
      ${device.deviceId === model.mic ? "selected" : ""}>${esc(device.label || `Microphone ${index + 1}`)}</option>`).join("")}
    </select></label><button data-action="check-mic">Check microphone</button>
    </section>`;
}

function result() {
  const [title, subtitle] = outcomes[model.result] || outcomes.server_restarted;
  return `<section class="panel result"><p class="kicker">VisionWear assistance</p>
    <h1 tabindex="-1">${title}</h1><p>${subtitle}</p>
    <button class="primary" data-action="dashboard">Return to dashboard</button></section>`;
}

function render() {
  const focused = document.activeElement;
  const focusKey = focused?.dataset.action;
  const focusId = focused?.dataset.id;
  const view = !model.identity ? "login" : model.result ? "result" :
    inCall() ? "session" : model.page === "settings" ? "settings" : helper() ? "dashboard" : "device";
  if (view === "login") {
    if (previousView !== view) showLogin();
  } else {
    const isDashboard = ["dashboard", "device", "result"].includes(view);
    main.innerHTML = `<div class="shell"><aside class="sidebar">${brand}<nav aria-label="Main navigation">
      <button data-action="dashboard" ${isDashboard ? 'aria-current="page"' : ""} ${view === "session" ? "disabled" : ""}>Dashboard</button>
      ${view === "session" ? '<button aria-current="page">Active session</button>' : ""}
      <button data-action="settings" ${view === "settings" ? 'aria-current="page"' : ""} ${inCall() ? "disabled" : ""}>Settings</button>
      </nav></aside><div class="content">${({ dashboard, device, session, settings, result }[view])()}</div></div>`;
  }
  if (previousView !== view) main.querySelector("h1")?.focus();
  else if (focusKey) [...main.querySelectorAll("button[data-action]")].find(
    button => button.dataset.action === focusKey && button.dataset.id === focusId)?.focus();
  previousView = view;
  updateReadings();
  tick();
  if (call && view === "session") {
    const track = call.remote.getAudioTracks()[0];
    if (track && streamWithAudio !== track) {
      streamWithAudio = track;
      audio.srcObject = new MediaStream([track]);
      audio.play().catch(() => {});
    }
    const mount = document.querySelector("#video-mount");
    if (mount) {
      const track = call.remote.getVideoTracks()[0];
      if (track && streamWithVideo !== track) {
        streamWithVideo = track;
        video.srcObject = new MediaStream([track]);
      }
      mount.replaceWith(video);
      video.play().catch(() => {});
    }
  }
}

function tick() {
  for (const timer of main.querySelectorAll("[data-elapsed]")) {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(timer.dataset.elapsed)));
    timer.textContent = timer.hasAttribute("data-age")
      ? `${seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m"} ago`
      : [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
  }
}

function updateReadings() {
  const list = document.querySelector("#readings");
  if (!list) return;
  list.replaceChildren(...Array.from(model.readings.values(), entry => {
    const item = document.createElement("li");
    item.textContent = `${entry.sensor}: ${entry.state}${entry.distance == null ? "" : ` · ${entry.distance} cm`}${entry.stale ? " · stale" : ""}`;
    return item;
  }));
}

async function checkMic() {
  try {
    if (!navigator.mediaDevices) throw new Error("Microphone access requires HTTPS or localhost.");
    const audio = model.mic ? { deviceId: { exact: model.mic } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    try {
      model.microphones = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
      model.notice = "Microphone opened successfully.";
    } finally {
      stream.getTracks().forEach(track => track.stop());
    }
  } catch (error) {
    model.notice = `Microphone check failed: ${error.message}`;
  }
  render();
}

main.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (form.id === "sensor") {
    const distance = data.get("distance");
    send({ type: "sensor", sensor: data.get("sensor"), distance: distance === "" ? null : Number(distance) });
  }
  if (form.id === "login") {
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      model.identity = await api("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      model.notice = "";
      openSocket();
      render();
    } catch (error) {
      document.querySelector("#login-error").textContent = error.message;
      button.disabled = false;
    }
  }
});

main.addEventListener("change", event => {
  if (event.target.id === "scenario") model.scenario = event.target.value;
  if (event.target.id === "mic") {
    model.mic = event.target.value;
    localStorage.setItem("visionwear-microphone", model.mic);
  }
});

main.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "availability":
      model.notice = "";
      send({ type: "availability", available: !model.available });
      break;
    case "accept":
      model.notice = "";
      button.disabled = true;
      send({ type: "accept", id: button.dataset.id });
      break;
    case "dashboard":
      model.result = null;
      model.notice = "";
      model.page = "dashboard";
      render();
      break;
    case "settings":
      model.page = "settings";
      model.notice = "";
      render();
      break;
    case "request":
      newRequest();
      break;
    case "retry":
      send({ type: "request", id: model.request.id });
      break;
    case "cancel":
    case "end": {
      const id = model.request?.id || pending?.id;
      if (id) send({ type: "end", id });
      clearPending();
      break;
    }
    case "mute":
      model.muted = call?.mute() || false;
      render();
      break;
    case "play":
      audio.play().catch(() => {
        model.notice = "Audio playback is unavailable. Check the connection and try again.";
        render();
      });
      break;
    case "check-mic":
      button.disabled = true;
      await checkMic();
      break;
    case "disconnect":
      socket?.close();
      break;
    case "logout":
      try {
        await api("/api/logout", { method: "POST" });
        clearTimeout(reconnect);
        clearInterval(heartbeat);
        clearPending();
        const previous = socket;
        socket = null;
        previous?.close();
        stopCall();
        Object.assign(model, { identity: null, online: false, available: false, request: null,
          result: null, page: "dashboard", notice: "", waiting: [], scenario: "normal" });
        model.readings.clear();
      } catch (error) {
        model.notice = error.message;
      }
      render();
      break;
  }
});

window.addEventListener("pagehide", () => {
  stopCall();
  socket?.close();
});
window.addEventListener("pageshow", event => {
  if (event.persisted && model.identity) openSocket();
});
setInterval(tick, 1000);
api("/api/me").then(identity => {
  model.identity = identity;
  openSocket();
}).catch(() => {}).finally(render);
