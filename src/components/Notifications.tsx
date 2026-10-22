import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { notify, type ToastKind } from '../ui/notify.ts';

const STYLE: Record<ToastKind, { box: string; icon: React.ReactNode }> = {
  success: { box: 'border-emerald-700/60 text-emerald-100', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> },
  error: { box: 'border-red-700/60 text-red-100', icon: <CircleAlert className="w-4 h-4 text-red-400 shrink-0" /> },
  info: { box: 'border-[#3e342b] text-stone-200', icon: <Info className="w-4 h-4 text-amber-400 shrink-0" /> },
};

/** Toast stack (bottom right) and the confirmation dialog. Mounted once in App. */
export const Notifications: React.FC = () => {
  const toasts = useSyncExternalStore(notify.subscribe, notify.getToasts, notify.getToasts);
  const confirm = useSyncExternalStore(notify.subscribe, notify.getConfirm, notify.getConfirm);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    confirmButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') confirm.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);

  return (
    <>
      <div className="fixed bottom-16 right-4 z-[60] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2.5 rounded-xl border bg-[#1c1a1a]/95 backdrop-blur px-3 py-2.5 text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-2 ${STYLE[t.kind].box}`}
          >
            {STYLE[t.kind].icon}
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button onClick={() => notify.dismiss(t.id)} className="text-stone-500 hover:text-stone-200" aria-label="Fechar aviso">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => confirm.resolve(false)}
        >
          <div
            className="w-full max-w-md modal-panel p-5 shadow-2xl text-stone-200"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-sm font-semibold text-stone-100">
              {confirm.title}
            </h3>
            <p className="mt-2 text-xs text-stone-400 leading-relaxed">{confirm.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => confirm.resolve(false)}
                className="px-3 py-1.5 rounded-lg border border-[#3e3832] bg-[#23201e] text-xs text-stone-300 hover:text-stone-100"
              >
                Cancelar
              </button>
              <button
                ref={confirmButton}
                onClick={() => confirm.resolve(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  confirm.danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                }`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
