// Sound-design tokens for Hair by Bhargav's interface sounds.
// Every level, envelope and filter value lives here so the whole palette can
// be tuned in one place. Levels are relative: the master volume (set by the
// salon in the console) scales all of them.

export type SoundPreset = "luxury" | "minimal" | "silent";
export type SoundSettings = { enabled: boolean; volume: number; preset: SoundPreset };

/** What a fresh install sounds like: on, quiet, Luxury. */
export const DEFAULT_SOUND: SoundSettings = { enabled: true, volume: 0.2, preset: "luxury" };

export const SFX = {
  /** Default master gain: about 15–25% perceived interface volume. */
  MASTER_VOLUME: 0.2,
  /** Ceiling for the console's volume slider (slider 100% = this gain). */
  MASTER_MAX: 1.2,

  // relative layer levels
  CLICK_VOLUME: 0.34,
  SELECTION_VOLUME: 0.3,
  TRANSITION_VOLUME: 0.26,
  SUCCESS_VOLUME: 0.36,
  ERROR_VOLUME: 0.24,
  SHIMMER_VOLUME: 0.12,
  AMBIENCE_VOLUME: 0.07,
  HOVER_VOLUME: 0.05,

  // envelopes (seconds)
  ATTACK: 0.006,
  CLICK_DECAY: 0.012,
  DECAY: 0.14,
  RELEASE: 0.3,

  // tone shaping
  FILTER_FREQUENCY: 5600, // master low-pass: no layer ever gets brittle
  REVERB_AMOUNT: 0.2, // wet level of the small "studio" room
  REVERB_SECONDS: 1.1,
  REVERB_SECONDS_LITE: 0.6,

  // anti-fatigue
  MIN_GAP_MS: 45, // the same sound never restarts faster than this
  MAX_VOICES: 36, // hard cap on simultaneous nodes
  HOVER_GAP_MS: 650,
  SEARCH_RESULT_GAP_MS: 900,
} as const;

/** D-major pentatonic: the studio's "key". Every tonal layer is drawn from it. */
export const NOTE = {
  A2: 110,
  A3: 220,
  D4: 293.66,
  E4: 329.63,
  Fs4: 369.99,
  A4: 440,
  B4: 493.88,
  D5: 587.33,
  E5: 659.25,
  Fs5: 739.99,
  A5: 880,
  B5: 987.77,
  D6: 1174.66,
  A6: 1760,
  D7: 2349.32,
} as const;

/** Each category gets its own note, so moving through the menu "walks" the scale. */
export const CATEGORY_NOTES = [NOTE.D5, NOTE.E5, NOTE.Fs5, NOTE.A5, NOTE.B5, NOTE.D6, NOTE.E5 * 2];

export const PRESETS: Record<
  SoundPreset,
  { gain: number; reverb: number; shimmer: boolean; tonal: number }
> = {
  // full palette: tactile layer, tonal bloom, metallic shimmer, small room
  luxury: { gain: 1, reverb: 1, shimmer: true, tonal: 1 },
  // tactile clicks with a lighter tonal layer and almost no room
  minimal: { gain: 0.8, reverb: 0.3, shimmer: false, tonal: 0.55 },
  silent: { gain: 0, reverb: 0, shimmer: false, tonal: 0 },
};

/** Deterministic micro-variation (pitch, level) so repeats never sound identical. */
export const VARIATION = {
  PITCH: [0, 0.007, -0.005, 0.003, -0.008, 0.005],
  LEVEL: [0, -0.06, 0.04, -0.03, 0.05],
};
