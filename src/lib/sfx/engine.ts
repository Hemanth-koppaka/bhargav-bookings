// Hair by Bhargav: procedural interface sound.
//
// One shared AudioContext, created only after the guest's first real gesture.
// Every sound is synthesised on the fly from a handful of primitives (filtered
// noise, sine partials, a tiny metallic "tool" resonator, a small generated
// room), so nothing is downloaded. Sound is always optional: if audio is
// unavailable or switched off, every call is a silent no-op.
import {
  CATEGORY_NOTES,
  DEFAULT_SOUND,
  NOTE,
  PRESETS,
  SFX,
  VARIATION,
  type SoundPreset,
  type SoundSettings,
} from "./tokens";

export type SoundName =
  | "ui_back"
  | "ui_category"
  | "ui_service_select"
  | "ui_service_remove"
  | "ui_check"
  | "ui_search_focus"
  | "ui_search_result"
  | "ui_filter"
  | "ui_filter_pick"
  | "ui_date_select"
  | "ui_time_select"
  | "ui_unavailable"
  | "ui_step_transition"
  | "ui_button_primary"
  | "ui_button_secondary"
  | "ui_nav"
  | "ui_select"
  | "ui_deselect"
  | "ui_toggle_on"
  | "ui_toggle_off"
  | "ui_calendar"
  | "ui_calendar_done"
  | "ui_success"
  | "ui_seal"
  | "ui_error"
  | "ui_contact"
  | "ui_hover"
  | "ui_ambience";

/** Kinds usable as `data-sfx="…"` on any element (played by the delegated listener). */
export type SfxKind =
  "primary" | "secondary" | "nav" | "select" | "contact" | "calendar" | "filter" | "back";

type Tone = {
  t: number;
  f: number;
  to?: number;
  glide?: number;
  type?: OscillatorType;
  gain: number;
  a?: number;
  d: number;
  send?: number;
  pan?: number;
};
type Noise = {
  t: number;
  gain: number;
  a?: number;
  d: number;
  type: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  send?: number;
  pan?: number;
};
type Voice = { t: number; v: { p: number; g: number }; arg?: number | undefined };

const PREF_KEY = "hb.sound";
const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

class SoundEngine {
  private ctx: AudioContext | null = null;
  /** While the score is being scheduled, voices go to its own fader. */
  private route: GainNode | null = null;
  private bus: GainNode | null = null;
  private master: GainNode | null = null;
  private verbIn: GainNode | null = null;
  private verbOut: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private failed = false;
  private unlocked = false;
  private installed = false;
  private voices = 0;
  private noiseTurn = 0;
  private last = new Map<string, number>();
  private turns = new Map<string, number>();
  private salon: SoundSettings = { ...DEFAULT_SOUND };
  private guestOn = true;
  private lite = false; // touch devices: fewer layers, smaller room
  private calm = false; // reduced motion: no shimmer tails
  private listeners = new Set<() => void>();

  // ── settings ────────────────────────────────────────────────────────────

  /** Salon-wide settings from the console (applied with the rest of the config). */
  applySalon(s: Partial<SoundSettings> | null | undefined) {
    const next = { ...DEFAULT_SOUND, ...(s ?? {}) };
    next.volume = Math.min(1, Math.max(0, Number(next.volume) || 0));
    if (!["luxury", "minimal", "silent"].includes(next.preset)) next.preset = "luxury";
    if (JSON.stringify(next) === JSON.stringify(this.salon)) return;
    this.salon = next;
    this.syncLevels();
    this.emit();
  }
  /** The guest's own on/off (remembered on this device). */
  setEnabled(on: boolean) {
    this.guestOn = on;
    try {
      localStorage.setItem(PREF_KEY, on ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
    if (on) this.unlock();
    this.syncLevels();
    this.emit();
  }
  setMasterVolume(v: number) {
    this.applySalon({ ...this.salon, volume: v });
  }
  setPreset(p: SoundPreset) {
    this.applySalon({ ...this.salon, preset: p });
  }
  /** Sounds play only when the salon has them on AND the guest hasn't muted them. */
  get active() {
    return this.salon.enabled && this.salon.preset !== "silent" && this.guestOn && !this.failed;
  }
  /** The salon-wide settings currently in force. */
  get salonSettings(): SoundSettings {
    return { ...this.salon };
  }
  get salonEnabled() {
    return this.salon.enabled && this.salon.preset !== "silent";
  }
  get guestEnabled() {
    return this.guestOn;
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  /** Wire up the first-gesture unlock and the `data-sfx` delegation. Safe to call repeatedly. */
  install() {
    if (!isBrowser() || this.installed) return;
    this.installed = true;
    try {
      this.guestOn = localStorage.getItem(PREF_KEY) !== "off";
    } catch {
      /* default on */
    }
    const mq = (q: string) => window.matchMedia?.(q);
    const coarse = mq("(pointer: coarse)");
    const calm = mq("(prefers-reduced-motion: reduce)");
    this.lite = Boolean(coarse?.matches);
    this.calm = Boolean(calm?.matches);
    coarse?.addEventListener?.("change", (e) => (this.lite = e.matches));
    calm?.addEventListener?.("change", (e) => (this.calm = e.matches));

    const first = () => this.unlock();
    window.addEventListener("pointerdown", first, { capture: true, passive: true });
    window.addEventListener("keydown", first, { capture: true, passive: true });

    document.addEventListener("pointerdown", this.onPointerDown, { capture: true, passive: true });
    document.addEventListener("click", this.onClick, { capture: true, passive: true });
    document.addEventListener("pointerover", this.onPointerOver, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => {});
      else if (this.unlocked) void this.ctx.resume().catch(() => {});
    });
  }

  /** Create or resume the context. Only ever called from a user gesture. */
  private unlock() {
    this.unlocked = true; // a real gesture has happened; audio may start from now on
    if (!this.active || this.failed) return;
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    } catch {
      this.failed = true; // no audio on this device; the booking carries on silently
    }
  }

  private build() {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      this.failed = true;
      return;
    }
    // Safari 16.4+: mix with other audio, obey the silent switch, never pause music
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "ambient";
    } catch {
      /* not supported */
    }
    const ctx = new AC({ latencyHint: "interactive" });
    const bus = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = SFX.FILTER_FREQUENCY;
    tone.Q.value = 0.5;
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 10;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    bus.connect(tone).connect(master).connect(limiter).connect(ctx.destination);

    // small warm "studio" room, generated (no impulse file)
    const verbIn = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = this.roomImpulse(ctx);
    const verbOut = ctx.createGain();
    verbIn.connect(room).connect(verbOut).connect(tone);

    // one shared second of noise for every breath, brush and paper layer
    const len = ctx.sampleRate;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = nb.getChannelData(0);
    let seed = 0x2f6b;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic noise
      ch[i] = (seed / 0x3fffffff - 1) * 0.9;
    }

    this.ctx = ctx;
    this.bus = bus;
    this.master = master;
    this.verbIn = verbIn;
    this.verbOut = verbOut;
    this.noiseBuf = nb;
    this.syncLevels();
  }

  private roomImpulse(ctx: AudioContext) {
    const secs = this.lite ? SFX.REVERB_SECONDS_LITE : SFX.REVERB_SECONDS;
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let seed = 0x51ed + c * 977;
      let lp = 0;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = seed / 0x3fffffff - 1;
        lp += (n - lp) * 0.32; // darken: a warm room, not a bright hall
        const x = i / len;
        d[i] =
          lp *
          Math.pow(1 - x, 3.4) *
          (i < ctx.sampleRate * 0.008 ? i / (ctx.sampleRate * 0.008) : 1);
      }
    }
    return buf;
  }

  private syncLevels() {
    if (!this.ctx || !this.master || !this.verbOut) return;
    const p = PRESETS[this.salon.preset];
    const on = this.active ? 1 : 0;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.salon.volume * SFX.MASTER_MAX * p.gain * on, now, 0.02);
    this.verbOut.gain.setTargetAtTime(
      SFX.REVERB_AMOUNT * p.reverb * (this.lite ? 0.5 : 1),
      now,
      0.02,
    );
  }

  // ── primitives ──────────────────────────────────────────────────────────

  private out(g: GainNode, send = 0, pan = 0) {
    const ctx = this.ctx!;
    let node: AudioNode = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    node.connect(this.route ?? this.bus!);
    let s: GainNode | null = null;
    if (send > 0 && !this.lite) {
      s = ctx.createGain();
      s.gain.value = send;
      node.connect(s).connect(this.verbIn!);
    }
    return () => {
      g.disconnect();
      if (node !== g) node.disconnect();
      s?.disconnect();
    };
  }

  private env(param: AudioParam, t: number, peak: number, a: number, d: number) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /** A sine (or other) partial with an attack/decay envelope and optional glide. */
  tone(o: Tone) {
    if (!this.ctx || (this.voices > SFX.MAX_VOICES && !this.route) || o.gain <= 0) return;
    const ctx = this.ctx;
    const a = o.a ?? SFX.ATTACK;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f, o.t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.t + (o.glide ?? a + o.d));
    const g = ctx.createGain();
    this.env(g.gain, o.t, o.gain, a, o.d);
    osc.connect(g);
    const done = this.out(g, o.send, o.pan);
    this.voices++;
    osc.onended = () => {
      this.voices--;
      osc.disconnect();
      done();
    };
    osc.start(o.t);
    osc.stop(o.t + a + o.d + 0.03);
  }

  /** Filtered noise: air, brush, paper, breath. */
  noise(o: Noise) {
    if (!this.ctx || !this.noiseBuf || (this.voices > SFX.MAX_VOICES && !this.route) || o.gain <= 0) return;
    const ctx = this.ctx;
    const a = o.a ?? SFX.ATTACK;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.f, o.t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, o.t + a + o.d);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    this.env(g.gain, o.t, o.gain, a, o.d);
    src.connect(f).connect(g);
    const done = this.out(g, o.send, o.pan);
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
      f.disconnect();
      done();
    };
    // deterministic start points so repeated breaths differ slightly
    const offset = ((this.noiseTurn++ * 0.173) % 0.8) + 0.01;
    src.start(o.t, offset, a + o.d + 0.03);
  }

  /** A tiny tactile transient (a latch, a tick). */
  click(t: number, f: number, gain: number, d: number = SFX.CLICK_DECAY, pan = 0) {
    this.noise({ t, type: "bandpass", f, q: 2.2, gain, a: 0.0012, d, pan });
  }

  /** Brushed-metal "tool contact": a few inharmonic partials, very short. */
  metal(t: number, f: number, gain: number, d: number, send = 0) {
    const ratios = [1, 2.32, 4.25, 6.63];
    const levels = [1, 0.5, 0.26, 0.14];
    ratios.forEach((r, i) => {
      const fr = f * r;
      if (fr > 14000) return;
      this.tone({ t, f: fr, gain: gain * levels[i]!, a: 0.0015, d: d * (1 - i * 0.18), send });
    });
  }

  // ── the library ─────────────────────────────────────────────────────────

  private vary(name: string) {
    const n = this.turns.get(name) ?? 0;
    this.turns.set(name, n + 1);
    return {
      p: 1 + VARIATION.PITCH[n % VARIATION.PITCH.length]!,
      g: 1 + VARIATION.LEVEL[n % VARIATION.LEVEL.length]!,
    };
  }

  private get tonal() {
    return PRESETS[this.salon.preset].tonal;
  }
  private get shimmer() {
    return PRESETS[this.salon.preset].shimmer && !this.calm && !this.lite;
  }

  private sounds: Record<SoundName, (x: Voice) => void> = {
    // Back: a short brush of air drifting left, closed by a soft latch. "shhh—click"
    ui_back: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.noise({
        t,
        type: "bandpass",
        f: 2600 * v.p,
        to: 900,
        q: 0.8,
        gain: C * 0.42,
        a: 0.03,
        d: 0.1,
        pan: -0.18,
      });
      this.click(t + 0.12, 2100 * v.p, C * 0.55, 0.014, -0.1);
    },

    // Category: comb-like air with a few microscopic "teeth" and a small rising note
    ui_category: ({ t, v, arg = 0 }) => {
      const T = SFX.TRANSITION_VOLUME * v.g;
      const note = CATEGORY_NOTES[Math.abs(arg) % CATEGORY_NOTES.length]! * v.p;
      const pan = ((arg % 5) - 2) * 0.06;
      this.noise({
        t,
        type: "bandpass",
        f: 700,
        to: 2400,
        q: 1.1,
        gain: T * 0.5,
        a: 0.05,
        d: 0.12,
        pan,
      });
      for (let i = 0; i < 3; i++)
        this.click(t + 0.03 + i * 0.019, 3600 - i * 300, T * (0.16 - i * 0.04), 0.006, pan);
      this.tone({
        t: t + 0.02,
        f: note * 0.94,
        to: note,
        glide: 0.06,
        gain: T * 0.38 * this.tonal,
        a: 0.02,
        d: 0.18,
        send: 0.3,
        pan,
      });
    },

    // Service select: a physical latch, then the check's glass tick and a soft bloom.
    // The check pops ~110ms after the press; the tick lands with it.
    ui_service_select: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 3300 * v.p, S * 1.1, 0.011);
      this.metal(t + 0.002, 2900 * v.p, S * 0.1, 0.05);
      this.tone({
        t: t + 0.02,
        f: NOTE.A5 * v.p,
        gain: S * 0.5 * this.tonal,
        a: 0.012,
        d: 0.26,
        send: 0.32,
      });
      this.tone({
        t: t + 0.035,
        f: NOTE.D6 * v.p,
        gain: S * 0.28 * this.tonal,
        a: 0.012,
        d: 0.24,
        send: 0.32,
      });
      this.sounds.ui_check({ t: t + 0.11, v });
      if (this.shimmer) this.metal(t + 0.13, 4700 * v.p, SFX.SHIMMER_VOLUME * 0.35, 0.18, 0.4);
    },

    // Remove: a softer, lower latch and a falling note: released, not rejected
    ui_service_remove: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 2500 * v.p, S * 0.85, 0.012);
      this.tone({
        t: t + 0.015,
        f: NOTE.E5 * v.p,
        to: NOTE.B4 * v.p,
        glide: 0.18,
        gain: S * 0.38 * this.tonal,
        a: 0.012,
        d: 0.2,
        send: 0.18,
      });
    },

    // The checkmark itself: a precision click with a glass-like tick
    ui_check: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 5200 * v.p, S * 0.5, 0.006);
      this.tone({ t, f: NOTE.D7 * v.p, gain: S * 0.22 * this.tonal, a: 0.002, d: 0.07 });
      this.tone({ t, f: NOTE.D7 * 2.76 * v.p, gain: S * 0.05 * this.tonal, a: 0.002, d: 0.035 });
    },

    ui_search_focus: ({ t, v }) => {
      this.noise({
        t,
        type: "highpass",
        f: 3200,
        gain: SFX.HOVER_VOLUME * 2 * v.g,
        a: 0.02,
        d: 0.06,
      });
      this.tone({
        t: t + 0.01,
        f: NOTE.D6 * v.p,
        gain: SFX.SELECTION_VOLUME * 0.1 * this.tonal,
        a: 0.01,
        d: 0.1,
      });
    },
    ui_search_result: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.tone({
        t,
        f: NOTE.A5 * v.p,
        to: NOTE.B5 * v.p,
        glide: 0.05,
        gain: S * 0.22 * this.tonal,
        a: 0.008,
        d: 0.09,
      });
      this.tone({
        t: t + 0.03,
        f: NOTE.D6 * v.p,
        gain: S * 0.12 * this.tonal,
        a: 0.008,
        d: 0.1,
        send: 0.2,
      });
    },

    // Sort menu opens: a mechanical tick and a little air
    ui_filter: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.click(t, 2800 * v.p, C * 0.7, 0.01);
      this.noise({
        t: t + 0.005,
        type: "bandpass",
        f: 1500,
        to: 3000,
        q: 1,
        gain: C * 0.22,
        a: 0.02,
        d: 0.08,
      });
    },
    ui_filter_pick: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.click(t, 4200 * v.p, C * 0.75, 0.006);
      this.tone({
        t: t + 0.01,
        f: NOTE.B5 * v.p,
        gain: SFX.SELECTION_VOLUME * 0.32 * this.tonal * v.g,
        a: 0.006,
        d: 0.1,
        send: 0.15,
      });
    },

    // Date: a page turning under a fingertip, set down with a small click
    ui_date_select: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.noise({
        t,
        type: "bandpass",
        f: 2300 * v.p,
        to: 1300,
        q: 0.6,
        gain: C * 0.5,
        a: 0.012,
        d: 0.07,
      });
      this.noise({ t, type: "highpass", f: 5200, gain: C * 0.14, a: 0.004, d: 0.03 });
      this.click(t + 0.06, 1500 * v.p, C * 0.6, 0.012);
      this.tone({
        t: t + 0.06,
        f: NOTE.D5 * v.p,
        gain: SFX.SELECTION_VOLUME * 0.12 * this.tonal,
        a: 0.006,
        d: 0.1,
        send: 0.15,
      });
    },

    // Time: a precise lock and a warm, low pulse. "This time is mine."
    ui_time_select: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 4600 * v.p, S * 0.85, 0.005);
      this.metal(t, 3500 * v.p, S * 0.08, 0.04);
      this.click(t + 0.034, 3000 * v.p, S * 0.32, 0.006); // the latch settling
      this.tone({
        t: t + 0.015,
        f: NOTE.D4 * v.p,
        gain: S * 0.62 * this.tonal,
        a: 0.02,
        d: 0.34,
        send: 0.3,
      });
      this.tone({
        t: t + 0.02,
        f: NOTE.A4 * v.p,
        gain: S * 0.32 * this.tonal,
        a: 0.02,
        d: 0.3,
        send: 0.3,
      });
      this.tone({
        t: t + 0.03,
        f: NOTE.D5 * v.p,
        gain: S * 0.12 * this.tonal,
        a: 0.02,
        d: 0.26,
        send: 0.3,
      });
    },

    // Trying a slot that isn't available: a muted low click, nothing more
    ui_unavailable: ({ t, v }) => {
      const E = SFX.ERROR_VOLUME * v.g;
      this.noise({ t, type: "lowpass", f: 650, gain: E * 0.6, a: 0.002, d: 0.03 });
      this.tone({ t, f: 150, gain: E * 0.3, a: 0.003, d: 0.05 });
    },

    // Next step: air swells, a warm fifth rises, a tiny tactile endpoint (~450ms)
    ui_step_transition: ({ t, v }) => {
      const T = SFX.TRANSITION_VOLUME * v.g;
      this.noise({ t, type: "bandpass", f: 500, to: 2600, q: 0.9, gain: T * 0.5, a: 0.16, d: 0.2 });
      this.tone({
        t,
        f: NOTE.A3 * v.p,
        to: NOTE.D4 * v.p,
        glide: 0.2,
        gain: T * 0.42 * this.tonal,
        a: 0.12,
        d: 0.28,
        send: 0.4,
      });
      this.tone({
        t: t + 0.06,
        f: NOTE.A4 * v.p,
        gain: T * 0.2 * this.tonal,
        a: 0.14,
        d: 0.28,
        send: 0.4,
      });
      this.click(t + 0.34, 2400 * v.p, T * 0.7, 0.012);
      if (this.shimmer) this.metal(t + 0.34, 3000 * v.p, T * 0.08, 0.06, 0.3);
    },

    // Button family: same DNA (a short latch), different body
    ui_button_primary: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.click(t, 2300 * v.p, C * 0.8, 0.014);
      this.tone({ t, f: 160 * v.p, gain: C * 0.42, a: 0.003, d: 0.06 }); // felt more than heard
    },
    ui_button_secondary: ({ t, v }) => {
      this.click(t, 3000 * v.p, SFX.CLICK_VOLUME * 0.6 * v.g, 0.01);
    },
    ui_nav: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.click(t, 2000 * v.p, C * 0.5, 0.012);
      this.noise({ t, type: "highpass", f: 2500, gain: C * 0.12, a: 0.01, d: 0.04 });
    },
    ui_select: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 3600 * v.p, S * 0.85, 0.009);
      this.tone({
        t: t + 0.012,
        f: NOTE.Fs5 * v.p,
        gain: S * 0.32 * this.tonal,
        a: 0.01,
        d: 0.16,
        send: 0.2,
      });
    },
    ui_deselect: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 2600 * v.p, S * 0.7, 0.01);
      this.tone({
        t: t + 0.012,
        f: NOTE.D5 * v.p,
        to: NOTE.A4 * v.p,
        glide: 0.12,
        gain: S * 0.22 * this.tonal,
        a: 0.01,
        d: 0.14,
      });
    },
    ui_toggle_on: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.click(t, 3000 * v.p, S * 0.8, 0.01);
      this.tone({
        t: t + 0.015,
        f: NOTE.D5,
        to: NOTE.A5,
        glide: 0.08,
        gain: S * 0.3,
        a: 0.01,
        d: 0.16,
        send: 0.25,
      });
    },
    ui_toggle_off: ({ t, v }) => {
      this.click(t, 2400 * v.p, SFX.SELECTION_VOLUME * 0.6 * v.g, 0.01);
    },

    // Add to calendar: a click, a page placed into a schedule, a tiny confirmation
    ui_calendar: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.click(t, 3800 * v.p, C * 0.7, 0.008);
      this.noise({
        t: t + 0.02,
        type: "bandpass",
        f: 2000,
        to: 1200,
        q: 0.6,
        gain: C * 0.38,
        a: 0.012,
        d: 0.08,
      });
      this.tone({
        t: t + 0.09,
        f: NOTE.D6 * v.p,
        gain: SFX.SELECTION_VOLUME * 0.24 * this.tonal,
        a: 0.006,
        d: 0.14,
        send: 0.2,
      });
    },
    ui_calendar_done: ({ t, v }) => {
      const S = SFX.SELECTION_VOLUME * v.g;
      this.tone({ t, f: NOTE.A5 * v.p, gain: S * 0.26 * this.tonal, a: 0.006, d: 0.12, send: 0.3 });
      this.tone({
        t: t + 0.07,
        f: NOTE.D6 * v.p,
        gain: S * 0.22 * this.tonal,
        a: 0.006,
        d: 0.2,
        send: 0.3,
      });
    },

    // Booking confirmed: soft impact → warm bloom → refined metallic shimmer → short room tail
    ui_success: ({ t, v }) => {
      const S = SFX.SUCCESS_VOLUME * v.g;
      // impact: felt, not heard
      this.noise({ t, type: "lowpass", f: 240, q: 0.7, gain: S * 0.7, a: 0.004, d: 0.16 });
      this.tone({ t, f: 82, to: 55, glide: 0.2, gain: S * 0.55, a: 0.004, d: 0.22 });
      // bloom: a gently strummed D major, from the root up
      const chord = [NOTE.D4, NOTE.A4, NOTE.D5, NOTE.Fs5];
      const lv = [0.36, 0.26, 0.18, 0.12];
      chord.forEach((f, i) =>
        this.tone({
          t: t + 0.1 + i * 0.03,
          f: f * v.p,
          gain: S * lv[i]! * Math.max(0.5, this.tonal),
          a: 0.03,
          d: 0.85 - i * 0.08,
          send: 0.5,
        }),
      );
      // shimmer: two microscopic "blade" ticks and a high ring
      if (this.shimmer) {
        this.click(t + 0.18, 6200, S * 0.1, 0.005);
        this.click(t + 0.215, 6800, S * 0.08, 0.005);
        this.metal(t + 0.2, 4400 * v.p, SFX.SHIMMER_VOLUME * 0.45, 0.45, 0.5);
        this.tone({ t: t + 0.26, f: NOTE.A6 * v.p, gain: S * 0.05, a: 0.01, d: 0.4, send: 0.6 });
      }
    },

    // The seal stamping onto the confirmation card: a soft press, nothing more
    // The seal: it drops and lands (~0.38 s), rings, then the tick is drawn (0.45–0.95 s)
    ui_seal: ({ t, v }) => {
      const S = SFX.SUCCESS_VOLUME * v.g;
      // a faint air rush as it falls toward the card
      this.noise({ t, type: "bandpass", f: 900, to: 2400, q: 0.8, gain: S * 0.18, a: 0.25, d: 0.12 });
      // landing: a soft, weighty press
      const land = t + 0.37;
      this.tone({ t: land, f: 140, to: 70, glide: 0.12, gain: S * 0.6, a: 0.003, d: 0.16 });
      this.noise({ t: land, type: "lowpass", f: 500, gain: S * 0.55, a: 0.002, d: 0.08 });
      this.click(land, 2200, S * 0.35, 0.012);
      // the gold rings briefly
      this.tone({ t: land + 0.02, f: NOTE.D6 * v.p, gain: S * 0.16 * Math.max(0.6, this.tonal), a: 0.004, d: 0.5, send: 0.45 });
      this.tone({ t: land + 0.02, f: NOTE.D6 * 2.76 * v.p, gain: S * 0.04, a: 0.004, d: 0.25, send: 0.45 });
      // the tick being drawn: a quick pen stroke, then a bright "done"
      const tick = t + 0.47;
      this.noise({ t: tick, type: "bandpass", f: 1800, to: 5200, q: 1.4, gain: S * 0.22, a: 0.06, d: 0.32 });
      this.click(tick + 0.42, 5000 * v.p, S * 0.4, 0.006);
      this.tone({ t: tick + 0.42, f: NOTE.A5 * v.p, gain: S * 0.22 * Math.max(0.6, this.tonal), a: 0.006, d: 0.18, send: 0.3 });
      this.tone({ t: tick + 0.5, f: NOTE.D6 * v.p, gain: S * 0.2 * Math.max(0.6, this.tonal), a: 0.006, d: 0.32, send: 0.35 });
      if (this.shimmer) this.metal(tick + 0.5, 4200 * v.p, SFX.SHIMMER_VOLUME * 0.3, 0.35, 0.5);
    },

    // Something didn't work: a muted click and a short downward step. No alarm.
    ui_error: ({ t, v }) => {
      const E = SFX.ERROR_VOLUME * v.g;
      this.noise({ t, type: "lowpass", f: 900, gain: E * 0.5, a: 0.002, d: 0.03 });
      this.tone({
        t: t + 0.01,
        f: NOTE.A4,
        to: NOTE.E4,
        glide: 0.16,
        gain: E * 0.5,
        a: 0.01,
        d: 0.2,
      });
    },

    // Contact / WhatsApp: a warm, original two-note "reaching out"
    ui_contact: ({ t, v }) => {
      const C = SFX.CLICK_VOLUME * v.g;
      this.click(t, 2600 * v.p, C * 0.6, 0.01);
      this.tone({
        t: t + 0.01,
        f: NOTE.D5 * v.p,
        gain: SFX.SELECTION_VOLUME * 0.3 * this.tonal,
        a: 0.01,
        d: 0.16,
        send: 0.25,
      });
      this.tone({
        t: t + 0.06,
        f: NOTE.A5 * v.p,
        gain: SFX.SELECTION_VOLUME * 0.2 * this.tonal,
        a: 0.01,
        d: 0.18,
        send: 0.25,
      });
    },

    // Desktop hover on a few premium elements: barely a breath
    ui_hover: ({ t, v }) => {
      this.noise({ t, type: "highpass", f: 4200, gain: SFX.HOVER_VOLUME * v.g, a: 0.012, d: 0.04 });
    },

    // A slow, very quiet room swell under the confirmation film
    ui_ambience: ({ t }) => {
      this.noise({
        t,
        type: "lowpass",
        f: 420,
        to: 900,
        q: 0.4,
        gain: SFX.AMBIENCE_VOLUME,
        a: 0.6,
        d: 1.2,
        send: 0.3,
      });
    },
  };

  /** Play a named sound. `delay` (seconds) lines it up with an animation; `arg` varies it. */
  play(name: SoundName, opts: { delay?: number; arg?: number } = {}) {
    if (!this.active || !isBrowser()) return;
    if (!this.ctx) {
      if (!this.unlocked) return; // never before a real gesture
      this.unlock();
      if (!this.ctx) return;
    }
    const now = performance.now();
    const key = name + (opts.arg ?? "");
    if (now - (this.last.get(key) ?? -1e9) < SFX.MIN_GAP_MS) return;
    this.last.set(key, now);
    try {
      const ctx = this.ctx;
      const go = () =>
        this.sounds[name]({
          t: ctx.currentTime + 0.004 + (opts.delay ?? 0),
          v: this.vary(name),
          arg: opts.arg,
        });
      if (ctx.state === "running") go();
      else void ctx.resume().then(go, () => {});
    } catch {
      /* never let sound break the page */
    }
  }

  // ── friendly names (what components call) ─────────────────────────────

  navigation = () => this.play("ui_nav");
  back = () => this.play("ui_back");
  button = (kind: "primary" | "secondary" = "primary") =>
    this.play(kind === "primary" ? "ui_button_primary" : "ui_button_secondary");
  selection = () => this.play("ui_select");
  deselection = () => this.play("ui_deselect");
  serviceSelect = (on: boolean) => this.play(on ? "ui_service_select" : "ui_service_remove");
  categoryChange = (index: number) => this.play("ui_category", { arg: index });
  dateSelect = () => this.play("ui_date_select");
  timeSelect = () => this.play("ui_time_select");
  unavailable = () => this.play("ui_unavailable");
  toggle = (on: boolean) => this.play(on ? "ui_toggle_on" : "ui_toggle_off");
  filterOpen = () => this.play("ui_filter");
  filterPick = () => this.play("ui_filter_pick");
  searchFocus = () => this.play("ui_search_focus");
  private lastResult = 0;
  searchResult = () => {
    const now = performance.now();
    if (now - this.lastResult < SFX.SEARCH_RESULT_GAP_MS) return;
    this.lastResult = now;
    this.play("ui_search_result");
  };
  success = () => this.play("ui_success");
  bookingConfirm = () => this.play("ui_success");
  seal = () => this.play("ui_seal");
  error = () => this.play("ui_error");
  transition = () => this.play("ui_step_transition");
  calendar = () => this.play("ui_calendar");
  calendarDone = () => this.play("ui_calendar_done", { delay: 0.12 });
  contact = () => this.play("ui_contact");
  ambience = () => this.play("ui_ambience");

  // ── delegated `data-sfx` elements ──────────────────────────────────────

  private pressed: { el: Element; at: number } | null = null;

  private static readonly PRESS: Record<SfxKind, SoundName> = {
    primary: "ui_button_primary",
    secondary: "ui_button_secondary",
    nav: "ui_nav",
    select: "ui_select",
    contact: "ui_contact",
    calendar: "ui_calendar",
    filter: "ui_filter",
    back: "ui_back",
  };

  private target(e: Event) {
    const t = e.target as Element | null;
    return t && typeof t.closest === "function"
      ? t.closest<HTMLElement>("[data-sfx],[data-sfx-off]")
      : null;
  }
  private disabled(el: HTMLElement) {
    return (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
  }

  // Sound starts as the element visibly compresses (pointer down), not after release.
  private onPointerDown = (e: PointerEvent) => {
    const el = this.target(e);
    if (!el) return;
    if (this.disabled(el)) {
      if (el.dataset["sfxOff"] !== undefined) this.unavailable();
      return;
    }
    const kind = el.dataset["sfx"] as SfxKind;
    const name = SoundEngine.PRESS[kind];
    if (!name) return;
    this.pressed = { el, at: performance.now() };
    this.play(name);
  };
  // Keyboard / assistive activation has no pointer down: play on click instead.
  private onClick = (e: MouseEvent) => {
    const el = this.target(e);
    if (!el || this.disabled(el)) return;
    if (this.pressed && this.pressed.el === el && performance.now() - this.pressed.at < 1500) {
      this.pressed = null;
      return;
    }
    const name = SoundEngine.PRESS[el.dataset["sfx"] as SfxKind];
    if (name) this.play(name);
  };
  private lastHover = 0;
  private onPointerOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || this.lite) return;
    const t = e.target as Element | null;
    const el = t?.closest?.("[data-sfx-hover]");
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    const now = performance.now();
    if (now - this.lastHover < SFX.HOVER_GAP_MS) return;
    this.lastHover = now;
    this.play("ui_hover");
  };

  /** A detuned-saw "string" chord through a slowly opening filter. */
  private pad(t: number, freqs: number[], dur: number, gain: number, cut: [number, number], a = 0.5, r = 0.7, send = 0.45) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(cut[0], t);
    f.frequency.exponentialRampToValueAtTime(cut[1], t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + a);
    g.gain.setValueAtTime(gain, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
    f.connect(g);
    const done = this.out(g, send);
    const detunes = this.lite ? [0] : [-7, 6];
    const oscs: OscillatorNode[] = [];
    for (const fr of freqs)
      for (const dt of detunes) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = fr;
        o.detune.value = dt;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + r + 0.05);
        oscs.push(o);
      }
    this.voices += 1;
    oscs[0]!.onended = () => {
      this.voices -= 1;
      oscs.forEach((o) => o.disconnect());
      f.disconnect();
      done();
    };
  }

  /** A soft timpani hit: a falling low sine with a felt-mallet thud. */
  private timpani(t: number, f: number, gain: number) {
    this.tone({ t, f, to: f * 0.8, glide: 0.5, gain, a: 0.006, d: 0.9, send: 0.4 });
    this.tone({ t, f: f * 1.5, gain: gain * 0.25, a: 0.006, d: 0.3 });
    this.noise({ t, type: "lowpass", f: 260, gain: gain * 0.6, a: 0.003, d: 0.12 });
  }

  /** A horn-like line: a filtered saw with a gentle swell. */
  private horn(t: number, f: number, dur: number, gain: number) {
    this.pad(t, [f], dur, gain, [700, 1500], Math.min(0.14, dur / 3), 0.35, 0.5);
  }

  /**
   * About eight seconds of rising, heroic score for the confirmation film,
   * cut to its shots: D minor → B♭ → C → A → D major at the reveal.
   * Returns a stop() that fades it out (when the guest skips the film).
   */
  score(): () => void {
    if (!this.active || !this.ctx || !this.bus) return () => {};
    const ctx = this.ctx;
    const fader = ctx.createGain();
    fader.gain.value = SFX.SCORE_VOLUME;
    fader.connect(this.bus);
    const t0 = ctx.currentTime + 0.06;
    const S = 1;
    this.route = fader;
    try {
      const N = { D2: 73.42, A2: 110, Bb2: 116.54, C3: 130.81, Cs3: 138.59, D3: 146.83, E3: 164.81, F3: 174.61, Fs3: 185, G3: 196, A3: 220, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, Fs4: 369.99 };
      // strings
      this.pad(t0, [N.D3, N.F3, N.A3], 2.4, S * 0.05, [350, 900], 1.2);
      this.pad(t0 + 2.4, [N.Bb2, N.D3, N.F3], 1.6, S * 0.06, [700, 1300], 0.3);
      this.pad(t0 + 4.0, [N.C3, N.E3, N.G3], 1.6, S * 0.07, [900, 1700], 0.3);
      this.pad(t0 + 5.6, [N.A2, N.D3, N.E3], 0.6, S * 0.075, [1200, 2000], 0.2, 0.2);
      this.pad(t0 + 6.2, [N.A2, N.Cs3, N.E3], 0.6, S * 0.08, [1500, 2400], 0.1, 0.25);
      // the reveal: D major, full and warm, then a long settle
      this.pad(t0 + 6.8, [N.D2, N.D3, N.Fs3, N.A3, N.D4], 1.9, S * 0.075, [2600, 1400], 0.08, 1.6, 0.55);
      // pulse: a low heartbeat that builds
      for (let i = 0; i < 24; i++) {
        const tt = t0 + 0.8 + i * 0.25;
        const lv = 0.04 + (i / 24) * 0.1;
        this.tone({ t: tt, f: i % 4 === 3 ? N.A2 : N.D2 * 2, type: "triangle", gain: S * lv, a: 0.004, d: 0.17 });
      }
      // timpani on the cuts
      for (const [at, lv] of [[2.4, 0.22], [4.0, 0.26], [5.6, 0.3], [6.2, 0.2], [6.8, 0.42]] as const)
        this.timpani(t0 + at, N.D2, S * lv);
      // horn melody, rising to the major third at the reveal
      const line: [number, number, number][] = [
        [1.6, N.A3, 0.75], [2.4, N.D4, 0.75], [3.2, N.E4, 0.75], [4.0, N.F4, 0.75],
        [4.8, N.G4, 0.75], [5.6, N.A4, 0.55], [6.2, N.G4, 0.55], [6.8, N.Fs4, 1.9],
      ];
      for (const [at, f, d] of line) this.horn(t0 + at, f, d, S * 0.07);
      // cymbal swell into the reveal, a soft crash on it
      this.noise({ t: t0 + 5.7, type: "highpass", f: 5000, to: 7000, gain: S * 0.09, a: 1.08, d: 0.04 });
      this.noise({ t: t0 + 6.8, type: "highpass", f: 4200, gain: S * 0.08, a: 0.01, d: 1.6, send: 0.5 });
      if (this.shimmer) this.metal(t0 + 6.85, 3600, SFX.SHIMMER_VOLUME * 0.35, 1.2, 0.6);
    } finally {
      this.route = null;
    }
    let stopped = false;
    const end = t0 + 10.5;
    const cleanup = window.setTimeout(() => fader.disconnect(), (end - ctx.currentTime) * 1000 + 500);
    return () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      fader.gain.cancelScheduledValues(now);
      fader.gain.setValueAtTime(fader.gain.value, now);
      fader.gain.setTargetAtTime(0.0001, now, 0.25);
      window.clearTimeout(cleanup);
      window.setTimeout(() => fader.disconnect(), 2000);
    };
  }

  /** Console preview: plays a short phrase with the given settings. */
  preview(s: SoundSettings) {
    const prev = this.salon;
    const guest = this.guestOn;
    this.guestOn = true; // the console always previews, even if this device muted the site
    this.applySalon(s);
    this.unlock();
    this.play("ui_service_select");
    this.play("ui_time_select", { delay: 0.45 });
    window.setTimeout(() => {
      this.guestOn = guest;
      if (JSON.stringify(this.salon) === JSON.stringify(s)) this.applySalon(prev);
      else this.syncLevels();
    }, 1400);
  }
}

/** The one shared sound manager. */
export const sfx = new SoundEngine();
