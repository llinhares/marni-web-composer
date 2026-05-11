import { Music, MousePointer2, Settings, Download, X } from 'lucide-react';

interface OnboardingModalProps {
  onClose: () => void;
}

export function OnboardingModal({ onClose }: OnboardingModalProps) {
  const steps = [
    {
      icon: <Music size={20} className="text-[#D4AB6A]" />,
      title: "Adicione Instrumentos",
      description: "Comece escolhendo os instrumentos na barra lateral. Você pode usar desde Pianos até Baterias e Flautas."
    },
    {
      icon: <MousePointer2 size={20} className="text-[#D4AB6A]" />,
      title: "Componha as Notas",
      description: "Use o lápis para desenhar as notas na grade (Piano Roll). Altere o ritmo e a resolução para criar melodias complexas."
    },
    {
      icon: <Settings size={20} className="text-[#D4AB6A]" />,
      title: "Mixagem e Efeitos",
      description: "Ajuste o volume individual de cada trilha e aplique efeitos globais como Reverb e Delay no painel superior."
    },
    {
      icon: <Download size={20} className="text-[#D4AB6A]" />,
      title: "Exporte para o Jogo",
      description: "Quando terminar, exporte o arquivo diretamente para o formato do Black Desert, pronto para ser lido pelo jogo."
    }
  ];

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md transition-opacity" />
      
      <div className="fixed left-1/2 top-1/2 z-[110] flex w-[95%] md:w-[700px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-[#3E3832] bg-[#1C1A1A] shadow-2xl overflow-hidden font-sans animate-in zoom-in-95 duration-300">
        
        <div className="relative h-24 md:h-32 w-full bg-gradient-to-r from-[#2A1D13] to-[#140C07] flex items-center justify-center border-b border-[#3E3832] shrink-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#D4AB6A]/20 via-transparent to-transparent" />
          
          <button onClick={onClose} className="absolute top-3 md:top-4 right-3 md:right-4 text-[#8B847A] hover:text-[#D4AB6A] transition-colors z-20">
            <X size={20} strokeWidth={1.5} />
          </button>
          
          <div className="relative z-10 flex flex-col items-center gap-1 md:gap-2 px-4 text-center">
            <span className="text-[18px] md:text-2xl font-bold text-[#F3E8DA] tracking-wide drop-shadow-md">Bem-vindo ao Marni Web Composer</span>
            <span className="text-[11px] md:text-sm text-[#D4AB6A]">Sua jornada musical começa aqui.</span>
          </div>
        </div>

        <div className="p-4 md:p-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 md:gap-y-6">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-3 md:gap-4">
                <div className="flex h-10 w-10 md:h-12 md:w-12 shrink-0 items-center justify-center rounded bg-[#23201E] border border-[#2A2A2A] shadow-inner">
                  {step.icon}
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] md:text-sm font-bold text-[#E0D4C8] mb-1">{step.title}</span>
                  <span className="text-[11px] md:text-xs text-[#8B847A] leading-relaxed">{step.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center bg-[#151515] p-4 md:p-5 border-t border-[#2A2A2A] shrink-0">
          <button 
            onClick={onClose}
            className="w-full md:w-auto rounded bg-[#b09046] px-12 py-2.5 text-sm font-bold text-[#161618] hover:bg-[#d8ad70] transition-colors shadow-[0_0_15px_rgba(216,173,112,0.2)] hover:shadow-[0_0_20px_rgba(216,173,112,0.4)]"
          >
            Começar a Compor
          </button>
        </div>
      </div>
    </>
  );
}