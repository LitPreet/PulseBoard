/**
 * PulseBoard browser SDK.
 *
 *   pulseboard.init("pk_…", { apiHost: "https://analytics.example.com" });
 *   pulseboard.capture("signed_up", { plan: "pro" });
 *   pulseboard.identify(user.id, { email: user.email });
 */

export const VERSION = "0.1.0";

export interface PulseBoardConfig {
  /** Base URL of your PulseBoard deployment. */
  apiHost: string;
  /** Capture $pageview on load and on SPA navigation. Default: true */
  capturePageviews?: boolean;
  /** Capture $pageleave when the tab is hidden/closed. Default: true */
  capturePageleave?: boolean;
  /** Flush the queue at least this often. Default: 2000ms */
  flushIntervalMs?: number;
  /** Flush as soon as this many events are queued. Default: 20 */
  batchSize?: number;
  /** Minutes of inactivity before a new session starts. Default: 30 */
  sessionTimeoutMinutes?: number;
  /** Store ids and the unsent queue in localStorage (default) or only in memory. */
  persistence?: "localStorage" | "memory";
  /** Don't send anything if the browser has Do Not Track enabled. Default: false */
  respectDnt?: boolean;
  debug?: boolean;
}

type Props = Record<string, unknown>;

interface QueuedEvent {
  uuid: string;
  event: string;
  distinct_id: string;
  session_id: string;
  timestamp: string;
  properties: Props;
}

interface SessionState {
  id: string;
  lastActivity: number;
  startedAt: number;
}

const MAX_QUEUE = 1000;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 60_000;

/** UUIDv7: time-ordered, so inserts land at the end of the primary-key index. */
export function uuidv7(now = Date.now()): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class Storage {
  private memory = new Map<string, string>();
  constructor(private useLocal: boolean) {}
  get<T>(key: string): T | null {
    try {
      const raw = this.useLocal ? window.localStorage.getItem(key) : this.memory.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  set(key: string, value: unknown) {
    const raw = JSON.stringify(value);
    try {
      if (this.useLocal) window.localStorage.setItem(key, raw);
      else this.memory.set(key, raw);
    } catch {
      this.memory.set(key, raw);
    }
  }
  remove(key: string) {
    try {
      if (this.useLocal) window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    this.memory.delete(key);
  }
}

function referringDomain(ref: string): string {
  if (!ref) return "$direct";
  try {
    return new URL(ref).hostname;
  } catch {
    return "$direct";
  }
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];

export class PulseBoard {
  private apiKey = "";
  private config: Required<PulseBoardConfig> | null = null;
  private store = new Storage(false);
  private queue: QueuedEvent[] = [];
  private superProps: Props = {};
  private distinctId = "";
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;
  private backoffMs = 0;
  private lastPath = "";
  private optedOut = false;

  init(apiKey: string, config: PulseBoardConfig) {
    if (this.config) return this;
    if (typeof window === "undefined") return this;
    this.apiKey = apiKey;
    this.config = {
      capturePageviews: true,
      capturePageleave: true,
      flushIntervalMs: 2000,
      batchSize: 20,
      sessionTimeoutMinutes: 30,
      persistence: "localStorage",
      respectDnt: false,
      debug: false,
      ...config,
      apiHost: config.apiHost.replace(/\/+$/, ""),
    };
    this.store = new Storage(this.config.persistence === "localStorage");
    this.optedOut = this.store.get<boolean>(this.key("optout")) === true || (this.config.respectDnt && navigator.doNotTrack === "1");
    this.distinctId = this.store.get<string>(this.key("id")) ?? this.newAnonId();
    this.superProps = this.store.get<Props>(this.key("props")) ?? {};
    this.queue = this.store.get<QueuedEvent[]>(this.key("queue")) ?? [];

    if (this.config.capturePageviews) {
      this.capturePageview();
      this.patchHistory();
    }
    window.addEventListener("pagehide", () => this.onHide());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush({ beacon: true });
    });
    this.scheduleFlush();
    this.log("initialized", { distinctId: this.distinctId });
    return this;
  }

  /** Record a custom event. */
  capture(event: string, properties: Props = {}) {
    if (!this.config || this.optedOut || !event) return;
    const now = Date.now();
    const session = this.touchSession(now);
    const item: QueuedEvent = {
      uuid: uuidv7(now),
      event,
      distinct_id: this.distinctId,
      session_id: session.id,
      timestamp: new Date(now).toISOString(),
      properties: { ...this.defaultProps(), ...this.superProps, ...properties, $session_id: session.id },
    };
    this.queue.push(item);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    this.persistQueue();
    this.log("capture", item);
    if (this.queue.length >= this.config.batchSize) this.flush();
  }

  /** Tie the current (anonymous) visitor to your user id, and optionally set person properties. */
  identify(distinctId: string, setProperties: Props = {}) {
    if (!this.config || !distinctId) return;
    const id = String(distinctId);
    const previous = this.distinctId;
    if (id !== previous) {
      this.distinctId = id;
      this.store.set(this.key("id"), id);
    }
    this.capture("$identify", { $anon_distinct_id: previous !== id ? previous : undefined, $set: setProperties });
  }

  /** Update properties on the current person without sending a custom event. */
  setPersonProperties(set: Props, setOnce: Props = {}) {
    this.capture("$set", { $set: set, $set_once: setOnce });
  }

  /** Properties attached to every subsequent event. */
  register(properties: Props) {
    this.superProps = { ...this.superProps, ...properties };
    this.store.set(this.key("props"), this.superProps);
  }

  unregister(property: string) {
    delete this.superProps[property];
    this.store.set(this.key("props"), this.superProps);
  }

  /** Call on logout: forget the identified user and start a fresh anonymous id + session. */
  reset() {
    this.flush({ beacon: true });
    this.superProps = {};
    this.store.remove(this.key("props"));
    this.store.remove(this.key("session"));
    this.distinctId = this.newAnonId();
  }

  optOut() {
    this.optedOut = true;
    this.queue = [];
    this.persistQueue();
    this.store.set(this.key("optout"), true);
  }

  optIn() {
    this.optedOut = false;
    this.store.remove(this.key("optout"));
  }

  getDistinctId() {
    return this.distinctId;
  }

  getSessionId() {
    return this.touchSession(Date.now()).id;
  }

  /** Send queued events now. With `beacon`, uses navigator.sendBeacon so it survives page unload. */
  async flush(opts: { beacon?: boolean } = {}): Promise<void> {
    if (!this.config || this.queue.length === 0) return;
    const url = `${this.config.apiHost}/api/v1/capture`;

    if (opts.beacon && typeof navigator.sendBeacon === "function") {
      const batch = this.queue.splice(0, 500);
      const ok = navigator.sendBeacon(url, new Blob([this.body(batch)], { type: "text/plain" }));
      if (!ok) this.queue.unshift(...batch);
      this.persistQueue();
      return;
    }
    if (this.flushing) return;
    this.flushing = true;
    const batch = this.queue.slice(0, 500);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.body(batch),
        keepalive: true,
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        // 4xx (other than 429) won't succeed on retry — drop the batch.
        if (!res.ok) this.log(`dropping batch: HTTP ${res.status}`);
        const sent = new Set(batch.map((e) => e.uuid));
        this.queue = this.queue.filter((e) => !sent.has(e.uuid));
        this.persistQueue();
        this.backoffMs = 0;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs ? this.backoffMs * 2 : 1000);
      this.log(`flush failed, retrying in ${this.backoffMs}ms`, err);
    } finally {
      this.flushing = false;
    }
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private key(name: string) {
    return `pb_${this.apiKey.slice(-12)}_${name}`;
  }

  private newAnonId() {
    const id = uuidv7();
    this.store.set(this.key("id"), id);
    return id;
  }

  private body(batch: QueuedEvent[]) {
    return JSON.stringify({ api_key: this.apiKey, sent_at: new Date().toISOString(), batch });
  }

  private persistQueue() {
    this.store.set(this.key("queue"), this.queue);
  }

  private scheduleFlush() {
    clearTimeout(this.flushTimer);
    const delay = (this.config?.flushIntervalMs ?? 2000) + this.backoffMs;
    this.flushTimer = setTimeout(async () => {
      await this.flush();
      this.scheduleFlush();
    }, delay);
  }

  private touchSession(now: number): SessionState {
    const timeout = (this.config?.sessionTimeoutMinutes ?? 30) * 60_000;
    let s = this.store.get<SessionState>(this.key("session"));
    if (!s || now - s.lastActivity > timeout || now - s.startedAt > MAX_SESSION_MS) {
      s = { id: uuidv7(now), startedAt: now, lastActivity: now };
    } else {
      s.lastActivity = now;
    }
    this.store.set(this.key("session"), s);
    return s;
  }

  private defaultProps(): Props {
    const loc = window.location;
    return {
      $current_url: loc.href,
      $host: loc.host,
      $pathname: loc.pathname,
      $title: document.title,
      $referrer: document.referrer || "$direct",
      $referring_domain: referringDomain(document.referrer),
      $screen_width: window.screen?.width,
      $screen_height: window.screen?.height,
      $viewport_width: window.innerWidth,
      $viewport_height: window.innerHeight,
      $language: navigator.language,
      $lib: "pulseboard-web",
      $lib_version: VERSION,
    };
  }

  private capturePageview() {
    const path = window.location.pathname + window.location.search;
    if (path === this.lastPath) return;
    this.lastPath = path;
    const params = new URLSearchParams(window.location.search);
    const utm: Props = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) utm[k] = v;
    }
    const props: Props = { ...utm };
    if (Object.keys(utm).length) props.$set_once = Object.fromEntries(Object.entries(utm).map(([k, v]) => [`initial_${k}`, v]));
    this.capture("$pageview", props);
  }

  private patchHistory() {
    const fire = () => setTimeout(() => this.capturePageview(), 0);
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const result = original.apply(this, args);
        fire();
        return result;
      };
    }
    window.addEventListener("popstate", fire);
  }

  private onHide() {
    if (this.config?.capturePageleave) this.capture("$pageleave");
    this.flush({ beacon: true });
  }

  private log(...args: unknown[]) {
    if (this.config?.debug) console.log("[pulseboard]", ...args);
  }
}

export const pulseboard = new PulseBoard();
export default pulseboard;
