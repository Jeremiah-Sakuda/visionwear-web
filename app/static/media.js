export class Call {
  constructor(id, role, send, changed) {
    Object.assign(this, { id, role, send, changed });
    this.candidates = [];
    this.remote = new MediaStream();
    this.local = new MediaStream();
    this.lastPacket = {};
    this.lastBytes = {};
    this.status = { audio: false, video: false };
  }

  async prepare(ice, options) {
    const pc = new RTCPeerConnection(ice);
    this.pc = pc;
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal("ice", candidate.toJSON());
    };
    pc.ontrack = ({ track }) => {
      this.remote.addTrack(track);
      this.changed();
    };
    const audio = options.mic ? { deviceId: { exact: options.mic } } : true;
    const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    const capture = async (kind, constraints) => {
      if (this.closed || !navigator.mediaDevices) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (this.closed) stream.getTracks().forEach(track => track.stop());
        else stream.getTracks().forEach(track => this.local.addTrack(track));
      } catch (error) {
        if (!this.closed) {
          this.permissionError = `${kind} unavailable: ${error.name}`;
          this.changed();
        }
      }
    };
    if (options.scenario !== "missing-audio") await capture("Microphone", { audio });
    if (this.role === "vest" && options.scenario !== "missing-video") {
      await capture("Camera", { video });
    }
    if (this.closed) return;
    if (this.role === "vest") {
      for (const kind of ["audio", "video"]) {
        const track = this.local.getTracks().find(t => t.kind === kind);
        pc.addTransceiver(track || kind, { direction: track ? "sendrecv" : "recvonly", streams: [this.local] });
      }
      await pc.setLocalDescription(await pc.createOffer());
      this.signal("offer", pc.localDescription.toJSON());
    }
    this.timer = setInterval(() => this.observe().catch(() => {}), 350);
    this.changed();
  }

  signal(kind, data) {
    if (!this.closed) this.send({ type: "signal", id: this.id, signal: { kind, data } });
  }

  async receive({ kind, data }) {
    if (this.closed) return;
    const pc = this.pc;
    if (kind === "ice") {
      if (pc.remoteDescription) await pc.addIceCandidate(data);
      else this.candidates.push(data);
      return;
    }
    await pc.setRemoteDescription(data);
    for (const candidate of this.candidates.splice(0)) await pc.addIceCandidate(candidate);
    if (kind === "offer") {
      const microphone = this.local.getAudioTracks()[0];
      const audio = pc.getTransceivers().find(t => t.receiver.track.kind === "audio");
      if (microphone && audio) {
        await audio.sender.replaceTrack(microphone);
        audio.direction = "sendrecv";
      }
      const video = pc.getTransceivers().find(t => t.receiver.track.kind === "video");
      if (video) video.direction = "recvonly";
      await pc.setLocalDescription(await pc.createAnswer());
      this.signal("answer", pc.localDescription.toJSON());
    }
  }

  async observe() {
    if (this.closed) return;
    const now = performance.now();
    const stats = await this.pc.getStats();
    if (this.closed) return;
    for (const stat of stats.values()) {
      if (stat.type !== "inbound-rtp") continue;
      const count = stat.kind === "video" ? stat.framesDecoded : stat.packetsReceived;
      if (count > (this.lastBytes[stat.id] || 0)) this.lastPacket[stat.kind] = now;
      this.lastBytes[stat.id] = count;
    }
    const next = {
      audio: now - (this.lastPacket.audio ?? -Infinity) < 3000,
      video: now - (this.lastPacket.video ?? -Infinity) < 3000,
    };
    if (next.audio !== this.status.audio || next.video !== this.status.video) {
      this.status = next;
      this.send({ type: "media", id: this.id, ...next });
      this.changed();
    }
  }

  mute() {
    const track = this.local.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
    return track ? !track.enabled : false;
  }

  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.pc?.close();
    for (const track of this.local.getTracks()) track.stop();
    for (const track of this.remote.getTracks()) track.stop();
  }
}
