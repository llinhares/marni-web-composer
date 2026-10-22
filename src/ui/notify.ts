/**
 * App-wide notifications (toasts) and confirmations, replacing alert()/confirm().
 * Plain module store so non-React code (importers, engine callbacks) can notify too.
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

type Listener = () => void;

export function createNotifyStore() {
  let toasts: Toast[] = [];
  let confirmQueue: ConfirmRequest[] = [];
  let nextId = 1;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const dismiss = (id: number) => {
    toasts = toasts.filter((t) => t.id !== id);
    clearTimeout(timers.get(id));
    timers.delete(id);
    emit();
  };

  const show = (kind: ToastKind, message: string, durationMs = kind === 'error' ? 7000 : 3500) => {
    // The same message shown again just restarts its timer
    const existing = toasts.find((t) => t.message === message && t.kind === kind);
    const id = existing?.id ?? nextId++;
    if (!existing) toasts = [...toasts.slice(-3), { id, kind, message }];
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => dismiss(id), durationMs));
    emit();
    return id;
  };

  return {
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getToasts: () => toasts,
    getConfirm: () => confirmQueue[0] ?? null,
    success: (m: string) => show('success', m),
    error: (m: string) => show('error', m),
    info: (m: string) => show('info', m),
    dismiss,
    confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
      return new Promise((resolve) => {
        const req: ConfirmRequest = {
          id: nextId++,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? 'Confirmar',
          danger: opts.danger ?? false,
          resolve: (ok) => {
            confirmQueue = confirmQueue.filter((r) => r !== req);
            emit();
            resolve(ok);
          },
        };
        confirmQueue = [...confirmQueue, req];
        emit();
      });
    },
  };
}

export const notify = createNotifyStore();

/** Message for an unknown thrown value. */
export const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;
