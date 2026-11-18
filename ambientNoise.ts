export type NoiseCheckStatus = 'checking' | 'good' | 'noisy' | 'unavailable';

export interface NoiseCheckState {
  status: NoiseCheckStatus;
  sustainedNoisy: boolean;
}

interface MeterRecorder {
  readonly isRecording: boolean;
  readonly uri: string | null;
  prepareToRecordAsync(): Promise<unknown>;
  record(): void;
  stop(): Promise<unknown>;
  getStatus(): { isRecording: boolean; metering?: number };
}

const NOISY_THRESHOLD_DB = -25;
const WARM_UP_MS = 1_000;
const SUSTAINED_NOISY_MS = 2_000;
const SAMPLE_TIMEOUT_MS = 10_000;

// Serialize native prepare/stop calls. Android must not stop a recorder
// while prepare is in flight, even when the user leaves during startup.
export class AmbientNoiseSampler {
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private sampling = false;
  private prepared = false;
  private requestedAt = 0;
  private startedAt: number | null = null;
  private noisySince: number | null = null;
  private state: NoiseCheckState = { status: 'checking', sustainedNoisy: false };

  constructor(
    private readonly recorder: MeterRecorder,
    private readonly options: {
      requestPermission: () => Promise<{ granted: boolean }>;
      configure: () => Promise<void>;
      deleteFile: (uri: string) => void;
      onState: (state: NoiseCheckState) => void;
      now?: () => number;
    },
  ) {}

  private now() { return this.options.now?.() ?? Date.now(); }

  private publish(status: NoiseCheckStatus, sustainedNoisy = false) {
    if (this.state.status === status && this.state.sustainedNoisy === sustainedNoisy) return;
    this.state = { status, sustainedNoisy };
    this.options.onState(this.state);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.catch(() => {}).then(task);
    this.queue = next;
    return next;
  }

  start(): Promise<void> {
    const generation = ++this.generation;
    this.sampling = false;
    this.startedAt = null;
    this.noisySince = null;
    this.requestedAt = this.now();
    this.publish('checking');
    return this.enqueue(async () => {
      if (generation !== this.generation) return;
      try {
        const { granted } = await this.options.requestPermission();
        if (generation !== this.generation) return;
        if (!granted) throw new Error('Microphone permission unavailable');
        await this.options.configure();
        if (generation !== this.generation) return;
        await this.recorder.prepareToRecordAsync();
        this.prepared = true;
        if (generation !== this.generation) return;
        this.recorder.record();
        this.sampling = true;
      } catch (error) {
        if (generation === this.generation) this.publish('unavailable');
        console.warn('[ambient-noise] failed to start sampling', error);
      } finally {
        if (!this.sampling || generation !== this.generation) await this.cleanup();
      }
    });
  }

  stop(): Promise<void> {
    ++this.generation;
    this.sampling = false;
    return this.enqueue(() => this.cleanup());
  }

  private async cleanup() {
    // Native getters can throw synchronously after automatic hook release.
    const uri = this.recorder.uri;
    // Android must also release a prepared-but-cancelled recorder, or the
    // next question fails with AudioRecorderAlreadyPreparedException.
    if (this.prepared || this.recorder.isRecording) await this.recorder.stop();
    this.prepared = false;
    if (uri) {
      try { this.options.deleteFile(uri); }
      catch (error) { console.warn('[ambient-noise] temporary file cleanup failed', error); }
    }
  }

  sample() {
    if (this.state.status === 'unavailable') return;
    try {
      const status = this.sampling ? this.recorder.getStatus() : null;
      const metering = status?.metering;
      if (!status?.isRecording || metering == null || !Number.isFinite(metering)) {
        if (this.now() - this.requestedAt >= SAMPLE_TIMEOUT_MS) this.publish('unavailable');
        return;
      }
      const now = this.now();
      if (this.startedAt == null) this.startedAt = now;
      if (now - this.startedAt < WARM_UP_MS) return;
      const noisy = metering > NOISY_THRESHOLD_DB;
      this.noisySince = noisy ? this.noisySince ?? now : null;
      this.publish(noisy ? 'noisy' : 'good',
        this.noisySince != null && now - this.noisySince >= SUSTAINED_NOISY_MS);
    } catch (error) {
      this.publish('unavailable');
      console.warn('[ambient-noise] metering failed', error);
    }
  }
}
