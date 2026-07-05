import type * as ToneNS from 'tone';
import type { ShapeClass } from './classify';

export type PaletteId = 'A' | 'B';

// Per-shape instruments. Percussion (triangle) is unpitched; the rest take a note.
type ShapeInstruments = Record<
  ShapeClass,
  { triggerAttackRelease: (...args: never[]) => unknown }
>;

let Tone: typeof ToneNS | null = null;
// Built lazily per palette — most users only ever hear palette A, so palette B's
// five synth nodes aren't allocated in the Web Audio graph until first used.
const engines: Partial<Record<PaletteId, ShapeInstruments>> = {};

function buildPalette(mod: typeof ToneNS, palette: PaletteId): ShapeInstruments {
  if (palette === 'A') {
    return {
      line: new mod.PolySynth(mod.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { release: 0.6 },
      }).toDestination(),
      freeform: new mod.PolySynth(mod.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { release: 0.5 },
      }).toDestination(),
      circle: new mod.PolySynth(mod.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.1, release: 0.8 },
      }).toDestination(),
      square: new mod.PolySynth(mod.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.2, release: 0.1 },
      }).toDestination(),
      triangle: new mod.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.005, decay: 0.08, sustain: 0 },
      }).toDestination(),
    } as unknown as ShapeInstruments;
  }
  return {
    line: new mod.PolySynth(mod.FMSynth, {
      modulationIndex: 3,
      envelope: { release: 0.4 },
    }).toDestination(),
    freeform: new mod.PolySynth(mod.FMSynth, {
      envelope: { release: 0.4 },
    }).toDestination(),
    circle: new mod.PolySynth(mod.AMSynth, {
      harmonicity: 2,
      envelope: { attack: 0.1, release: 1 },
    }).toDestination(),
    square: new mod.PolySynth(mod.Synth, {
      oscillator: { type: 'pulse' },
      envelope: { attack: 0.01, release: 0.1 },
    }).toDestination(),
    triangle: new mod.MembraneSynth({
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
    }).toDestination(),
  } as unknown as ShapeInstruments;
}

/** Get (building on first use) the instruments for a palette. */
function instrumentsFor(palette: PaletteId): ShapeInstruments | null {
  if (!Tone) return null;
  let kit = engines[palette];
  if (!kit) {
    kit = buildPalette(Tone, palette);
    engines[palette] = kit;
  }
  return kit;
}

/**
 * Lazily import Tone.js and build the default palette (A). Idempotent. Does NOT
 * start the audio context (must happen in a user gesture — see
 * startAudioContext).
 */
export async function loadAudioEngine(): Promise<void> {
  if (Tone) return;
  const mod = await import('tone');
  Tone = mod;
  instrumentsFor('A');
}

/** Resume the audio context. Call from inside a user-gesture handler. */
export function startAudioContext(): void {
  if (Tone && Tone.context.state !== 'running') {
    void Tone.start();
  }
}

/* ─── Learning Mode: velocity audio-braking ──────────────────────────────────
 * A single sustained oscillator whose pitch/timbre is modulated continuously by
 * how fast the user is drawing — a clean tone at a comfortable pace that flattens
 * and roughens as the stroke gets too fast. One held note (ramped), never a
 * per-sample retrigger, so it reads as smooth "braking", not a stutter of notes.
 */
let brakeSynth: { synth: ToneNS.Synth; playing: boolean } | null = null;
const BRAKE_BASE_FREQ = 440; // A4 at a comfortable pace

function ensureBrakeSynth(): { synth: ToneNS.Synth; playing: boolean } | null {
  if (!Tone) return null;
  if (!brakeSynth) {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.1, sustain: 1, release: 0.25 },
    }).toDestination();
    synth.volume.value = -14;
    brakeSynth = { synth, playing: false };
  }
  return brakeSynth;
}

/**
 * Modulate the braking tone for a given 0–1 intensity (0 = comfortable pace,
 * 1 = too fast). Starts the held note on first call of a stroke and ramps its
 * detune/timbre thereafter. No-op until the engine has loaded.
 */
export function updateBrakeTone(intensity: number): void {
  const b = ensureBrakeSynth();
  if (!b || !Tone) return;
  // Flatten downward and roughen as speed increases.
  const detune = -intensity * 180; // cents
  b.synth.oscillator.type = intensity > 0.5 ? 'triangle' : 'sine';
  b.synth.detune.rampTo(detune, 0.05);
  if (!b.playing) {
    b.synth.triggerAttack(BRAKE_BASE_FREQ, Tone.now());
    b.playing = true;
  }
}

/** Release the braking tone at stroke end. No-op if not sounding. */
export function releaseBrakeTone(): void {
  if (!brakeSynth || !brakeSynth.playing || !Tone) return;
  brakeSynth.synth.triggerRelease(Tone.now());
  brakeSynth.playing = false;
}

/** Dispose the braking synth (on Learning Mode off). */
export function disposeBrakeTone(): void {
  brakeSynth?.synth.dispose();
  brakeSynth = null;
}

/**
 * A short rising arpeggio played when the mode is entered — the inviting
 * "welcome" sound. No-op if the engine hasn't loaded.
 */
export function playWelcomeFlourish(palette: PaletteId): void {
  const kit = instrumentsFor(palette);
  if (!kit || !Tone) return;
  const inst = kit.circle as {
    triggerAttackRelease: (note: string, dur: string, time?: number) => unknown;
  };
  const now = Tone.now();
  const chord = ['C4', 'E4', 'G4', 'C5'];
  chord.forEach((note, i) => {
    inst.triggerAttackRelease(note, '8n', now + i * 0.12);
  });
}

/** Play one shape's note. No-op if the engine hasn't finished loading. */
export function playShapeSound(
  shape: ShapeClass,
  note: string,
  palette: PaletteId,
): void {
  const kit = instrumentsFor(palette);
  if (!kit) return;
  const inst = kit[shape] ?? kit.line;
  if (shape === 'triangle') {
    (inst.triggerAttackRelease as (dur: string) => unknown)('16n');
  } else {
    (inst.triggerAttackRelease as (note: string, dur: string) => unknown)(note, '8n');
  }
}
