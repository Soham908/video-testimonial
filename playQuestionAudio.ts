import type { AudioPlayer, AudioStatus } from 'expo-audio';

// Resolve only after native completion. On cancellation/failure, pause and
// remove listeners before the caller is allowed to start the countdown.
export async function playQuestionAudio(player: AudioPlayer, signal: AbortSignal): Promise<void> {
  const aborted = () => new Error('Question playback cancelled');
  if (signal.aborted) throw aborted();

  const wait = (
    done: ((status: AudioStatus) => boolean) | null,
    action: () => void | Promise<void>,
    timeoutMs: number,
    inspectCurrent = false,
  ) => new Promise<void>((resolve, reject) => {
    let settled = false;
    let subscription: { remove(): void } | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription?.remove();
      signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(aborted());
    const timeout = setTimeout(() => finish(new Error('Question audio timed out')), timeoutMs);
    const inspect = (status: AudioStatus) => {
      if (status.error) finish(new Error(status.error));
      else if (done?.(status)) finish();
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (done) subscription = player.addListener('playbackStatusUpdate', inspect);
      if (signal.aborted) cancel();
      if (!settled && inspectCurrent) inspect(player.currentStatus);
      if (!settled) Promise.resolve(action()).then(() => {
        if (done == null) finish();
      }, (error) => finish(error instanceof Error ? error : new Error(String(error))));
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });

  try {
    await wait((status) => status.isLoaded, () => {}, 15_000, true);
    await wait(null, () => player.seekTo(0), 15_000);
    await wait((status) => status.didJustFinish, () => player.play(),
      Math.max(30_000, (player.duration + 15) * 1000));
  } finally {
    try { player.pause(); }
    catch (error) {
      if (!signal.aborted) throw error;
      console.warn('[camera-check] VO pause failed after cancellation', error);
    }
  }
}
