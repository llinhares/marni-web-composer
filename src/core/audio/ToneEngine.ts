import * as Tone from 'tone';
import { type Track, type EffectorSettings } from '@/types';
import { useComposerStore } from '@/store/useComposerStore';

Tone.Transport.PPQ = 480;

const trackChannels: Record<string, Tone.Channel> = {};
const trackParts: Record<string, Tone.Part> = {};
const trackMeters: Record<string, Tone.Meter> = {};
const instruments: Record<string, Tone.Sampler | Tone.PolySynth> = {};

// Fallback synth for when samples are loading or missing
const fallbackSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.8 },
});

const chorus = new Tone.Chorus({ frequency: 2, delayTime: 2.5, depth: 0.5 }).start();
const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.2 });
const reverb = new Tone.Reverb({ decay: 1.5 });
const masterVolume = new Tone.Volume(0);
const masterMeter = new Tone.Meter();

fallbackSynth.connect(chorus);
chorus.chain(delay, reverb, masterVolume, masterMeter, Tone.Destination);
chorus.wet.value = 0;
delay.wet.value = 0;
reverb.wet.value = 0;

export const updateEffector = (settings: EffectorSettings) => {
  reverb.decay = Math.max(0.1, (settings.reverbTime / 100) * 10);
  reverb.wet.value = settings.reverbTime / 100;
  delay.feedback.value = (settings.delayFeedback / 100) * 0.8;
  delay.wet.value = settings.delayFeedback > 0 ? 0.5 : 0;
  chorus.feedback.value = settings.chorusFeedback / 100;
  chorus.depth = settings.chorusDepth / 100;
  chorus.frequency.value = (settings.chorusFreq / 100) * 10;
  chorus.wet.value = (settings.chorusFeedback > 0 || settings.chorusDepth > 0) ? 0.5 : 0;
};

export const updateMasterVolume = (volume: number) => {
  masterVolume.volume.value = Tone.gainToDb(Math.max(0.0001, volume / 100));
};

export const getMasterLevel = (): number => {
  const val = masterMeter.getValue();
  return typeof val === 'number' ? val : -100;
};

export const getTrackLevel = (trackId: string): number => {
  if (!trackMeters[trackId]) return -100;
  const val = trackMeters[trackId].getValue();
  return typeof val === 'number' ? val : -100;
};

const DRUM_TONE_MAP: Record<string, string> = {
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

const getTrackChannel = (trackId: string): Tone.Channel => {
  if (!trackChannels[trackId]) {
    const channel = new Tone.Channel().connect(chorus);
    const meter = new Tone.Meter();
    channel.connect(meter);
    trackChannels[trackId] = channel;
    trackMeters[trackId] = meter;
  }
  return trackChannels[trackId];
};

const getInstrument = (type: string, trackId: string): Tone.Sampler | Tone.PolySynth => {
  const key = `${type}-${trackId}`;
  
  if (!instruments[key]) {
    const channel = getTrackChannel(trackId);
    
    if (type === 'Grand Piano' || type === 'Piano de Iniciante') {
      instruments[key] = new Tone.Sampler({
        urls: { A0: "A0.mp3", C1: "C1.mp3", C4: "C4.mp3", A7: "A7.mp3" },
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        release: 2.5,
        onerror: (err) => console.warn('Piano sample load fallback:', err)
      }).connect(channel);
    } 
    else if (type === 'Flauta Transversal' || type === 'Flauta de Iniciante' || type === 'Flauta Doce de Iniciante' || type === 'Clarinete') {
      instruments[key] = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2, modulationIndex: 1.5,
        oscillator: { type: "sine" }, 
        envelope: { attack: 0.08, decay: 0.2, sustain: 1, release: 0.6 },
      }).connect(channel);
    } 
    else if (type === 'Contrabaixo') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" }, 
        envelope: { attack: 0.15, decay: 0.3, sustain: 0.7, release: 0.9 }
      }).connect(channel);
    } 
    else if (type === 'Violino' || type === 'Violino de Iniciante') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" }, 
        envelope: { attack: 0.2, decay: 0.3, sustain: 0.85, release: 1.0 }
      }).connect(channel);
    } 
    else if (type === 'Trompa') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.12, decay: 0.3, sustain: 0.9, release: 0.8 }
      }).connect(channel);
    }
    else if (type === 'Guitarra Silver Wave') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.02, decay: 0.4, sustain: 0.4, release: 1.2 }
      }).connect(channel);
    }
    else if (type === 'Guitarra Highway') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.6, release: 1.0 }
      }).connect(channel);
    }
    else if (type === 'Guitarra Hexe Glam') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth8" },
        envelope: { attack: 0.02, decay: 0.6, sustain: 0.7, release: 1.4 }
      }).connect(channel);
    }
    else if (type === 'Marnibass') {
      instruments[key] = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "square" },
        filter: { Q: 3, type: "lowpass", rolloff: -24 },
        filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.2, release: 0.4, baseFrequency: 60, octaves: 3 }
      }).connect(channel);
    }
    else if (type === 'Marnian Wavy Planet') {
      instruments[key] = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3, modulationIndex: 4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 1.0 }
      }).connect(channel);
    }
    else if (type === 'Marnian Illusion Tree') {
      instruments[key] = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2.5,
        oscillator: { type: "sine" },
        envelope: { attack: 0.4, decay: 0.8, sustain: 0.8, release: 2.2 }
      }).connect(channel);
    }
    else if (type === 'Marnian Secret Note') {
      instruments[key] = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 5.01, modulationIndex: 10,
        oscillator: { type: "sine" },
        envelope: { attack: 0.005, decay: 0.8, sustain: 0.1, release: 1.5 }
      }).connect(channel);
    }
    else if (type === 'Marnian Sandwich') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "pulse", width: 0.4 },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.5, release: 0.7 }
      }).connect(channel);
    }
    else if (type === 'Handpan') {
      instruments[key] = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1.5, modulationIndex: 3,
        oscillator: { type: "sine" },
        envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 2.0 }
      }).connect(channel);
    }
    else if (type === 'Kit de Bateria' || type === 'Tamborim' || type === 'Pratos') {
      instruments[key] = new Tone.Sampler({
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
    else if (type === 'Harpa' || type === 'Harpa de Iniciante') {
      instruments[key] = new Tone.Sampler({
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
    else if (type === 'Violão Acústico' || type === 'Violão de Iniciante') {
      instruments[key] = new Tone.Sampler({
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
    else {
      instruments[key] = new Tone.PolySynth().connect(channel);
    }
  }
  
  return instruments[key];
};

export const disposeTrackAudio = (trackId: string) => {
  if (trackParts[trackId]) {
    trackParts[trackId].dispose();
    delete trackParts[trackId];
  }
  Object.keys(instruments).forEach((key) => {
    if (key.endsWith(`-${trackId}`)) {
      instruments[key].dispose();
      delete instruments[key];
    }
  });
  if (trackMeters[trackId]) {
    trackMeters[trackId].dispose();
    delete trackMeters[trackId];
  }
  if (trackChannels[trackId]) {
    trackChannels[trackId].dispose();
    delete trackChannels[trackId];
  }
};

export const updateTrackAudio = (
  trackId: string, 
  volume: number, 
  isMuted: boolean, 
  isSolo: boolean, 
  hasOtherSolo: boolean,
  pan: number = 0
) => {
  const channel = getTrackChannel(trackId);
  channel.volume.value = Tone.gainToDb(Math.max(0.001, volume / 100));
  channel.pan.value = Math.max(-1, Math.min(1, pan / 100));
  if (hasOtherSolo) channel.mute = !isSolo;
  else channel.mute = isMuted;
};

export const setGlobalBpm = (bpm: number) => { 
  Tone.Transport.bpm.value = bpm; 
};

export const playFeedbackNote = async (pitch: string, track: Track, hasOtherSolo: boolean) => {
  if (Tone.context.state !== 'running') await Tone.start();
  if (hasOtherSolo ? !track.isSolo : track.isMuted) return;
  
  const inst = getInstrument(track.instrument, track.id);
  
  let playPitch = pitch;
  const isPerc = track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim' || track.instrument === 'Pratos';
  if (isPerc) {
    playPitch = DRUM_TONE_MAP[pitch] || pitch || 'C2';
  }

  if (inst instanceof Tone.Sampler && !inst.loaded) {
    fallbackSynth.triggerAttackRelease(playPitch, '8n');
    return;
  }

  inst.triggerAttackRelease(playPitch, '8n');
};

// Live MIDI input triggers
export const triggerLiveNoteOn = async (pitch: string, velocity: number = 80, track: Track) => {
  if (Tone.context.state !== 'running') await Tone.start();
  const inst = getInstrument(track.instrument, track.id);
  let playPitch = pitch;
  const isPerc = track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim' || track.instrument === 'Pratos';
  if (isPerc) {
    playPitch = DRUM_TONE_MAP[pitch] || pitch || 'C2';
  }
  if (inst instanceof Tone.Sampler && !inst.loaded) {
    fallbackSynth.triggerAttack(playPitch, undefined, velocity / 100);
    return;
  }
  inst.triggerAttack(playPitch, undefined, velocity / 100);
};

export const triggerLiveNoteOff = (pitch: string, track: Track) => {
  const inst = getInstrument(track.instrument, track.id);
  let playPitch = pitch;
  const isPerc = track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim' || track.instrument === 'Pratos';
  if (isPerc) {
    playPitch = DRUM_TONE_MAP[pitch] || pitch || 'C2';
  }
  if (inst instanceof Tone.Sampler && !inst.loaded) {
    fallbackSynth.triggerRelease(playPitch);
    return;
  }
  inst.triggerRelease(playPitch);
};

export const playComposition = async (tracks: Track[], bpm: number, startTick: number = 0) => {
  if (Tone.context.state !== 'running') await Tone.start();
  Tone.Transport.stop();
  Tone.Transport.cancel();
  
  // Dispose previous parts
  Object.values(trackParts).forEach((part) => part.dispose());
  for (const id in trackParts) delete trackParts[id];

  Tone.Transport.bpm.value = bpm;

  const hasSolo = tracks.some(t => t.isSolo);
  let lastTick = 0;

  tracks.forEach(track => {
    updateTrackAudio(track.id, track.volume, track.isMuted, track.isSolo, hasSolo, track.pan || 0);
    const inst = getInstrument(track.instrument, track.id);

    const isPercTrack = track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim' || track.instrument === 'Pratos';

    const partEvents = track.notes.map(note => {
      const endTick = note.startTick + note.durationTicks;
      if (endTick > lastTick) lastTick = endTick;

      let playPitch = note.pitch;
      if (isPercTrack) {
        playPitch = DRUM_TONE_MAP[note.pitch] || note.pitch || 'C2';
      }

      return {
        time: `${note.startTick}i`,
        pitch: playPitch,
        duration: `${note.durationTicks}i`,
        velocity: note.velocity / 100
      };
    });

    const part = new Tone.Part((time, value) => {
      if (inst instanceof Tone.Sampler && !inst.loaded) {
        fallbackSynth.triggerAttackRelease(value.pitch, value.duration, time, value.velocity);
        return;
      }
      inst.triggerAttackRelease(value.pitch, value.duration, time, value.velocity);
    }, partEvents).start(0);

    trackParts[track.id] = part;
  });

  if (lastTick > 0) {
    Tone.Transport.scheduleOnce(() => {
      Tone.Transport.stop();
      useComposerStore.getState().setIsPlaying(false);
    }, `${lastTick + 960}i`);
  }

  Tone.Transport.ticks = startTick;
  Tone.Transport.start(undefined, `${startTick}i`);
};

export const stopComposition = () => { 
  Tone.Transport.stop(); 
};

export const pauseComposition = () => {
  Tone.Transport.pause();
};

// Pure client-side WAV encoding using DataView
function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const totalSamples = buffer.length;
  const dataSize = totalSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data Subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels & write PCM 16-bit
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Render song to WAV offline in memory
export const exportWavAudio = async (tracks: Track[], bpm: number): Promise<Blob> => {
  let maxTick = 0;
  tracks.forEach(track => {
    if (track.isMuted) return;
    track.notes.forEach(note => {
      const end = note.startTick + note.durationTicks;
      if (end > maxTick) maxTick = end;
    });
  });
  if (maxTick === 0) maxTick = 480 * 4;

  const secondsPerTick = 60 / (bpm * 480);
  const totalSeconds = (maxTick * secondsPerTick) + 1.5;

  const renderedBuffer = await Tone.Offline(async () => {
    const offlineChorus = new Tone.Chorus({ frequency: 2, delayTime: 2.5, depth: 0.5 }).start();
    const offlineDelay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.2 });
    const offlineReverb = new Tone.Reverb({ decay: 1.5 });
    offlineChorus.chain(offlineDelay, offlineReverb, Tone.Destination);

    tracks.forEach(track => {
      if (track.isMuted || track.notes.length === 0) return;
      const channel = new Tone.Channel({
        volume: Tone.gainToDb(Math.max(0.001, track.volume / 100)),
        pan: Math.max(-1, Math.min(1, (track.pan || 0) / 100))
      }).connect(offlineChorus);

      const synth = new Tone.PolySynth(Tone.Synth).connect(channel);

      track.notes.forEach(note => {
        const time = note.startTick * secondsPerTick;
        const dur = note.durationTicks * secondsPerTick;
        let pitch = note.pitch;
        if (track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim') {
          pitch = DRUM_TONE_MAP[note.pitch] || 'C2';
        }
        synth.triggerAttackRelease(pitch, dur, time, note.velocity / 100);
      });
    });
  }, totalSeconds);

  const rawBuffer = renderedBuffer.get();
  if (!rawBuffer) throw new Error('Falha ao renderizar buffer de áudio.');
  return encodeAudioBufferToWav(rawBuffer);
};