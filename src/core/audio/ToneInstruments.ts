import * as Tone from 'tone';

export const instruments: Record<string, Tone.Sampler | Tone.PolySynth> = {};

export const fallbackSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.8 },
});

export const DRUM_TONE_MAP: Record<string, string> = {
  'Kck': 'C2',
  'SnrSide': 'C#2',
  'SnrHit': 'D2',
  'RimShot': 'D#2',
  'SnrFlam': 'E2',
  'Tom1': 'F2',
  'HihatC': 'F#2',
  'Tom2': 'G2',
  'HatPdl': 'G#2',
  'Tom3': 'A2',
  'HihatO': 'A#2',
  'Tom4': 'B2',
  'Tom5': 'C3',
  'CymCrsh': 'C#3',
  'CymRide': 'D3',
  'SnrRollS': 'D#3',
  'SnrRollL': 'E3'
};

export const createInstrument = (type: string, channel: Tone.Channel): Tone.Sampler | Tone.PolySynth => {
  if (type === 'Grand Piano' || type === 'Piano de Iniciante') {
    return new Tone.Sampler({
      urls: { A0: "A0.mp3", C1: "C1.mp3", C4: "C4.mp3", A7: "A7.mp3" },
      baseUrl: "https://tonejs.github.io/audio/salamander/",
      release: 2.5,
      onerror: (err) => console.warn('Piano sample load fallback:', err)
    }).connect(channel);
  } 
  if (type === 'Flauta Transversal' || type === 'Flauta de Iniciante' || type === 'Flauta Doce de Iniciante' || type === 'Clarinete') {
    return new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2, modulationIndex: 1.5,
      oscillator: { type: "sine" }, 
      envelope: { attack: 0.08, decay: 0.2, sustain: 1, release: 0.6 },
    }).connect(channel);
  } 
  if (type === 'Contrabaixo') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" }, 
      envelope: { attack: 0.15, decay: 0.3, sustain: 0.7, release: 0.9 }
    }).connect(channel);
  } 
  if (type === 'Violino' || type === 'Violino de Iniciante') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" }, 
      envelope: { attack: 0.2, decay: 0.3, sustain: 0.85, release: 1.0 }
    }).connect(channel);
  } 
  if (type === 'Trompa') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.12, decay: 0.3, sustain: 0.9, release: 0.8 }
    }).connect(channel);
  }
  if (type === 'Guitarra Silver Wave') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.4, release: 1.2 }
    }).connect(channel);
  }
  if (type === 'Guitarra Highway') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.6, release: 1.0 }
    }).connect(channel);
  }
  if (type === 'Guitarra Hexe Glam') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth8" },
      envelope: { attack: 0.02, decay: 0.6, sustain: 0.7, release: 1.4 }
    }).connect(channel);
  }
  if (type === 'Marnibass') {
    return new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: "square" },
      filter: { Q: 3, type: "lowpass", rolloff: -24 },
      filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.2, release: 0.4, baseFrequency: 60, octaves: 3 }
    }).connect(channel);
  }
  if (type === 'Marnian Wavy Planet') {
    return new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3, modulationIndex: 4,
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 1.0 }
    }).connect(channel);
  }
  if (type === 'Marnian Illusion Tree') {
    return new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2.5,
      oscillator: { type: "sine" },
      envelope: { attack: 0.4, decay: 0.8, sustain: 0.8, release: 2.2 }
    }).connect(channel);
  }
  if (type === 'Marnian Secret Note') {
    return new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 5.01, modulationIndex: 10,
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 0.8, sustain: 0.1, release: 1.5 }
    }).connect(channel);
  }
  if (type === 'Marnian Sandwich') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "pulse", width: 0.4 },
      envelope: { attack: 0.02, decay: 0.25, sustain: 0.5, release: 0.7 }
    }).connect(channel);
  }
  if (type === 'Handpan') {
    return new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.5, modulationIndex: 3,
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 2.0 }
    }).connect(channel);
  }
  if (type === 'Kit de Bateria' || type === 'Tamborim' || type === 'Pratos') {
    return new Tone.Sampler({
      urls: {
        "C2": "kick.flac",   
        "D2": "snare.flac",  
        "F#2": "hihat.flac",
        "F2": "tom1.flac",
        "C#3": "crash.flac",
      },
      baseUrl: "/samples/percussao/",
      onerror: () => console.warn('Percussion sample load fallback')
    }).connect(channel);
  } 
  if (type === 'Harpa' || type === 'Harpa de Iniciante') {
    return new Tone.Sampler({
      urls: {
        "A2": "A2_f1.flac", "A6": "A6_f1.flac", "B1": "B1_f1.flac", "B3": "B3_f1.flac",
        "B5": "B5_f1.flac", "B6": "B6_f1.flac", "C3": "C3_f2.flac", "C5": "C5_f1.flac",
        "D2": "D2_f1.flac", "D4": "D4_mf1.flac", "D6": "D6_f1.flac", "D7": "D7_f1.flac",
        "E1": "E1_f1.flac", "E3": "E3_f1.flac", "E5": "E5_f1.flac", "F2": "F2_f1.flac",
        "F4": "F4_f1.flac", "F6": "F6_f1.flac", "F7": "F7_f1.flac", "G1": "G1_f1.flac",
        "G3": "G3_f1.flac", "G5": "G5_f1.flac",
      },
      baseUrl: "/samples/harpa/",
      release: 2.5,
      onerror: () => console.warn('Harp sample load fallback')
    }).connect(channel);
  }
  if (type === 'Violão Acústico' || type === 'Violão de Iniciante') {
    return new Tone.Sampler({
      urls: {
        "E2": "HV_40.wav", "A2": "HV_45.wav", "D3": "HV_50.wav", "G3": "HV_55.wav",
        "C4": "HV_60.wav", "F4": "HV_65.wav", "A#4": "HV_70.wav", "D#5": "HV_75.wav",
        "G#5": "HV_80.wav", "B5": "HV_83.wav",
      },
      baseUrl: "/samples/violao/",
      release: 2.0,
      onerror: () => console.warn('Acoustic guitar sample load fallback')
    }).connect(channel);
  }
  
  return new Tone.PolySynth().connect(channel);
};
