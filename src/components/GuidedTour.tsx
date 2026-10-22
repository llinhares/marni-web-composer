import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { placeTooltip, spotlightRect, TOUR_STEPS, type Rect } from '../ui/tourLayout.ts';

interface GuidedTourProps {
  isOpen: boolean;
  onFinish: () => void;
}

const findTarget = (name: string | undefined): HTMLElement | null => {
  if (!name) return null;
  // The first visible match (some targets exist twice for desktop/mobile layouts)
  return (
    [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null
  );
};

/**
 * Step-by-step coach marks: dims the screen except the highlighted element and explains it.
 * Steps whose element is not on screen (e.g. hidden on small displays) are shown centred.
 */
export const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, onFinish }) => {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ width: 340, height: 190 });
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (isOpen) setIndex(0);
  }, [isOpen]);

  // Track the target element (layout can change: sidebar, resize, fonts loading)
  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const el = findTarget(step.target);
      if (!el) {
        setTarget(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTarget({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const observer = new ResizeObserver(measure);
    if (el) observer.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, step]);

  useLayoutEffect(() => {
    if (!isOpen || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    if (Math.abs(r.width - cardSize.width) > 1 || Math.abs(r.height - cardSize.height) > 1) {
      setCardSize({ width: r.width, height: r.height });
    }
  });

  const next = useCallback(() => (isLast ? onFinish() : setIndex((i) => i + 1)), [isLast, onFinish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Own keyboard handling while open; keys do not reach the editor shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, next, back, onFinish]);

  if (!isOpen) return null;

  const spot = target ? spotlightRect(target, viewport) : null;
  const pos = placeTooltip(spot, cardSize, viewport);

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Click-blocking layer; the spotlight's huge shadow dims everything else */}
      <div className="absolute inset-0" />
      {spot ? (
        <div
          className="absolute rounded-xl ring-2 ring-amber-400 transition-all duration-300 ease-out pointer-events-none"
          style={{ ...spot, boxShadow: '0 0 0 9999px rgba(10, 8, 6, 0.72)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(10,8,6,0.72)]" />
      )}

      <div
        ref={cardRef}
        className="modal-panel absolute w-[min(340px,calc(100vw-24px))] p-4 transition-all duration-300 ease-out"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="modal-title">
            {step.title}
          </h2>
          <button onClick={onFinish} className="modal-close -mt-1 -mr-1" aria-label="Pular tour">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-300 leading-relaxed">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" aria-label={`Passo ${index + 1} de ${TOUR_STEPS.length}`}>
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-amber-400' : 'w-1.5 bg-stone-700'}`} />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {index === 0 ? (
              <button onClick={onFinish} className="px-2.5 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-200">
                Pular
              </button>
            ) : (
              <button
                onClick={back}
                className="px-2.5 py-1.5 rounded-lg border border-[#3e342b] bg-stone-900 text-xs text-stone-300 hover:text-stone-100"
              >
                Voltar
              </button>
            )}
            <button
              onClick={next}
              autoFocus
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold"
            >
              {isLast ? 'Concluir' : index === 0 ? 'Começar' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
