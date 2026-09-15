// Cronometra salidas desde parado (0-50 y 0-100 km/h) con la velocidad Doppler
// del GPS a 1 Hz. Interpolar el instante exacto en que se cruza cada umbral
// entre dos lecturas da tiempos con un margen de unas décimas: vale como marca
// personal, no como medición homologada.

const START_KMH = 2;
const ABORT_DROP_KMH = 8;
const MAX_RUN_MS = 30_000;
const MAX_SAMPLE_GAP_MS = 2_500;
const MIN_PLAUSIBLE_SECONDS = { 50: 1.0, 100: 2.0 } as const;

interface Sample {
  speedKmh: number;
  t: number;
}

function crossingTime(a: Sample, b: Sample, targetKmh: number): number {
  if (b.speedKmh === a.speedKmh) return b.t;
  return a.t + ((targetKmh - a.speedKmh) / (b.speedKmh - a.speedKmh)) * (b.t - a.t);
}

export class LaunchTimer {
  private prev: Sample | null = null;
  private state: 'idle' | 'armed' | 'running' = 'idle';
  private runStartedAt = 0;
  private peakKmh = 0;

  best0to50: number | null = null;
  best0to100: number | null = null;

  onSpeedSample(speedKmh: number, t: number) {
    const cur = { speedKmh, t };
    const prev = this.prev;
    this.prev = cur;

    if (!prev || t - prev.t > MAX_SAMPLE_GAP_MS) {
      this.state = speedKmh < START_KMH ? 'armed' : 'idle';
      return;
    }

    if (speedKmh < START_KMH) {
      this.state = 'armed';
      return;
    }

    if (this.state === 'armed') {
      this.state = 'running';
      this.runStartedAt = crossingTime(prev, cur, START_KMH);
      this.peakKmh = speedKmh;
    }
    if (this.state !== 'running') return;

    // Lifting off, braking or a very slow build-up isn't a launch attempt.
    if (t - this.runStartedAt > MAX_RUN_MS || speedKmh < this.peakKmh - ABORT_DROP_KMH) {
      this.state = 'idle';
      return;
    }
    this.peakKmh = Math.max(this.peakKmh, speedKmh);

    if (prev.speedKmh < 50 && speedKmh >= 50) this.record(50, crossingTime(prev, cur, 50));
    if (prev.speedKmh < 100 && speedKmh >= 100) {
      this.record(100, crossingTime(prev, cur, 100));
      this.state = 'idle';
    }
  }

  private record(target: 50 | 100, crossedAt: number) {
    const seconds = (crossedAt - this.runStartedAt) / 1000;
    if (seconds < MIN_PLAUSIBLE_SECONDS[target]) return;
    const rounded = Math.round(seconds * 100) / 100;
    if (target === 50) this.best0to50 = this.best0to50 == null ? rounded : Math.min(this.best0to50, rounded);
    else this.best0to100 = this.best0to100 == null ? rounded : Math.min(this.best0to100, rounded);
  }

  reset() {
    this.prev = null;
    this.state = 'idle';
    this.runStartedAt = 0;
    this.peakKmh = 0;
    this.best0to50 = null;
    this.best0to100 = null;
  }
}

export function formatLaunchTime(seconds: number | null | undefined): string {
  return seconds == null ? '—' : `${seconds.toFixed(1)} s`;
}
