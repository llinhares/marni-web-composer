import { useState, useRef, useEffect } from 'react';
import { X, Upload, AudioWaveform } from 'lucide-react';
import { useComposerStore } from '@/store/useComposerStore';
import { exportToBdo, decryptOwnerHeader, FULL_BDO_INSTRUMENTS, getDefaultBdoInstrument, BDO_PERCUSSION_IDS } from '@/utils/bdoExport';
import type { ExportOptions } from '@/utils/bdoExport';

interface BdoExportModalProps {
  onClose: () => void;
}

export function BdoExportModal({ onClose }: BdoExportModalProps) {
  const { song, tracks, effectorSettings } = useComposerStore();

  const [charName, setCharName] = useState('MIDI');
  const [ownerId, setOwnerId] = useState('0');
  const [transpose, setTranspose] = useState('0');
  
  const [velMode, setVelMode] = useState<'layered' | 'stepped' | 'rescale' | 'floor' | 'off'>('layered');
  const [stepBase, setStepBase] = useState('100');
  const [stepStep, setStepStep] = useState('5');
  const [rescaleMin, setRescaleMin] = useState('80');
  const [rescaleMax, setRescaleMax] = useState('127');
  const [floorVal, setFloorVal] = useState('100');
  const [maxChunkNotes, setMaxChunkNotes] = useState('730');
  const [idStatus, setIdStatus] = useState('Selecione um arquivo .bms');

  const [instOverrides, setInstOverrides] = useState<Record<string, string>>({});
  const [velScales, setVelScales] = useState<Record<string, number>>({});
  const [mergeTarget, setMergeTarget] = useState<string>('Florchestra Piano');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bdoInstrumentNames = Object.keys(FULL_BDO_INSTRUMENTS);

  useEffect(() => {
    const initialOverrides: Record<string, string> = {};
    const initialScales: Record<string, number> = {};
    tracks.forEach(t => {
      initialOverrides[t.id] = getDefaultBdoInstrument(t.instrument);
      initialScales[t.id] = 100;
    });
    setInstOverrides(initialOverrides);
    setVelScales(initialScales);
  }, [tracks]);

  const handleMergeAll = () => {
    const newOverrides = { ...instOverrides };
    tracks.forEach(t => {
      const currentInstId = FULL_BDO_INSTRUMENTS[newOverrides[t.id]];
      if (!BDO_PERCUSSION_IDS.includes(currentInstId)) newOverrides[t.id] = mergeTarget;
    });
    setInstOverrides(newOverrides);
  };

  const handleExtractId = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const view = new DataView(buffer);
      const version = view.getUint32(0, true);
      
      if (version !== 9 && version !== 8) throw new Error("Versão inválida.");
      
      const payload = new Uint8Array(buffer, 4);
      const decrypted = decryptOwnerHeader(payload);
      
      const extractedId = new DataView(decrypted.buffer).getUint32(decrypted.byteOffset, true);
      
      let extractedName = "";
      for (let i = 8; i < 8 + 62; i += 2) {
        const charCode = decrypted[i] | (decrypted[i + 1] << 8);
        if (charCode === 0) break;
        extractedName += String.fromCharCode(charCode);
      }

      setOwnerId(extractedId.toString());
      setCharName(extractedName || 'MIDI');
      setIdStatus(`0x${extractedId.toString(16)} (${extractedName})`);
    } catch (err: any) {
      setIdStatus(`Erro de leitura.`);
    }
  };

  const handleExport = () => {
    if (!song.title.trim()) {
      alert("Defina o título da música no rodapé antes de exportar.");
      return;
    }

    const options: ExportOptions = {
      charName, ownerId: parseInt(ownerId) || 0, transpose: parseInt(transpose) || 0,
      velMode, velStepBase: parseInt(stepBase) || 100, velStepStep: parseInt(stepStep) || 5,
      velRescaleMin: parseInt(rescaleMin) || 80, velRescaleMax: parseInt(rescaleMax) || 127,
      velFloorVal: parseInt(floorVal) || 100, instrumentOverrides: instOverrides,
      velocityScales: velScales, effector: effectorSettings,
      maxChunkNotes: parseInt(maxChunkNotes) || 730
    };

    const blob = exportToBdo(tracks, song, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = song.title.trim();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };

  const inputClass = "rounded-sm border border-[#3E3832] bg-[#1C1A1A] px-3 py-1.5 text-xs text-[#E0D4C8] outline-none min-w-0 focus:border-[#D4AB6A] transition-colors";
  const labelClass = "text-xs text-[#8B847A] text-left sm:text-right sm:pr-3";
  const btnClass = "flex items-center justify-center gap-2 rounded-sm border border-[#3E3832] bg-[#23201E] px-4 py-1.5 text-xs font-medium text-[#E0D4C8] hover:text-[#D4AB6A] hover:border-[#D4AB6A] transition-all whitespace-nowrap";
  const activeTracks = tracks.filter(t => !t.isMuted && t.notes.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="fixed left-1/2 top-1/2 z-50 flex w-[95%] md:w-[680px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-[#3E3832] bg-[#1C1A1A] shadow-2xl overflow-hidden font-sans">
        
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A] h-[60px] shrink-0">
          <span className="text-[15px] font-medium text-[#E0D4C8]">Exportar para o Black Desert</span>
          <button onClick={onClose} className="text-[#8B847A] hover:text-[#D4AB6A] transition-colors">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex flex-col gap-6 p-5 md:p-6 overflow-y-auto">
          
          <div className="relative rounded-sm border border-[#3E3832] bg-[#151515] p-5 pt-6 mt-2 shrink-0">
            <span className="absolute -top-2.5 left-3 bg-[#1C1A1A] px-2 text-[10px] font-bold uppercase tracking-wider text-[#D4AB6A] border border-[#3E3832] rounded-sm">Settings</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] items-center gap-x-2 gap-y-4">
              <span className={labelClass}>Character:</span>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                <input type="text" value={charName} onChange={e => setCharName(e.target.value)} className={`${inputClass} w-24 sm:w-40 flex-1 sm:flex-none`} />
                <button onClick={() => fileInputRef.current?.click()} className={btnClass}>
                  <Upload size={14} /> <span className="hidden sm:inline">Carregar ID BDO</span><span className="sm:hidden">Carregar</span>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".bms" onChange={handleExtractId} />
              </div>

              <span className={labelClass}>Status ID:</span>
              <span className="text-xs text-[#8B847A] truncate font-mono bg-[#1C1A1A] px-2 py-1 rounded-sm border border-[#2A2A2A] w-fit">{idStatus}</span>

              <span className={labelClass}>Transpose:</span>
              <div className="flex items-center gap-2">
                <input type="number" value={transpose} onChange={e => setTranspose(e.target.value)} className={`${inputClass} w-16 text-center`} />
                <span className="text-xs text-[#8B847A]">semitons</span>
              </div>

              <span className={labelClass}>Notas por Trilha:</span>
              <div className="flex items-center gap-2">
                <select 
                  value={maxChunkNotes} 
                  onChange={e => setMaxChunkNotes(e.target.value)} 
                  className={`${inputClass} w-48`}
                >
                  <option value="730">730 (Padrão / Rank Inicial)</option>
                  <option value="1200">1200 (Rank Intermediário)</option>
                  <option value="2400">2400 (Rank Mestre / Marni)</option>
                </select>
              </div>
            </div>

            {ownerId === '0' && (
              <div className="mt-4 flex items-start gap-2 bg-[#2A1E14] border border-[#6B4B24] p-3 rounded text-xs text-[#E6C280] leading-relaxed">
                <span className="font-bold text-[#D4AB6A]">Aviso:</span>
                <span>
                  O <b>Owner ID</b> é 0. Para que o seu personagem possa reproduzir ou salvar a partitura no jogo, use o botão <b>Carregar ID BDO</b> com um arquivo <code>.bms</code> já salvo previamente pelo seu personagem no Black Desert.
                </span>
              </div>
            )}
          </div>

          <div className="relative rounded-sm border border-[#3E3832] bg-[#151515] p-5 pt-6 mt-2 shrink-0">
            <span className="absolute -top-2.5 left-3 bg-[#1C1A1A] px-2 text-[10px] font-bold uppercase tracking-wider text-[#D4AB6A] border border-[#3E3832] rounded-sm">Instruments</span>
            
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 mb-4 pb-4 border-b border-[#2A2A2A]">
              <span className="text-xs text-[#8B847A]">Merge all into:</span>
              <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} className={`${inputClass} flex-1 sm:w-[200px]`}>
                {bdoInstrumentNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <button onClick={handleMergeAll} className={btnClass}>Apply</button>
            </div>

            <div className="overflow-x-auto w-full" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3E3832 #151515' }}>
              <div className="min-w-[500px]">
                <div className="grid grid-cols-[1fr_auto_200px_130px] gap-4 items-center mb-2 pr-2">
                  <span className="text-[10px] uppercase font-bold text-[#8B847A] tracking-wider">Source Track</span>
                  <span className="w-4"></span>
                  <span className="text-[10px] uppercase font-bold text-[#8B847A] tracking-wider">BDO Instrument</span>
                  <span className="text-[10px] uppercase font-bold text-[#8B847A] tracking-wider">Volume Scale</span>
                </div>

                <div className="max-h-32 md:max-h-48 overflow-y-auto pr-2 space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3E3832 #151515' }}>
                  {activeTracks.length === 0 ? (
                    <div className="text-xs text-[#8B847A] italic py-4 text-center bg-[#1C1A1A] rounded-sm border border-[#2A2A2A]">Nenhuma trilha com notas para exportar.</div>
                  ) : (
                    activeTracks.map(track => (
                      <div key={track.id} className="grid grid-cols-[1fr_auto_200px_130px] gap-4 items-center py-1 border-b border-[#2A2A2A] last:border-0">
                        <span className="text-xs text-[#E0D4C8] truncate" title={track.name}>
                          {track.name} <span className="text-[#8B847A] ml-1">({track.notes.length})</span>
                        </span>
                        <span className="text-[#D4AB6A] text-xs">→</span>
                        <select
                          value={instOverrides[track.id] || getDefaultBdoInstrument(track.instrument)}
                          onChange={e => setInstOverrides(prev => ({...prev, [track.id]: e.target.value}))}
                          className={inputClass}
                        >
                          {bdoInstrumentNames.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <div className="flex items-center gap-3">
                          <input type="range" min="10" max="200" value={velScales[track.id] || 100} onChange={e => setVelScales(prev => ({...prev, [track.id]: parseInt(e.target.value)}))} className="w-16 accent-[#D4AB6A] bg-[#1C1A1A] h-1.5 rounded-full appearance-none border border-[#3E3832]" />
                          <span className="text-[11px] text-[#D4AB6A] w-8 text-right font-mono">{velScales[track.id] || 100}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="relative rounded-sm border border-[#3E3832] bg-[#151515] p-5 pt-6 mt-2 shrink-0">
            <span className="absolute -top-2.5 left-3 bg-[#1C1A1A] px-2 text-[10px] font-bold uppercase tracking-wider text-[#D4AB6A] border border-[#3E3832] rounded-sm flex items-center gap-1.5">
              <AudioWaveform size={12} /> Efeitos Globais
            </span>
            <div className="flex items-center justify-around text-xs text-[#E0D4C8] px-4 py-2.5 bg-[#1C1A1A] rounded-sm border border-[#2A2A2A]">
              <span>Reverb: <b className="text-[#D4AB6A] font-mono">{effectorSettings.reverbTime}</b></span>
              <span>Delay: <b className="text-[#D4AB6A] font-mono">{effectorSettings.delayFeedback}</b></span>
              <span>Chorus: <b className="text-[#D4AB6A] font-mono">{effectorSettings.chorusFeedback}</b></span>
            </div>
          </div>

          <div className="relative rounded-sm border border-[#3E3832] bg-[#151515] p-5 pt-6 mt-2 shrink-0">
            <span className="absolute -top-2.5 left-3 bg-[#1C1A1A] px-2 text-[10px] font-bold uppercase tracking-wider text-[#D4AB6A] border border-[#3E3832] rounded-sm">Velocity Compression</span>
            
            <div className="flex flex-wrap items-center gap-4 mb-5 border-b border-[#2A2A2A] pb-4">
              <span className="text-xs text-[#8B847A]">Modo de Dinâmica:</span>
              {['layered', 'stepped', 'rescale', 'floor', 'off'].map(mode => (
                <label key={mode} className="flex items-center gap-1.5 text-xs text-[#E0D4C8] cursor-pointer hover:text-[#D4AB6A] transition-colors">
                  <input type="radio" name="velMode" checked={velMode === mode} onChange={() => setVelMode(mode as any)} className="accent-[#D4AB6A]" />
                  <span className="capitalize">{mode}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_auto_1fr] items-center gap-y-3 gap-x-4">
              <div className="flex items-center justify-between md:contents"><span className={`text-xs text-left md:text-right md:pr-2 ${velMode === 'stepped' ? 'text-[#E0D4C8]' : 'text-[#8B847A]'}`}>Base:</span><input type="number" value={stepBase} disabled={velMode !== 'stepped'} onChange={e => setStepBase(e.target.value)} className={`${inputClass} w-16 text-center disabled:opacity-30`} /></div>
              <div className="flex items-center justify-between md:contents"><span className={`text-xs text-left md:text-right md:pr-2 ${velMode === 'stepped' ? 'text-[#E0D4C8]' : 'text-[#8B847A]'}`}>Step:</span><input type="number" value={stepStep} disabled={velMode !== 'stepped'} onChange={e => setStepStep(e.target.value)} className={`${inputClass} w-16 text-center disabled:opacity-30`} /></div>
              <div className="flex items-center justify-between md:contents"><span className={`text-xs text-left md:text-right md:pr-2 ${velMode === 'rescale' ? 'text-[#E0D4C8]' : 'text-[#8B847A]'}`}>Min:</span><input type="number" value={rescaleMin} disabled={velMode !== 'rescale'} onChange={e => setRescaleMin(e.target.value)} className={`${inputClass} w-16 text-center disabled:opacity-30`} /></div>
              <div className="flex items-center justify-between md:contents"><span className={`text-xs text-left md:text-right md:pr-2 ${velMode === 'rescale' ? 'text-[#E0D4C8]' : 'text-[#8B847A]'}`}>Max:</span><input type="number" value={rescaleMax} disabled={velMode !== 'rescale'} onChange={e => setRescaleMax(e.target.value)} className={`${inputClass} w-16 text-center disabled:opacity-30`} /></div>
              <div className="flex items-center justify-between md:contents col-span-2 md:col-span-1"><span className={`text-xs text-left md:text-right md:pr-2 ${velMode === 'floor' ? 'text-[#E0D4C8]' : 'text-[#8B847A]'}`}>Floor Limit:</span><input type="number" value={floorVal} disabled={velMode !== 'floor'} onChange={e => setFloorVal(e.target.value)} className={`${inputClass} w-16 text-center disabled:opacity-30`} /></div>
            </div>
          </div>

        </div>

        <div className="p-4 border-t border-[#2A2A2A] bg-[#1C1A1A] shrink-0">
          <button 
            onClick={handleExport}
            className="w-full rounded-sm bg-[#b09046] py-3 text-[14px] font-bold text-[#161618] hover:bg-[#d8ad70] transition-colors shadow-[0_0_15px_rgba(216,173,112,0.2)] hover:shadow-[0_0_20px_rgba(216,173,112,0.4)] tracking-wide"
          >
            GERAR ARQUIVO BDO
          </button>
        </div>

      </div>
    </>
  );
}