import * as Tone from 'tone';
import { type Track, type EffectorSettings } from '@/types';
import { useComposerStore } from '@/store/useComposerStore';

Tone.Transport.PPQ = 480;

const trackChannels: Record<string, Tone.Channel> = {};

const getTrackChannel = (trackId: string) => {
  if (!trackChannels[trackId]) {
    trackChannels[trackId] = new Tone.Channel().connect(chorus);
  }
  return trackChannels[trackId];
};

const chorus = new Tone.Chorus({ frequency: 2, delayTime: 2.5, depth: 0.5 }).start();
const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.2 });
const reverb = new Tone.Reverb({ decay: 1.5 });

chorus.chain(delay, reverb, Tone.Destination);
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

const instruments: Record<string, Tone.Sampler | Tone.PolySynth> = {};

const getInstrument = (type: string, trackId: string) => {
  const key = `${type}-${trackId}`;
  
  if (!instruments[key]) {
    const channel = getTrackChannel(trackId);
    
    if (type === 'Grand Piano') {
      instruments[key] = new Tone.Sampler({
        urls: { A0: "A0.mp3", C1: "C1.mp3", C4: "C4.mp3", A7: "A7.mp3" },
        baseUrl: "https://tonejs.github.io/audio/salamander/"
      }).connect(channel);
    } 
    else if (type === 'Flauta Transversal' || type === 'Clarinete') {
      instruments[key] = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2, modulationIndex: 1.5,
        oscillator: { type: "sine" }, 
        envelope: { attack: 0.1, decay: 0.2, sustain: 1, release: 0.8 },
      }).connect(channel);
    } 
    else if (type === 'Contrabaixo' || type === 'Violino') {
      instruments[key] = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" }, 
        envelope: { attack: 0.4, decay: 0.1, sustain: 0.8, release: 1.5 }
      }).connect(channel);
    } 
    else if (type === 'Kit de Bateria' || type === 'Tamborim') {
      instruments[key] = new Tone.Sampler({
        urls: {
          "C2": "kick.flac",   
          "D2": "snare.flac",  
          "F#2": "hihat.flac",
          "F2": "tom1.flac",
          "C#3": "crash.flac",
        },
        baseUrl: "/samples/percussao/"
      }).connect(channel);
    } 
    else if (type === 'Harpa') {
      instruments[key] = new Tone.Sampler({
        urls: {
          "A2": "A2_f1.flac",
          "A6": "A6_f1.flac",
          "B1": "B1_f1.flac",
          "B3": "B3_f1.flac",
          "B5": "B5_f1.flac",
          "B6": "B6_f1.flac",
          "C3": "C3_f2.flac",
          "C5": "C5_f1.flac",
          "D2": "D2_f1.flac",
          "D4": "D4_mf1.flac",
          "D6": "D6_f1.flac",
          "D7": "D7_f1.flac",
          "E1": "E1_f1.flac",
          "E3": "E3_f1.flac",
          "E5": "E5_f1.flac",
          "F2": "F2_f1.flac",
          "F4": "F4_f1.flac",
          "F6": "F6_f1.flac",
          "F7": "F7_f1.flac",
          "G1": "G1_f1.flac",
          "G3": "G3_f1.flac",
          "G5": "G5_f1.flac",
        },
        baseUrl: "/samples/harpa/",
        release: 2,
      }).connect(channel);
    }
    else if (type === 'Violão Acústico') {
      instruments[key] = new Tone.Sampler({
        urls: {
          "E2": "HV_40.wav",
          "A2": "HV_45.wav",
          "D3": "HV_50.wav",
          "G3": "HV_55.wav",
          "C4": "HV_60.wav",
          "F4": "HV_65.wav",
          "A#4": "HV_70.wav",
          "D#5": "HV_75.wav",
          "G#5": "HV_80.wav",
          "B5": "HV_83.wav",
        },
        baseUrl: "/samples/violao/",
        release: 1.5,
      }).connect(channel);
    }
    else {
      instruments[key] = new Tone.PolySynth().connect(channel);
    }
  }
  
  return instruments[key];
};

export const updateTrackAudio = (trackId: string, volume: number, isMuted: boolean, isSolo: boolean, hasOtherSolo: boolean) => {
  const channel = getTrackChannel(trackId);
  channel.volume.value = Tone.gainToDb(volume / 100);
  if (hasOtherSolo) channel.mute = !isSolo;
  else channel.mute = isMuted;
};

export const setGlobalBpm = (bpm: number) => { Tone.Transport.bpm.value = bpm; };

export const playFeedbackNote = async (pitch: string, track: Track, hasOtherSolo: boolean) => {
  if (Tone.context.state !== 'running') await Tone.start();
  if (hasOtherSolo ? !track.isSolo : track.isMuted) return;
  
  const inst = getInstrument(track.instrument, track.id);
  
  let playPitch = pitch;
  if (track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim') {
    playPitch = DRUM_TONE_MAP[pitch] || 'C2';
  }

  if (inst instanceof Tone.Sampler && !inst.loaded) return;

  inst.triggerAttackRelease(playPitch, '8n');
};

export const playComposition = async (tracks: Track[], bpm: number) => {
  if (Tone.context.state !== 'running') await Tone.start();
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = bpm;

  const hasSolo = tracks.some(t => t.isSolo);
  let lastTick = 0;

  tracks.forEach(track => {
    updateTrackAudio(track.id, track.volume, track.isMuted, track.isSolo, hasSolo);
    const inst = getInstrument(track.instrument, track.id);

    track.notes.forEach(note => {
      const endTick = note.startTick + note.durationTicks;
      if (endTick > lastTick) lastTick = endTick;

      let playPitch = note.pitch;
      if (track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim') {
        playPitch = DRUM_TONE_MAP[note.pitch] || 'C2';
      }

      Tone.Transport.schedule((time) => {
        if (inst instanceof Tone.Sampler && !inst.loaded) return;
        
        inst.triggerAttackRelease(playPitch, `${note.durationTicks}i`, time, note.velocity / 100);
      }, `${note.startTick}i`);
    });
  });

  if (lastTick > 0) {
    Tone.Transport.schedule(() => {
      Tone.Transport.stop();
      useComposerStore.getState().setIsPlaying(false);
    }, `${lastTick + 1920}i`);
  }
  Tone.Transport.start();
};

export const stopComposition = () => { Tone.Transport.stop(); };