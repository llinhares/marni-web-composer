import * as Tone from 'tone';
import { type Track } from '@/types';
import { useComposerStore } from '@/store/useComposerStore';

import { DRUM_TONE_MAP, createInstrument, instruments, fallbackSynth } from './ToneInstruments';
import { chorus } from './ToneEffects';

export { updateEffector, updateMasterVolume, getMasterLevel } from './ToneEffects';

Tone.Transport.PPQ = 480;

const trackChannels: Record<string, Tone.Channel> = {};
const trackParts: Record<string, Tone.Part> = {};
const trackMeters: Record<string, Tone.Meter> = {};

export const getTrackLevel = (trackId: string): number => {
  if (!trackMeters[trackId]) return -100;
  const val = trackMeters[trackId].getValue();
  return typeof val === 'number' ? val : -100;
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
    instruments[key] = createInstrument(type, channel);
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