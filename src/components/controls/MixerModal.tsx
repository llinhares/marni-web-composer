import { useEffect, useRef } from 'react';
import { X, Volume2, Sliders } from 'lucide-react';
import { useComposerStore } from '@/store/useComposerStore';
import { getMasterLevel, getTrackLevel } from '@/core/audio/ToneEngine';

interface MixerModalProps {
  onClose: () => void;
}

import { useShallow } from 'zustand/react/shallow';

export function MixerModal({ onClose }: MixerModalProps) {
  const { 
    tracks, updateTrackVolume, setTrackPan, toggleTrackMute, toggleTrackSolo,
    masterVolume, setMasterVolume 
  } = useComposerStore(useShallow(state => ({
    tracks: state.tracks, updateTrackVolume: state.updateTrackVolume, setTrackPan: state.setTrackPan, toggleTrackMute: state.toggleTrackMute, toggleTrackSolo: state.toggleTrackSolo,
    masterVolume: state.masterVolume, setMasterVolume: state.setMasterVolume
  })));

  const meterCanvasRef = useRef<HTMLCanvasElement>(null);

  // High-performance direct Canvas VU Meter rendering (zero React re-renders)
  useEffect(() => {
    let animId: number;

    const renderMeters = () => {
      const canvas = meterCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Render meter bars for each track
          tracks.forEach((track, idx) => {
            const trackDb = getTrackLevel(track.id);
            // Convert dB (-60 to 0) to height percentage (0 to 1)
            const clampedDb = Math.max(-60, Math.min(0, trackDb));
            const pct = (clampedDb + 60) / 60;

            const barWidth = 8;
            const x = idx * 96 + 72; // Align with track strip
            const h = canvas.height * pct;
            const y = canvas.height - h;

            // Gradient: Green -> Yellow -> Red
            const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
            grad.addColorStop(0, '#22c55e');
            grad.addColorStop(0.7, '#eab308');
            grad.addColorStop(0.95, '#ef4444');

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barWidth, h);
          });

          // Master Meter
          const masterDb = getMasterLevel();
          const masterPct = (Math.max(-60, Math.min(0, masterDb)) + 60) / 60;
          const mx = tracks.length * 96 + 72;
          const mh = canvas.height * masterPct;
          const my = canvas.height - mh;

          const mGrad = ctx.createLinearGradient(0, canvas.height, 0, 0);
          mGrad.addColorStop(0, '#22c55e');
          mGrad.addColorStop(0.7, '#eab308');
          mGrad.addColorStop(0.95, '#ef4444');

          ctx.fillStyle = mGrad;
          ctx.fillRect(mx, my, 12, mh);
        }
      }
      animId = requestAnimationFrame(renderMeters);
    };

    renderMeters();
    return () => cancelAnimationFrame(animId);
  }, [tracks]);

  const totalStripsWidth = (tracks.length + 1) * 96 + 40;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="fixed left-1/2 top-1/2 z-50 flex w-[95%] md:w-[860px] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-[#3E3832] bg-[#171513] shadow-2xl overflow-hidden font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A2A2A] bg-[#1C1917] h-[52px] shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-[#D4AB6A]" />
            <span className="text-[14px] font-bold text-[#E0D4C8] tracking-wide">Mixer Console Pro</span>
          </div>
          <button onClick={onClose} className="text-[#8B847A] hover:text-[#D4AB6A] transition-colors">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Channel Strips Area */}
        <div className="relative flex-1 overflow-x-auto p-4 md:p-6" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3E3832 #171513' }}>
          
          <div className="relative flex gap-3 pb-2" style={{ minWidth: `${totalStripsWidth}px` }}>
            
            {/* Overlay Canvas for Realtime Peak Meters */}
            <canvas 
              ref={meterCanvasRef}
              width={totalStripsWidth}
              height={140}
              className="absolute left-0 top-[110px] pointer-events-none z-10 opacity-90"
            />

            {/* Individual Track Strips */}
            {tracks.map((track) => {
              const panVal = track.pan ?? 0;
              const panDisplay = panVal === 0 ? 'C' : panVal < 0 ? `L${Math.abs(panVal)}` : `R${panVal}`;

              return (
                <div 
                  key={track.id}
                  className={`flex flex-col items-center w-[84px] rounded border p-2 shrink-0 bg-[#1C1A1A] transition-colors ${
                    track.isSolo 
                      ? 'border-[#D4AB6A] shadow-[0_0_10px_rgba(212,171,106,0.15)]' 
                      : 'border-[#2D2824]'
                  }`}
                >
                  {/* Track Name */}
                  <span className="text-[11px] font-bold text-[#E0D4C8] truncate max-w-full text-center" title={track.name}>
                    {track.name}
                  </span>
                  <span className="text-[9px] text-[#8B847A] truncate max-w-full mb-3">
                    {track.instrument}
                  </span>

                  {/* Panning Slider */}
                  <div className="flex flex-col items-center gap-1 w-full mb-3">
                    <span className="text-[9px] font-mono text-[#D4AB6A]">{panDisplay}</span>
                    <input 
                      type="range" 
                      min="-100" 
                      max="100" 
                      value={panVal}
                      onChange={(e) => setTrackPan(track.id, parseInt(e.target.value))}
                      className="w-full h-1 accent-[#D4AB6A] bg-[#2A2622] rounded cursor-pointer"
                    />
                    <span className="text-[8px] uppercase tracking-wider text-[#6B6358]">Pan</span>
                  </div>

                  {/* Fader & Meter Container */}
                  <div className="relative flex items-center justify-center w-full h-[140px] my-1">
                    {/* Background Meter Slot */}
                    <div className="absolute right-1 top-0 w-2 h-full bg-[#121110] rounded-sm border border-[#2D2824]" />

                    {/* Vertical Volume Fader */}
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={track.volume}
                      onChange={(e) => updateTrackVolume(track.id, parseInt(e.target.value))}
                      className="h-28 -rotate-90 w-28 accent-[#D4AB6A] cursor-pointer"
                    />
                  </div>

                  {/* Volume Value Readout */}
                  <span className="text-[10px] font-mono text-[#E0D4C8] my-1">
                    {track.volume}%
                  </span>

                  {/* Mute and Solo Buttons */}
                  <div className="flex items-center gap-1 w-full mt-2">
                    <button 
                      onClick={() => toggleTrackMute(track.id)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                        track.isMuted 
                          ? 'bg-red-950/80 text-red-400 border-red-800' 
                          : 'bg-[#23201E] text-[#8B847A] border-[#352F2A] hover:text-[#E0D4C8]'
                      }`}
                    >
                      M
                    </button>
                    <button 
                      onClick={() => toggleTrackSolo(track.id)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                        track.isSolo 
                          ? 'bg-[#A7763D] text-[#171513] border-[#D4AB6A]' 
                          : 'bg-[#23201E] text-[#8B847A] border-[#352F2A] hover:text-[#E0D4C8]'
                      }`}
                    >
                      S
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Master Strip */}
            <div className="flex flex-col items-center w-[84px] rounded border border-[#6B5330] p-2 shrink-0 bg-gradient-to-b from-[#2A2016] to-[#171513] shadow-md ml-2">
              <div className="flex items-center gap-1 text-[#D4AB6A] mb-1">
                <Volume2 size={13} />
                <span className="text-[11px] font-bold">MASTER</span>
              </div>
              <span className="text-[9px] text-[#A08C75] mb-8">Saída Geral</span>

              {/* Master Fader & Meter Container */}
              <div className="relative flex items-center justify-center w-full h-[140px] my-1">
                <div className="absolute right-1 top-0 w-3 h-full bg-[#121110] rounded-sm border border-[#3E3832]" />
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseInt(e.target.value))}
                  className="h-28 -rotate-90 w-28 accent-[#D4AB6A] cursor-pointer"
                />
              </div>

              {/* Master Volume Readout */}
              <span className="text-[11px] font-mono text-[#D4AB6A] font-bold my-1">
                {masterVolume}%
              </span>

              <div className="w-full mt-4 py-1 text-center bg-[#1F1B18] border border-[#3E3832] rounded text-[9px] uppercase tracking-wider text-[#A08C75]">
                Stereo
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
