import { GauntletId, SpellType } from '../types/game';

type SfxKey = 'laser' | 'explosion' | 'shield' | 'ping';

const SFX_PATHS: Record<SfxKey, string> = {
  laser: '/assets/sfx/laser.ogg',
  explosion: '/assets/sfx/explosion.ogg',
  shield: '/assets/sfx/shield.ogg',
  ping: '/assets/sfx/ping.mp3',
};

export class ArcaneAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<SfxKey, AudioBuffer>();
  private loadingStarted = false;
  private muted = false;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.34;
    this.masterGain.connect(this.ctx.destination);

    if (!this.loadingStarted) {
      this.loadingStarted = true;
      void this.preloadBuffers();
    }
  }

  private async preloadBuffers(): Promise<void> {
    if (!this.ctx) return;
    const entries = Object.entries(SFX_PATHS) as Array<[SfxKey, string]>;
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          if (!this.ctx) return;
          const decoded = await this.ctx.decodeAudioData(arr);
          this.buffers.set(key, decoded);
        } catch {
          // Graceful fallback to pure Web Audio synth if format/decode unavailable
        }
      }),
    );
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.34,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playBuffer(key: SfxKey, rate = 1.0, volume = 0.45): boolean {
    if (!this.ctx || !this.masterGain || this.muted) return false;
    const buffer = this.buffers.get(key);
    if (!buffer) return false;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
    return true;
  }

  public playSpell(spell: SpellType, gauntlet: GauntletId = 'arcane'): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const gauntletPitch =
      gauntlet === 'iron_man'
        ? 1.25
        : gauntlet === 'doctor_strange'
          ? 1.05
          : gauntlet === 'doctor_doom'
            ? 0.82
            : gauntlet === 'thanos'
              ? 0.68
              : 1.0;

    switch (spell) {
      case 'astral_bolt': {
        this.playBuffer('laser', gauntletPitch, gauntlet === 'iron_man' ? 0.55 : 0.32);
        this.playTone(680 * gauntletPitch, 1180 * gauntletPitch, 0.13, 'triangle', 0.2, now);
        break;
      }
      case 'twin_starfire': {
        this.playBuffer('laser', gauntletPitch * 1.15, 0.36);
        this.playTone(540, 960, 0.16, 'sine', 0.22, now);
        this.playTone(720, 1280, 0.18, 'triangle', 0.2, now + 0.06);
        break;
      }
      case 'solar_shockwave': {
        this.playBuffer('shield', gauntletPitch, 0.48);
        this.playTone(220, 75, 0.36, 'sawtooth', 0.22, now);
        this.playTone(440, 880, 0.26, 'sine', 0.2, now);
        break;
      }
      case 'meteor_hammer': {
        this.playBuffer('explosion', 0.85 * gauntletPitch, 0.52);
        this.playTone(140, 48, 0.48, 'sawtooth', 0.3, now);
        break;
      }
      case 'sanctum_mend': {
        this.playBuffer('ping', 1.25, 0.38);
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          this.playTone(freq, freq * 1.02, 0.32, 'sine', 0.16, now + idx * 0.055);
        });
        break;
      }
      case 'cataclysm_convergence': {
        this.playBuffer('explosion', 0.65, 0.65);
        this.playBuffer('shield', 0.75, 0.45);
        [220, 329.63, 440, 659.25, 880].forEach((freq, idx) => {
          this.playTone(freq, freq * 1.4, 0.55, 'triangle', 0.18, now + idx * 0.04);
        });
        break;
      }
      case 'aegis_ward': {
        this.playBuffer('shield', 1.1, 0.4);
        this.playTone(392, 587.33, 0.22, 'sine', 0.18, now);
        break;
      }
      case 'telekinetic_lock': {
        this.playTone(480, 620, 0.14, 'sine', 0.14, now);
        break;
      }
    }
  }

  public playImpact(heavy = false): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (heavy) {
      this.playBuffer('explosion', 0.95, 0.55);
      this.playTone(130, 38, 0.32, 'sawtooth', 0.28, now);
    } else {
      this.playBuffer('ping', 0.72, 0.28);
      this.playTone(380, 150, 0.12, 'triangle', 0.16, now);
    }
  }

  public playParry(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.playBuffer('shield', 1.35, 0.52);
    this.playTone(880, 1320, 0.22, 'sine', 0.22, now);
    this.playTone(1320, 1760, 0.26, 'triangle', 0.16, now + 0.03);
  }

  public playPlayerDamage(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.playBuffer('explosion', 1.25, 0.45);
    this.playTone(170, 58, 0.28, 'sawtooth', 0.28, now);
  }

  public playWaveClear(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.playBuffer('ping', 1.4, 0.32);
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      this.playTone(n, n, 0.38, 'triangle', 0.18, now + idx * 0.08);
    });
  }

  private playTone(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFreq),
      startTime + duration,
    );

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.buffers.clear();
    }
  }
}
