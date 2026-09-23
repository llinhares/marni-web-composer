import { useState } from 'react';
import { X, ChevronLeft, Lock } from 'lucide-react';
import { type InstrumentType } from '@/types';

interface AddInstrumentModalProps {
  onClose: () => void;
  onSelect: (instrument: InstrumentType) => void;
}

export function AddInstrumentModal({ onClose, onSelect }: AddInstrumentModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories: { 
    id: string; 
    label: string; 
    imagePlaceholder: string; 
    instruments: InstrumentType[];
    disabled?: boolean;
  }[] = [
    { 
      id: 'Piano', 
      label: 'Teclas & Pianos', 
      imagePlaceholder: 'bg-gradient-to-b from-[#4A2609] to-[#150A02]', 
      instruments: ['Grand Piano', 'Piano de Iniciante'],
      disabled: false
    },
    { 
      id: 'Violino', 
      label: 'Cordas Acústicas', 
      imagePlaceholder: 'bg-gradient-to-b from-[#3F1C0D] to-[#140804]', 
      instruments: [
        'Violão Acústico', 
        'Contrabaixo', 
        'Harpa', 
        'Violino',
        'Violão de Iniciante',
        'Harpa de Iniciante',
        'Violino de Iniciante'
      ],
      disabled: false
    },
    { 
      id: 'Flauta', 
      label: 'Sopros', 
      imagePlaceholder: 'bg-gradient-to-b from-[#2A2D34] to-[#111113]',
      instruments: [
        'Flauta Transversal', 
        'Clarinete', 
        'Trompa',
        'Flauta de Iniciante',
        'Flauta Doce de Iniciante'
      ],
      disabled: false
    },
    { 
      id: 'Guitarras', 
      label: 'Guitarras Elétricas', 
      imagePlaceholder: 'bg-gradient-to-b from-[#5c1d1d] to-[#1a0808]',
      instruments: [
        'Guitarra Silver Wave',
        'Guitarra Highway',
        'Guitarra Hexe Glam'
      ],
      disabled: false
    },
    { 
      id: 'Marnian', 
      label: 'Marnian (Synths)', 
      imagePlaceholder: 'bg-gradient-to-b from-[#1a384a] to-[#08131a]',
      instruments: [
        'Marnibass',
        'Marnian Wavy Planet',
        'Marnian Illusion Tree',
        'Marnian Secret Note',
        'Marnian Sandwich'
      ],
      disabled: false
    },
    { 
      id: 'Percussao', 
      label: 'Percussão', 
      imagePlaceholder: 'bg-gradient-to-b from-[#282828] to-[#0F0F0F]', 
      instruments: [
        'Kit de Bateria', 
        'Tamborim',
        'Pratos',
        'Handpan'
      ],
      disabled: false
    },
  ];

  const activeCategory = categories.find(c => c.id === selectedCategory);

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="fixed left-1/2 top-1/2 z-50 flex w-[95%] md:w-[760px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-[#3E3832] bg-[#1C1A1A] shadow-2xl overflow-hidden font-sans">
        
        <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-[#2A2A2A] h-[50px] md:h-[60px] shrink-0">
          <div className="flex items-center gap-3">
            {selectedCategory && (
              <button 
                onClick={() => setSelectedCategory(null)} 
                className="text-[#8B847A] hover:text-[#D4AB6A] transition-all bg-[#23201E] p-1 rounded-sm border border-[#2A2A2A] active:scale-95"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
            )}
            <span className="text-[14px] md:text-[15px] text-[#E0D4C8] font-medium truncate max-w-[200px] md:max-w-full">
              {selectedCategory ? `Selecione: ${activeCategory?.label}` : 'Adicionar Instrumento'}
            </span>
          </div>

          <button onClick={onClose} className="text-[#8B847A] hover:text-[#D4AB6A] transition-colors shrink-0">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="relative p-4 md:p-6 md:h-[420px] max-h-[60vh] overflow-y-auto">
          {!selectedCategory ? (
            <div key="view-categories" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-300">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => !cat.disabled && setSelectedCategory(cat.id)}
                  disabled={cat.disabled}
                  className={`group relative flex h-36 md:h-44 flex-col overflow-hidden rounded-sm border transition-all ${
                    cat.disabled 
                    ? 'border-[#2A2A2A] bg-[#101010] cursor-not-allowed grayscale' 
                    : 'border-[#3E3832] bg-[#151515] hover:-translate-y-1 hover:border-[#D4AB6A] hover:shadow-[0_0_15px_rgba(212,171,106,0.3)]'
                  }`}
                >
                  <img 
                    src={`/images/${cat.id.toLowerCase()}.webp`} 
                    alt={cat.label} 
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    className="absolute inset-0 h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                  />
                  <div className={`absolute inset-0 opacity-80 transition-opacity ${!cat.disabled && 'group-hover:opacity-50'} ${cat.imagePlaceholder}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#151515] via-transparent to-transparent opacity-90" />
                  
                  {cat.disabled && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 gap-2">
                      <Lock size={18} className="text-[#D4AB6A]/50" />
                      <span className="bg-[#1C1A1A]/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#D4AB6A] border border-[#D4AB6A]/30 rounded-sm">
                        Em desenvolvimento
                      </span>
                    </div>
                  )}

                  {!cat.disabled && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#D4AB6A]/10 via-transparent to-transparent transition-opacity duration-500" />
                  )}

                  <div className="absolute bottom-4 md:bottom-6 left-0 right-0 flex flex-col items-center gap-2">
                    <span className={`text-[14px] md:text-[15px] drop-shadow-md transition-all ${cat.disabled ? 'text-[#595a62]' : 'text-[#E0D4C8] group-hover:text-[#F3E8DA] group-hover:font-medium'}`}>
                      {cat.label}
                    </span>
                    
                    {!cat.disabled && (
                      <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                        <div className="h-[1px] w-4 bg-[#D4AB6A]/50 group-hover:w-8 transition-all duration-300" />
                        <div className="h-1 w-1 rotate-45 border border-[#D4AB6A]" />
                        <div className="h-[1px] w-4 bg-[#D4AB6A]/50 group-hover:w-8 transition-all duration-300" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div key={`view-instruments-${selectedCategory}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-right-4 fade-in duration-300">
              {activeCategory?.instruments.map((inst) => (
                <button
                  key={inst}
                  onClick={() => onSelect(inst)}
                  className="group relative flex h-24 md:h-32 flex-col justify-center items-center overflow-hidden rounded-sm border border-[#3E3832] bg-[#151515] transition-all hover:border-[#D4AB6A] hover:bg-[#1A1A1A] active:scale-[0.98]"
                >
                  <div className={`absolute inset-0 opacity-20 ${activeCategory.imagePlaceholder}`} />
                  <div className="absolute inset-0 bg-gradient-to-br from-[#D4AB6A]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <span className="relative z-10 text-[13px] md:text-[14px] text-[#E0D4C8] drop-shadow-md group-hover:text-[#F3E8DA] transition-all text-center px-4">
                    {inst}
                  </span>

                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#D4AB6A] scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#23201E] py-3 md:py-4 text-center border-t border-[#2A2A2A] shrink-0">
          <span className="text-[11px] md:text-xs text-[#8B847A]">
            {selectedCategory ? "Escolha a variação de instrumento desejada." : "Escolha o tipo de instrumento."}
          </span>
        </div>
      </div>
    </>
  );
}