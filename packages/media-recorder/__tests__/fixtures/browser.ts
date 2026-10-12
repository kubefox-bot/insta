import type {
  RecorderEvents,
  RecorderFactory,
  RecorderTimers,
} from "../../src/types";

export class Track<Kind extends string = string>
  extends EventTarget
  implements MediaStreamTrack
{
  readonly id = crypto.randomUUID();
  readonly label = "synthetic";
  readonly kind: Kind;
  enabled = true;
  readonly muted = false;
  readonly contentHint = "";
  readyState: MediaStreamTrackState = "live";
  onended: MediaStreamTrack["onended"] = null;
  onmute: MediaStreamTrack["onmute"] = null;
  onunmute: MediaStreamTrack["onunmute"] = null;
  stopCalls = 0;
  constructor(kind: Kind) {
    super();
    this.kind = kind;
  }
  stop() {
    this.stopCalls++;
    this.readyState = "ended";
  }
  clone() {
    return new Track(this.kind);
  }
  async applyConstraints() {}
  getCapabilities() {
    return {};
  }
  getConstraints() {
    return {};
  }
  getSettings() {
    return {};
  }
}
export class Stream extends EventTarget implements MediaStream {
  readonly id = crypto.randomUUID();
  onaddtrack: MediaStream["onaddtrack"] = null;
  onremovetrack: MediaStream["onremovetrack"] = null;
  readonly tracks = [new Track("video"), new Track("audio")];
  get active() {
    return this.tracks.some((track) => track.readyState === "live");
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
  getTrackById(id: string) {
    return this.tracks.find((track) => track.id === id) ?? null;
  }
  addTrack() {
    throw new Error("fixture is immutable");
  }
  removeTrack() {
    throw new Error("fixture is immutable");
  }
  clone() {
    return new Stream();
  }
}
export const browser = () => {
  const stream = new Stream();
  const permission = Promise.withResolvers<MediaStream>();
  const events: { current?: RecorderEvents; hidden?: () => void } = {};
  const counts = { starts: 0, stops: 0, listeners: 0, visibility: 0 };
  const time = { now: 0 };
  const callbacks = new Map<number, () => void>();
  let nextTimer = 0;
  const timers: RecorderTimers = {
    setTimeout: (callback) => {
      const id = ++nextTimer;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout: (id) => {
      if (typeof id === "number") callbacks.delete(id);
    },
  };
  const recorderFactory: RecorderFactory = {
    isTypeSupported: (mime) => mime.startsWith("video/webm"),
    create: () => ({
      mimeType: "video/webm;codecs=vp8,opus",
      start: () => {
        counts.starts++;
      },
      stop: () => {
        counts.stops++;
      },
      subscribe: (handlers) => {
        events.current = handlers;
        counts.listeners++;
        return () => {
          events.current = undefined;
          counts.listeners--;
        };
      },
    }),
  };
  const options = {
    maxDurationMs: 15000,
    mediaDevices: { getUserMedia: () => permission.promise },
    recorderFactory,
    clock: () => time.now,
    timers,
    visibility: {
      isHidden: () => false,
      subscribe: (handler: () => void) => {
        events.hidden = handler;
        counts.visibility++;
        return () => {
          events.hidden = undefined;
          counts.visibility--;
        };
      },
    },
  };
  const settle = () => {
    events.current?.data(new Blob(["final"]));
    events.current?.stop();
  };
  const tick = (now: number) => {
    time.now = now;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback();
  };
  return {
    stream,
    permission,
    events,
    counts,
    options,
    settle,
    tick,
    callbacks,
    time,
  };
};
