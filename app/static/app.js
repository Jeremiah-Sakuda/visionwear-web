import { Call } from "./media.js";
import { viewMarkup } from "./views.js";

const main = document.querySelector("#main");
const live = document.querySelector("#announcement");
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

const helper = () => model.identity?.role === "helper";
const inCall = () => model.request && model.request.state !== "waiting";
const announce = message => { live.textContent = message; };

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

function render() {
  const focused = document.activeElement;
  const view = !model.identity ? "login" : model.result ? "result" :
    inCall() ? "session" : model.page === "settings" ? "settings" : helper() ? "dashboard" : "device";
  const sameView = previousView === view;
  const sensorDraft = sameView && view === "device"
    ? Array.from(main.querySelectorAll("#sensor input, #sensor select"), field => [field.id, field.value])
    : [];

  if (view !== "login" || !sameView) {
    main.innerHTML = viewMarkup(view, model, {
      call, pending, outcome: outcomes[model.result] || outcomes.server_restarted,
    });
    for (const [id, value] of sensorDraft) {
      document.getElementById(id).value = value;
    }
    if (!sameView) {
      main.querySelector("h1")?.focus();
    } else if (focused?.id) {
      document.getElementById(focused.id)?.focus({ preventScroll: true });
    } else if (focused?.dataset.action) {
      const replacement = Array.from(main.querySelectorAll("button[data-action]")).find(button =>
        button.dataset.action === focused.dataset.action && button.dataset.id === focused.dataset.id
      );
      replacement?.focus({ preventScroll: true });
    }
  }
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
