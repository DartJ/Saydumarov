class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public volume = 0.6;

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.18,
    endFreq?: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    const peak = Math.max(0.001, gainPeak * this.volume);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public click() {
    this.playTone(540, 0.045, 'triangle', 0.12, 340);
  }

  public movePiece() {
    this.playTone(220, 0.065, 'triangle', 0.2, 110);
  }

  public capturePiece() {
    this.playTone(170, 0.1, 'sawtooth', 0.18, 65);
    this.playTone(320, 0.06, 'triangle', 0.14, 140);
  }

  public checkAlert() {
    this.playTone(660, 0.12, 'sine', 0.18, 880);
  }

  public winFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 0.2, 'triangle', 0.16), i * 85);
    });
  }

  public loseTone() {
    this.playTone(280, 0.22, 'sawtooth', 0.14, 120);
    setTimeout(() => this.playTone(170, 0.28, 'sawtooth', 0.14, 75), 140);
  }

  public mineReveal() {
    this.playTone(460, 0.035, 'sine', 0.09, 620);
  }

  public mineFlag() {
    this.playTone(720, 0.05, 'square', 0.07, 540);
  }

  public billiardHit(strength = 0.6) {
    const s = Math.min(1, Math.max(0.15, strength));
    this.playTone(1100 + s * 400, 0.045, 'triangle', 0.22 * s, 280);
  }

  public billiardRail(strength = 0.4) {
    const s = Math.min(1, Math.max(0.12, strength));
    this.playTone(160, 0.06, 'sine', 0.18 * s, 70);
  }

  public billiardPocket() {
    this.playTone(260, 0.14, 'triangle', 0.2, 120);
    setTimeout(() => this.playTone(420, 0.12, 'sine', 0.12, 220), 60);
  }

  public carCrash(intensity = 0.6) {
    const s = Math.min(1, Math.max(0.2, intensity));
    this.playTone(130, 0.18, 'sawtooth', 0.22 * s, 45);
    this.playTone(90, 0.22, 'square', 0.14 * s, 32);
  }

  public carHorn() {
    this.playTone(392, 0.16, 'sawtooth', 0.11, 390);
    this.playTone(493.88, 0.16, 'sawtooth', 0.09, 490);
  }

  public cashPickup() {
    this.playTone(660, 0.09, 'triangle', 0.16, 880);
    setTimeout(() => this.playTone(987.77, 0.14, 'triangle', 0.16, 1318.5), 75);
  }

  public gunshot(kind: 'knife' | 'usp' | 'ak47' | 'm4a1' | 'awp') {
    if (kind === 'knife') {
      this.playTone(420, 0.08, 'triangle', 0.1, 160);
      return;
    }
    if (kind === 'awp') {
      this.playTone(190, 0.26, 'sawtooth', 0.28, 38);
      this.playTone(680, 0.08, 'square', 0.18, 95);
      return;
    }
    if (kind === 'ak47') {
      this.playTone(230, 0.11, 'sawtooth', 0.21, 55);
      this.playTone(520, 0.045, 'square', 0.12, 130);
      return;
    }
    if (kind === 'm4a1') {
      this.playTone(310, 0.085, 'triangle', 0.16, 75);
      this.playTone(620, 0.04, 'sine', 0.1, 180);
      return;
    }
    // usp silenced crisp snap
    this.playTone(390, 0.06, 'triangle', 0.14, 110);
  }

  public reloadClick() {
    this.playTone(620, 0.04, 'square', 0.08, 420);
    setTimeout(() => this.playTone(820, 0.05, 'triangle', 0.1, 640), 120);
  }

  public headshotPing() {
    this.playTone(1480, 0.08, 'sine', 0.22, 1980);
  }

  public bombBeep(urgent = false) {
    this.playTone(urgent ? 1320 : 1040, 0.07, 'square', 0.12);
  }
}

export const soundFX = new SoundEngine();
