import type * as ToneNS from 'tone';
import type { ShapeClass } from './classify';

export type PaletteId = 'A' | 'B';

// Per-shape instruments. Percussion (triangle) is unpitched; the rest take a note.
type ShapeInstruments = Record<
  ShapeClass,
  { triggerAttackRelease: (...args: never[]) => unknown }
>;

let Tone: typeof ToneNS | null = null;
let engines: Record<PaletteId, ShapeInstruments> | null = null;

/**
 * Lazily import Tone.js and build both instrument palettes. Idempotent. Does
 * NOT start the audio context (must happen in a user gesture — see
 * startAudioContext).
 */
export async function loadAudioEngine(): Promise<void> {
  if (Tone) return;
  const mod = await import('tone');
  Tone = mod;

  engines = {
    A: {
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
    } as unknown as ShapeInstruments,
    B: {
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
    } as unknown as ShapeInstruments,
  };
}

/** Resume the audio context. Call from inside a user-gesture handler. */
export function startAudioContext(): void {
  if (Tone && Tone.context.state !== 'running') {
    void Tone.start();
  }
}

/**
 * A short rising arpeggio played when the mode is entered — the inviting
 * "welcome" sound. No-op if the engine hasn't loaded.
 */
export function playWelcomeFlourish(palette: PaletteId): void {
  if (!engines || !Tone) return;
  const inst = engines[palette].circle as {
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
  if (!engines) return;
  const inst = engines[palette][shape] ?? engines[palette].line;
  if (shape === 'triangle') {
    (inst.triggerAttackRelease as (dur: string) => unknown)('16n');
  } else {
    (inst.triggerAttackRelease as (note: string, dur: string) => unknown)(note, '8n');
  }
}
