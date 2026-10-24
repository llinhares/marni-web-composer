import React from 'react';

/** Marks a feature that is still being refined. */
export const BetaBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center px-1.5 py-px rounded border border-sky-500/50 bg-sky-500/15 text-sky-300 text-[9px] font-bold uppercase tracking-wider leading-tight ${className}`}
    title="Recurso em versão beta: os resultados ainda podem precisar de ajustes"
  >
    Beta
  </span>
);
