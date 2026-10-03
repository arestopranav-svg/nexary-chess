export type SoundId =
  | 'move' | 'capture' | 'check' | 'checkmate' | 'promotion' | 'castle'
  | 'illegal' | 'clock-warning' | 'win' | 'loss' | 'draw';

export interface AudioBackend { play(id: SoundId): void }

let backend: AudioBackend | null = null;

/** AI-2: call once at app start to install the "Kinetic Glass" engine. Callers never change. */
export function registerAudioBackend(b: AudioBackend | null): void { backend = b; }

export function playSound(id: SoundId): void { backend?.play(id); }
