// Clasificación de estilo de conducción a partir de acelerómetro + giroscopio.
// Heurística simple y documentada, no es un modelo de ML: el acelerómetro de
// expo-sensors devuelve magnitud en g (1g en reposo); nos fijamos en la
// desviación sobre una línea base móvil para tolerar que el móvil no esté
// perfectamente plano. El giroscopio (rad/s en el eje Z) nos dice si el coche
// está girando. No detectamos cambios de carril: no hay sensor fiable para
// eso sin cámara o datos del CAN-bus del coche, así que ese contador se deja
// siempre a 0 en vez de inventar una heurística poco fiable.

export interface AccelSample {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface GyroSample {
  z: number;
  timestamp: number;
}

const HARD_ACCEL_DELTA_G = 0.35;
const HARD_BRAKE_DELTA_G = 0.35;
const SHARP_TURN_RAD_S = 1.2;
const BASELINE_ALPHA = 0.05; // suavizado exponencial de la línea base de gravedad
const EVENT_COOLDOWN_MS = 1500; // evita contar el mismo frenazo varias veces

export class DrivingMetricsTracker {
  private baselineG = 1;
  private lastAccelEventAt = 0;
  private lastTurnEventAt = 0;
  private speedSamples: { speedKmh: number; timestamp: number }[] = [];

  hardAccelerations = 0;
  hardBrakes = 0;
  sharpTurns = 0;
  gForceSeries: { t: number; x: number; y: number; z: number }[] = [];

  private lastSampledAt = 0;

  onSpeedSample(speedKmh: number, timestamp: number) {
    this.speedSamples.push({ speedKmh, timestamp });
    if (this.speedSamples.length > 5) this.speedSamples.shift();
  }

  private isAccelerating(): boolean {
    if (this.speedSamples.length < 2) return false;
    const first = this.speedSamples[0];
    const last = this.speedSamples[this.speedSamples.length - 1];
    return last.speedKmh - first.speedKmh > 3;
  }

  private isBraking(): boolean {
    if (this.speedSamples.length < 2) return false;
    const first = this.speedSamples[0];
    const last = this.speedSamples[this.speedSamples.length - 1];
    return first.speedKmh - last.speedKmh > 3;
  }

  onAccelSample(sample: AccelSample) {
    const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
    this.baselineG = this.baselineG * (1 - BASELINE_ALPHA) + magnitude * BASELINE_ALPHA;
    const delta = magnitude - this.baselineG;

    // Muestreamos la serie de G-force a ~2Hz para no guardar miles de puntos.
    if (sample.timestamp - this.lastSampledAt > 500) {
      this.lastSampledAt = sample.timestamp;
      this.gForceSeries.push({ t: sample.timestamp, x: sample.x, y: sample.y, z: sample.z });
    }

    if (sample.timestamp - this.lastAccelEventAt < EVENT_COOLDOWN_MS) return;

    if (delta > HARD_ACCEL_DELTA_G && this.isAccelerating()) {
      this.hardAccelerations += 1;
      this.lastAccelEventAt = sample.timestamp;
    } else if (delta < -HARD_BRAKE_DELTA_G && this.isBraking()) {
      this.hardBrakes += 1;
      this.lastAccelEventAt = sample.timestamp;
    }
  }

  onGyroSample(sample: GyroSample) {
    if (sample.timestamp - this.lastTurnEventAt < EVENT_COOLDOWN_MS) return;
    if (Math.abs(sample.z) > SHARP_TURN_RAD_S) {
      this.sharpTurns += 1;
      this.lastTurnEventAt = sample.timestamp;
    }
  }

  reset() {
    this.baselineG = 1;
    this.lastAccelEventAt = 0;
    this.lastTurnEventAt = 0;
    this.speedSamples = [];
    this.hardAccelerations = 0;
    this.hardBrakes = 0;
    this.sharpTurns = 0;
    this.gForceSeries = [];
    this.lastSampledAt = 0;
  }
}
