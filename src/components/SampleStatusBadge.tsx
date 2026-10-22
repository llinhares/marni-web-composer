import React, { useSyncExternalStore } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { InstrumentId } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import { sampleLibrary } from '../audio/sampleLibrary.ts';

/** Shows while the song's sampled instruments are downloading, or when one fell back to the synthesizer. */
export const SampleStatusBadge: React.FC<{ instrumentIds: InstrumentId[] }> = ({ instrumentIds }) => {
  useSyncExternalStore(sampleLibrary.subscribe, sampleLibrary.getVersion, sampleLibrary.getVersion);

  const unique = [...new Set(instrumentIds)];
  const loading = unique.filter((id) => sampleLibrary.getStatus(id) === 'loading');
  const failed = unique.filter((id) => sampleLibrary.getStatus(id) === 'error');
  const name = (id: InstrumentId) => BDO_INSTRUMENTS.find((i) => i.id === id)?.name ?? id;

  if (loading.length > 0) {
    return (
      <span
        className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md bg-stone-900 border border-[#2d2722] text-[10px] text-stone-400"
        title={`Baixando timbres: ${loading.map(name).join(', ')}. Até terminar, toca o sintetizador.`}
        role="status"
      >
        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
        Timbres
      </span>
    );
  }
  if (failed.length > 0) {
    return (
      <span
        className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md bg-stone-900 border border-amber-800/50 text-[10px] text-amber-400/90"
        title={`Não foi possível baixar: ${failed.map(name).join(', ')}. Tocando com o sintetizador (verifique a conexão).`}
        role="status"
      >
        <AlertTriangle className="w-3 h-3" />
        Sintetizador
      </span>
    );
  }
  return null;
};
