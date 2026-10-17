/**
 * High-Precision Worker Timer for DAW Audio Scheduling
 * Uses a dedicated background Worker thread to prevent timer throttling and jitter.
 */

export class WorkerTimer {
  private worker: Worker | null = null;
  private intervalMs: number = 20;
  private onTickCallback: (() => void) | null = null;
  private isRunning: boolean = false;

  constructor(intervalMs: number = 20) {
    this.intervalMs = intervalMs;
    this.initWorker();
  }

  private initWorker() {
    // Inline worker code created as Blob URL so no separate build step or asset loading needed
    const workerCode = `
      let timerId = null;
      let interval = ${this.intervalMs};

      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timerId !== null) clearInterval(timerId);
          timerId = setInterval(() => {
            self.postMessage('tick');
          }, interval);
        } else if (e.data === 'stop') {
          if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
          }
        } else if (e.data && e.data.interval) {
          interval = e.data.interval;
          if (timerId !== null) {
            clearInterval(timerId);
            timerId = setInterval(() => {
              self.postMessage('tick');
            }, interval);
          }
        }
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);
      this.worker.onmessage = (e) => {
        if (e.data === 'tick' && this.onTickCallback && this.isRunning) {
          this.onTickCallback();
        }
      };
    } catch {
      // Fallback for environments where Worker is restricted
      this.worker = null;
    }
  }

  public start(callback: () => void) {
    this.onTickCallback = callback;
    this.isRunning = true;
    if (this.worker) {
      this.worker.postMessage('start');
    } else {
      // Fallback with setInterval
      const id = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(id);
          return;
        }
        callback();
      }, this.intervalMs);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.worker) {
      this.worker.postMessage('stop');
    }
  }

  public destroy() {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
