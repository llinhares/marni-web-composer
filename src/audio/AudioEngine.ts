/**
 * Marni Audio Engine
 * High-performance Web Audio API synthesis for all Black Desert Online instruments,
 * Master Effector rack (Reverb, Stereo Delay, Chorus), and multi-track routing.
 * Built with zero-residual-hum protection and automatic oscillator termination.
 */

import type { InstrumentId, EffectorSettings, Track, Note } from '../types/music.ts';
import { pitchToFrequency, ticksToSeconds } from '../utils/musicMath.ts';
import { WorkerTimer } from './workerTimer.ts';
import {
  audibleTracks,
  notesInWindow,
  reanchor,
  songEndTick,
  sortedByStart,
  tickAtTime,
  timeAtTick,
  type TimelineAnchor,
} from './scheduling.ts';
import { sampleLibrary, pickSample, DECAYING_INSTRUMENTS, type SampleSet } from './sampleLibrary.ts';

const LOOKAHEAD_SEC = 0.15;

export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private isInitialized = false;
  private readonly offlineContext: OfflineAudioContext | null;

  // Master Nodes
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private playbackBus: GainNode | null = null;

  // Send FX Nodes
  private auxSendBus: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayFilter: BiquadFilterNode | null = null;
  private delayGain: GainNode | null = null;

  private chorusDelayNode: DelayNode | null = null;
  private chorusLfo: OscillatorNode | null = null;
  private chorusLfoGain: GainNode | null = null;
  private chorusGain: GainNode | null = null;

  // Active playing voices for note-off handling
  private activeAuditionVoices = new Map<string, { stop: (time: number) => void }>();
  private activePlaybackVoices = new Map<string, Set<(time: number) => void>>(); // by track id

  // Worker-driven lookahead playback scheduler
  private workerTimer: WorkerTimer | null = null;
  private isPlaying = false;
  private playheadTick = 0;
  private tempoBpm = 120;
  private activeTracks: Track[] = [];
  private anchor: TimelineAnchor = { audioTime: 0, tick: 0, bpm: 120 };
  private scheduledUntilTick = 0;
  private playStartTick = 0; // notes before this tick are never played (count-in region)
  private songEnd = 0;
  private metronome = { enabled: false, beatsPerBar: 4 };
  private loop: { start: number; end: number } | null = null;
  private preWrapAnchor: TimelineAnchor | null = null;
  private wrapAudioTime = 0;
  private onPlayheadTickUpdate: ((tick: number) => void) | null = null;
  private onPlaybackEnded: (() => void) | null = null;
  private currentEffectorSettings: EffectorSettings | null = null;

  /** With `context`, the engine renders into that OfflineAudioContext (WAV export) instead of the speakers. */
  constructor(options: { context?: OfflineAudioContext } = {}) {
    this.offlineContext = options.context ?? null;
    if (!this.offlineContext) this.workerTimer = new WorkerTimer(20);
  }

  private get isOffline(): boolean {
    return this.offlineContext !== null;
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    if (this.offlineContext) {
      this.ctx = this.offlineContext;
    } else {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const live = new AudioContextClass({ latencyHint: 'interactive' });
      this.ctx = live;
      if (live.state === 'suspended') {
        await live.resume();
      }
    }

    // 1. Master Output Chain with safety limiter
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(6.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(12.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    this.playbackBus = this.ctx.createGain();
    this.playbackBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.playbackBus.connect(this.masterGain);

    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.ctx.destination);

    // 2. Aux Send FX Bus
    this.auxSendBus = this.ctx.createGain();
    this.auxSendBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // 3. Reverb (Procedural Impulse Response for rich hall / Marni cavern)
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this.buildImpulseResponse(2.0, 2.2);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.auxSendBus.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);

    // 4. Stereo Delay
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(0.3, this.ctx.currentTime);

    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.delayFilter = this.ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.setValueAtTime(2800, this.ctx.currentTime);

    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.auxSendBus.connect(this.delayNode);
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode); // feedback loop
    this.delayFilter.connect(this.delayGain);
    this.delayGain.connect(this.masterGain);

    // 5. Chorus
    this.chorusDelayNode = this.ctx.createDelay(0.1);
    this.chorusDelayNode.delayTime.setValueAtTime(0.025, this.ctx.currentTime);

    this.chorusLfo = this.ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.setValueAtTime(1.5, this.ctx.currentTime);

    this.chorusLfoGain = this.ctx.createGain();
    this.chorusLfoGain.gain.setValueAtTime(0.003, this.ctx.currentTime);

    this.chorusGain = this.ctx.createGain();
    this.chorusGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.chorusLfo.connect(this.chorusLfoGain);
    this.chorusLfoGain.connect(this.chorusDelayNode.delayTime);
    this.auxSendBus.connect(this.chorusDelayNode);
    this.chorusDelayNode.connect(this.chorusGain);
    this.chorusGain.connect(this.masterGain);

    try {
      this.chorusLfo.start();
    } catch {
      // already started
    }

    this.isInitialized = true;
    if (this.currentEffectorSettings) {
      this.updateEffectorSettings(this.currentEffectorSettings);
    }
  }

  private buildImpulseResponse(duration: number, decay: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }

    return impulse;
  }

  private buildNoiseBuffer(duration: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const noise = this.ctx.createBuffer(1, length, sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  public updateEffectorSettings(fx: EffectorSettings) {
    this.currentEffectorSettings = fx;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Offline renders start at t=0: set values directly instead of gliding into them
    const glide = (param: AudioParam, value: number) =>
      this.isOffline ? param.setValueAtTime(value, now) : param.setTargetAtTime(value, now, 0.05);

    // Reverb
    if (this.reverbGain) {
      const revVol = fx.reverb.enabled ? (fx.reverb.mix / 100) * 0.7 : 0;
      glide(this.reverbGain.gain, revVol);
    }

    // Delay
    if (this.delayGain && this.delayFeedbackGain && this.delayNode) {
      const delVol = fx.delay.enabled ? (fx.delay.mix / 100) * 0.6 : 0;
      const feedback = fx.delay.enabled ? Math.min(0.85, (fx.delay.feedback / 100) * 0.8) : 0;
      const delayTime = Math.max(0.05, Math.min(1.5, (fx.delay.time / 100) * 0.8 + 0.05));

      glide(this.delayGain.gain, delVol);
      glide(this.delayFeedbackGain.gain, feedback);
      glide(this.delayNode.delayTime, delayTime);
    }

    // Chorus
    if (this.chorusGain && this.chorusLfo && this.chorusLfoGain) {
      const choVol = fx.chorus.enabled ? (fx.chorus.mix / 100) * 0.5 : 0;
      const rate = Math.max(0.1, (fx.chorus.lfoFrequency / 100) * 5.0 + 0.2);
      const depth = (fx.chorus.lfoDepth / 100) * 0.005 + 0.0005;

      glide(this.chorusGain.gain, choVol);
      glide(this.chorusLfo.frequency, rate);
      glide(this.chorusLfoGain.gain, depth);
    }
  }

  public setMasterVolume(volume: number) {
    if (!this.ctx || !this.masterGain) return;
    const gainVal = Math.max(0, Math.min(1, volume / 100));
    this.masterGain.gain.setTargetAtTime(gainVal, this.ctx.currentTime, 0.03);
  }

  public playNote(
    instrumentId: InstrumentId,
    pitch: number,
    velocity = 90,
    durationSeconds = 1.0,
    trackVolume = 80,
    auxSend = true,
    trackPan = 0,
    sustain = false
  ): string {
    if (!this.ctx) {
      this.init();
      if (!this.ctx) return '';
    }

    const noteVoiceId = `${instrumentId}-${pitch}-${Date.now()}-${Math.random()}`;
    const startTime = this.ctx.currentTime;
    const stopFn = this.synthesizeInstrument(
      instrumentId,
      pitch,
      velocity,
      startTime,
      durationSeconds,
      trackVolume,
      auxSend,
      trackPan,
      false, // direct audition
      sustain
    );

    this.activeAuditionVoices.set(noteVoiceId, { stop: stopFn });

    const auditRelease = sustain ? 2.5 : 0.8;
    setTimeout(() => {
      this.activeAuditionVoices.delete(noteVoiceId);
    }, (durationSeconds + auditRelease) * 1000);

    return noteVoiceId;
  }

  public stopNote(noteVoiceId: string) {
    const voice = this.activeAuditionVoices.get(noteVoiceId);
    if (voice && this.ctx) {
      voice.stop(this.ctx.currentTime);
      this.activeAuditionVoices.delete(noteVoiceId);
    }
  }

  public stopAllNotes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.activeAuditionVoices.forEach((voice) => {
      try {
        voice.stop(now);
      } catch {}
    });
    this.activeAuditionVoices.clear();
  }

  /**
   * Plays one recorded sample into the voice chain. Plucked/struck instruments ring out after the
   * note ends (longer with the sustain pedal); sustained instruments release at the note end.
   */
  private playSample(
    set: SampleSet,
    pitch: number,
    velFactor: number,
    volFactor: number,
    startTime: number,
    duration: number,
    sustain: boolean,
    destination: AudioNode
  ): ((stopTime: number) => void) | null {
    if (!this.ctx) return null;
    const picked = pickSample(pitch, set.pitches);
    const buffer = picked ? set.buffers.get(picked.samplePitch) : undefined;
    if (!picked || !buffer) return null;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(picked.rate, startTime);

    const amp = this.ctx.createGain();
    // SoundFont samples are recorded with headroom: x6 matches the level of the previous synth voices
    const peak = Math.max(0.0001, velFactor * volFactor * 6);
    amp.gain.setValueAtTime(peak, startTime);

    const decaying = DECAYING_INSTRUMENTS.has(set.instrumentId);
    const ring = decaying ? (sustain ? 2.5 : 0.35) : 0.12;
    const releaseAt = startTime + duration;
    amp.gain.setTargetAtTime(0, releaseAt, ring / 4);

    src.connect(amp);
    amp.connect(destination);
    const naturalEnd = startTime + buffer.duration / picked.rate;
    src.start(startTime);
    src.stop(Math.min(naturalEnd, releaseAt + ring * 1.5) + 0.05);

    // The destination voice gain is still at 0 from its creation: open it for the sample
    if (destination instanceof GainNode) destination.gain.setValueAtTime(1, startTime);

    return (stopTime: number) => {
      try {
        // Released key: decaying instruments ring briefly (longer with sustain), others stop quickly
        const tau = Math.max(0.02, ring / 4);
        amp.gain.cancelScheduledValues(stopTime);
        amp.gain.setTargetAtTime(0, stopTime, tau);
        src.stop(stopTime + tau * 6);
      } catch {}
    };
  }

  private synthesizeInstrument(
    instrumentId: InstrumentId,
    pitch: number,
    velocity: number,
    startTime: number,
    duration: number,
    trackVolume: number,
    auxSend: boolean,
    pan: number,
    isPlayback = true,
    sustain = false
  ): (stopTime: number) => void {
    if (!this.ctx || !this.masterGain) return () => {};

    const freq = pitchToFrequency(pitch);
    const velFactor = Math.pow(Math.max(1, Math.min(127, velocity)) / 127, 1.2);
    const volFactor = (trackVolume / 100) * 0.6;
    const noteEndTime = startTime + duration;

    // Connect through playbackBus for songs, or masterGain for direct auditions
    const destinationNode = isPlayback && this.playbackBus ? this.playbackBus : this.masterGain;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0, startTime);

    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startTime);
      voiceGain.connect(panner);
      panner.connect(destinationNode);
      if (auxSend && this.auxSendBus) {
        panner.connect(this.auxSendBus);
      }
    } else {
      voiceGain.connect(destinationNode);
      if (auxSend && this.auxSendBus) {
        voiceGain.connect(this.auxSendBus);
      }
    }

    const stopCallbacks: ((t: number) => void)[] = [];

    // Cleanup voiceGain from audio graph (not offline: the render may run slower than these timers)
    const samples = sampleLibrary.get(instrumentId);
    const voiceLifeSec = duration + (samples ? 4 : sustain ? 2.5 : 1.2);
    if (!this.isOffline) {
      setTimeout(() => {
        try {
          voiceGain.disconnect();
          if (panner) panner.disconnect();
        } catch {}
      }, voiceLifeSec * 1000);
    }

    // Sampled instrument (falls back to the synthesizer below while loading or if unavailable)
    if (samples) {
      const stop = this.playSample(samples, pitch, velFactor, volFactor, startTime, duration, sustain, voiceGain);
      if (stop) return stop;
    }

    switch (instrumentId) {
      case 'grand-piano': {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const osc3 = this.ctx.createOscillator();

        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc3.type = 'sawtooth';

        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.frequency.setValueAtTime(freq * 2.001, startTime);
        osc3.frequency.setValueAtTime(freq * 3.003, startTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const cutoff = Math.min(16000, Math.max(300, freq * (3 + velFactor * 6)));
        filter.frequency.setValueAtTime(cutoff, startTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff * 0.4), startTime + duration);

        const subGain1 = this.ctx.createGain();
        const subGain2 = this.ctx.createGain();
        const subGain3 = this.ctx.createGain();

        subGain1.gain.setValueAtTime(0.7, startTime);
        subGain2.gain.setValueAtTime(0.25, startTime);
        subGain3.gain.setValueAtTime(0.1, startTime);

        osc1.connect(subGain1);
        osc2.connect(subGain2);
        osc3.connect(subGain3);

        subGain1.connect(filter);
        subGain2.connect(filter);
        subGain3.connect(filter);
        filter.connect(voiceGain);

        const releaseTime = sustain ? 2.0 : 0.25;
        const targetVol = velFactor * volFactor;
        voiceGain.gain.setValueAtTime(0.0001, startTime);
        voiceGain.gain.linearRampToValueAtTime(targetVol, startTime + 0.005);
        voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetVol * 0.6), startTime + 0.2);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, noteEndTime + releaseTime);
        voiceGain.gain.setValueAtTime(0.0, noteEndTime + releaseTime + 0.01);

        osc1.start(startTime);
        osc2.start(startTime);
        osc3.start(startTime);

        // ALWAYS schedule hard stop to kill oscillators!
        const autoStopT = noteEndTime + releaseTime + 0.05;
        osc1.stop(autoStopT);
        osc2.stop(autoStopT);
        osc3.stop(autoStopT);

        stopCallbacks.push((stopT) => {
          voiceGain.gain.cancelScheduledValues(stopT);
          voiceGain.gain.setValueAtTime(0.0, stopT);
          try {
            osc1.stop(stopT + 0.02);
            osc2.stop(stopT + 0.02);
            osc3.stop(stopT + 0.02);
          } catch {}
        });
        break;
      }

      case 'flute': {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        const vibrato = this.ctx.createOscillator();
        const vibratoGain = this.ctx.createGain();
        vibrato.frequency.setValueAtTime(5.5, startTime);
        vibratoGain.gain.setValueAtTime(freq * 0.015, startTime);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        const noiseBuffer = this.buildNoiseBuffer(duration);
        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(Math.min(10000, freq * 2.5), startTime);
        noiseFilter.Q.setValueAtTime(4.0, startTime);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.035 * velFactor, startTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.005 * velFactor, startTime + 0.15);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(voiceGain);

        osc.connect(voiceGain);

        const targetVol = velFactor * volFactor * 0.9;
        voiceGain.gain.setValueAtTime(0.0001, startTime);
        voiceGain.gain.linearRampToValueAtTime(targetVol, startTime + 0.04);
        voiceGain.gain.setValueAtTime(targetVol, startTime + Math.max(0.05, duration - 0.04));
        voiceGain.gain.linearRampToValueAtTime(0.0, noteEndTime);

        osc.start(startTime);
        vibrato.start(startTime);
        noiseSource.start(startTime);

        const autoStopT = noteEndTime + 0.05;
        osc.stop(autoStopT);
        vibrato.stop(autoStopT);
        noiseSource.stop(autoStopT);

        stopCallbacks.push((stopT) => {
          voiceGain.gain.cancelScheduledValues(stopT);
          voiceGain.gain.setValueAtTime(0.0, stopT);
          try {
            osc.stop(stopT + 0.02);
            vibrato.stop(stopT + 0.02);
            noiseSource.stop(stopT + 0.02);
          } catch {}
        });
        break;
      }

      case 'violin': {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);

        const vibrato = this.ctx.createOscillator();
        const vibratoGain = this.ctx.createGain();
        vibrato.frequency.setValueAtTime(6.0, startTime);
        vibratoGain.gain.setValueAtTime(freq * 0.02, startTime);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        const bodyFilter = this.ctx.createBiquadFilter();
        bodyFilter.type = 'bandpass';
        bodyFilter.frequency.setValueAtTime(Math.min(8000, Math.max(400, freq * 1.8)), startTime);
        bodyFilter.Q.setValueAtTime(2.5, startTime);

        osc.connect(bodyFilter);
        bodyFilter.connect(voiceGain);

        const targetVol = velFactor * volFactor * 0.8;
        voiceGain.gain.setValueAtTime(0.0001, startTime);
        voiceGain.gain.linearRampToValueAtTime(targetVol, startTime + 0.05);
        voiceGain.gain.setValueAtTime(targetVol, startTime + Math.max(0.06, duration - 0.06));
        voiceGain.gain.linearRampToValueAtTime(0.0, noteEndTime + 0.05);

        osc.start(startTime);
        vibrato.start(startTime);

        const autoStopT = noteEndTime + 0.1;
        osc.stop(autoStopT);
        vibrato.stop(autoStopT);

        stopCallbacks.push((stopT) => {
          voiceGain.gain.cancelScheduledValues(stopT);
          voiceGain.gain.setValueAtTime(0.0, stopT);
          try {
            osc.stop(stopT + 0.02);
            vibrato.stop(stopT + 0.02);
          } catch {}
        });
        break;
      }

      case 'percussion': {
        const targetVol = velFactor * volFactor * 1.25;

        // Determine exact drum piece
        let drumType: 'kick' | 'snare' | 'rimshot' | 'tom' | 'hihat_closed' | 'hihat_pedal' | 'hihat_open' | 'crash' | 'ride' = 'tom';
        let tomIndex = 1;

        if (pitch === 48 || pitch === 35 || pitch === 36) {
          drumType = 'kick';
        } else if (pitch === 50 || pitch === 52 || pitch === 38 || pitch === 40) {
          drumType = 'snare';
        } else if (pitch === 51 || pitch === 37) {
          drumType = 'rimshot';
        } else if (pitch === 54 || pitch === 42) {
          drumType = 'hihat_closed';
        } else if (pitch === 56 || pitch === 44) {
          drumType = 'hihat_pedal';
        } else if (pitch === 58 || pitch === 46) {
          drumType = 'hihat_open';
        } else if (pitch === 53 || pitch === 41) {
          drumType = 'tom';
          tomIndex = 1; // Floor Tom Low
        } else if (pitch === 55 || pitch === 43) {
          drumType = 'tom';
          tomIndex = 2; // Low Mid Tom
        } else if (pitch === 57 || pitch === 45) {
          drumType = 'tom';
          tomIndex = 3; // Mid Tom
        } else if (pitch === 59 || pitch === 47) {
          drumType = 'tom';
          tomIndex = 4; // High Mid Tom
        } else if (pitch === 60) {
          drumType = 'tom';
          tomIndex = 5; // High Tom
        } else if (pitch === 61 || pitch === 49) {
          drumType = 'crash';
        } else if (pitch === 62) {
          drumType = 'ride';
        } else if (pitch < 48) {
          drumType = pitch < 38 ? 'kick' : 'tom';
          tomIndex = 1;
        } else if (pitch > 62) {
          drumType = pitch > 72 ? 'crash' : 'ride';
        } else {
          drumType = 'tom';
          tomIndex = 3;
        }

        if (drumType === 'kick') {
          // Punchy Sub Kick with Click Transient
          const kickOsc = this.ctx.createOscillator();
          kickOsc.type = 'sine';
          kickOsc.frequency.setValueAtTime(160, startTime);
          kickOsc.frequency.exponentialRampToValueAtTime(42, startTime + 0.08);

          // Initial transient click for punch
          const clickOsc = this.ctx.createOscillator();
          clickOsc.type = 'triangle';
          clickOsc.frequency.setValueAtTime(420, startTime);
          clickOsc.frequency.exponentialRampToValueAtTime(80, startTime + 0.02);

          const clickGain = this.ctx.createGain();
          clickGain.gain.setValueAtTime(0.4, startTime);
          clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.025);

          clickOsc.connect(clickGain);
          clickGain.connect(voiceGain);
          kickOsc.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 1.3, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);
          voiceGain.gain.setValueAtTime(0.0, startTime + 0.36);

          kickOsc.start(startTime);
          clickOsc.start(startTime);
          const stopT = startTime + 0.38;
          kickOsc.stop(stopT);
          clickOsc.stop(startTime + 0.03);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { kickOsc.stop(st + 0.01); clickOsc.stop(st + 0.01); } catch {}
          });
        } else if (drumType === 'snare') {
          // Acoustic Snare: Punchy Body Sine + Crisp Wire Noise Burst
          const snareTone = this.ctx.createOscillator();
          snareTone.type = 'sine';
          snareTone.frequency.setValueAtTime(260, startTime);
          snareTone.frequency.exponentialRampToValueAtTime(130, startTime + 0.09);

          const toneGain = this.ctx.createGain();
          toneGain.gain.setValueAtTime(0.8, startTime);
          toneGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);
          snareTone.connect(toneGain);
          toneGain.connect(voiceGain);

          // Snare wire rattle
          const snareNoise = this.ctx.createBufferSource();
          snareNoise.buffer = this.buildNoiseBuffer(0.28);

          const bpf = this.ctx.createBiquadFilter();
          bpf.type = 'bandpass';
          bpf.frequency.setValueAtTime(2400, startTime);
          bpf.Q.setValueAtTime(1.8, startTime);

          const hpf = this.ctx.createBiquadFilter();
          hpf.type = 'highpass';
          hpf.frequency.setValueAtTime(1100, startTime);

          snareNoise.connect(bpf);
          bpf.connect(hpf);
          hpf.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 1.35, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
          voiceGain.gain.setValueAtTime(0.0, startTime + 0.26);

          snareTone.start(startTime);
          snareNoise.start(startTime);
          snareTone.stop(startTime + 0.27);
          snareNoise.stop(startTime + 0.27);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { snareTone.stop(st + 0.01); snareNoise.stop(st + 0.01); } catch {}
          });
        } else if (drumType === 'rimshot') {
          // Sharp Wood/Metal Rimshot Click
          const rimTone = this.ctx.createOscillator();
          rimTone.type = 'triangle';
          rimTone.frequency.setValueAtTime(820, startTime);
          rimTone.frequency.exponentialRampToValueAtTime(320, startTime + 0.035);

          const rimNoise = this.ctx.createBufferSource();
          rimNoise.buffer = this.buildNoiseBuffer(0.08);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(3200, startTime);
          filter.Q.setValueAtTime(3.5, startTime);

          rimNoise.connect(filter);
          filter.connect(voiceGain);
          rimTone.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 1.2, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.07);
          voiceGain.gain.setValueAtTime(0.0, startTime + 0.08);

          rimTone.start(startTime);
          rimNoise.start(startTime);
          rimTone.stop(startTime + 0.09);
          rimNoise.stop(startTime + 0.09);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { rimTone.stop(st + 0.01); rimNoise.stop(st + 0.01); } catch {}
          });
        } else if (drumType === 'tom') {
          // Resonant Tuned Acoustic Toms (1 to 5) - NO HI-HAT NOISE!
          const tomFreqs = [
            { start: 110, end: 72, decay: 0.40 },  // Tom 1 (Floor Low)
            { start: 145, end: 98, decay: 0.36 },  // Tom 2 (Low Mid)
            { start: 185, end: 130, decay: 0.32 }, // Tom 3 (Mid)
            { start: 235, end: 168, decay: 0.28 }, // Tom 4 (High Mid)
            { start: 290, end: 215, decay: 0.25 }, // Tom 5 (High)
          ];
          const cfg = tomFreqs[Math.min(4, Math.max(0, tomIndex - 1))];

          const tomOsc = this.ctx.createOscillator();
          tomOsc.type = 'sine';
          tomOsc.frequency.setValueAtTime(cfg.start, startTime);
          tomOsc.frequency.exponentialRampToValueAtTime(cfg.end, startTime + 0.12);

          // Skin membrane harmonic overtone
          const tomSkin = this.ctx.createOscillator();
          tomSkin.type = 'triangle';
          tomSkin.frequency.setValueAtTime(cfg.start * 1.48, startTime);
          tomSkin.frequency.exponentialRampToValueAtTime(cfg.end * 1.48, startTime + 0.07);

          const skinGain = this.ctx.createGain();
          skinGain.gain.setValueAtTime(0.35, startTime);
          skinGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

          const lpf = this.ctx.createBiquadFilter();
          lpf.type = 'lowpass';
          lpf.frequency.setValueAtTime(1900, startTime);

          tomOsc.connect(lpf);
          tomSkin.connect(skinGain);
          skinGain.connect(lpf);
          lpf.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 1.2, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + cfg.decay);
          voiceGain.gain.setValueAtTime(0.0, startTime + cfg.decay + 0.01);

          tomOsc.start(startTime);
          tomSkin.start(startTime);
          const stopT = startTime + cfg.decay + 0.02;
          tomOsc.stop(stopT);
          tomSkin.stop(startTime + 0.1);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { tomOsc.stop(st + 0.01); tomSkin.stop(st + 0.01); } catch {}
          });
        } else if (drumType === 'hihat_closed' || drumType === 'hihat_pedal') {
          // Closed / Pedal Hi-Hat
          const isPedal = drumType === 'hihat_pedal';
          const hatNoise = this.ctx.createBufferSource();
          hatNoise.buffer = this.buildNoiseBuffer(isPedal ? 0.09 : 0.06);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(isPedal ? 5500 : 7500, startTime);

          hatNoise.connect(filter);
          filter.connect(voiceGain);

          const decayTime = isPedal ? 0.075 : 0.055;
          voiceGain.gain.setValueAtTime(targetVol * 0.9, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + decayTime);
          voiceGain.gain.setValueAtTime(0.0, startTime + decayTime + 0.01);

          hatNoise.start(startTime);
          hatNoise.stop(startTime + decayTime + 0.02);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { hatNoise.stop(st + 0.01); } catch {}
          });
        } else if (drumType === 'hihat_open') {
          // Open Hi-Hat
          const hatNoise = this.ctx.createBufferSource();
          hatNoise.buffer = this.buildNoiseBuffer(0.5);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(6800, startTime);

          const bpf = this.ctx.createBiquadFilter();
          bpf.type = 'bandpass';
          bpf.frequency.setValueAtTime(9200, startTime);
          bpf.Q.setValueAtTime(1.8, startTime);

          hatNoise.connect(filter);
          filter.connect(bpf);
          bpf.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 0.95, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);
          voiceGain.gain.setValueAtTime(0.0, startTime + 0.46);

          hatNoise.start(startTime);
          hatNoise.stop(startTime + 0.48);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { hatNoise.stop(st + 0.01); } catch {}
          });
        } else if (drumType === 'crash') {
          // Crash Cymbal (Explosive & Shimmering)
          const crashNoise = this.ctx.createBufferSource();
          crashNoise.buffer = this.buildNoiseBuffer(1.4);

          const hpf = this.ctx.createBiquadFilter();
          hpf.type = 'highpass';
          hpf.frequency.setValueAtTime(4500, startTime);

          const ring1 = this.ctx.createOscillator();
          ring1.type = 'triangle';
          ring1.frequency.setValueAtTime(360, startTime);
          const ring2 = this.ctx.createOscillator();
          ring2.type = 'sine';
          ring2.frequency.setValueAtTime(585, startTime);

          const ringGain = this.ctx.createGain();
          ringGain.gain.setValueAtTime(0.12, startTime);
          ringGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

          ring1.connect(ringGain);
          ring2.connect(ringGain);
          ringGain.connect(voiceGain);

          crashNoise.connect(hpf);
          hpf.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 1.1, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.25);
          voiceGain.gain.setValueAtTime(0.0, startTime + 1.26);

          crashNoise.start(startTime);
          ring1.start(startTime);
          ring2.start(startTime);
          const stopT = startTime + 1.3;
          crashNoise.stop(stopT);
          ring1.stop(stopT);
          ring2.stop(stopT);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { crashNoise.stop(st + 0.01); ring1.stop(st + 0.01); ring2.stop(st + 0.01); } catch {}
          });
        } else {
          // Ride Cymbal (Crisp Bell Ping + Shimmer)
          const ping1 = this.ctx.createOscillator();
          ping1.type = 'sine';
          ping1.frequency.setValueAtTime(820, startTime);
          const ping2 = this.ctx.createOscillator();
          ping2.type = 'triangle';
          ping2.frequency.setValueAtTime(1160, startTime);

          const rideNoise = this.ctx.createBufferSource();
          rideNoise.buffer = this.buildNoiseBuffer(0.8);
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(7000, startTime);

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(0.2, startTime);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

          rideNoise.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(voiceGain);

          ping1.connect(voiceGain);
          ping2.connect(voiceGain);

          voiceGain.gain.setValueAtTime(targetVol * 0.9, startTime);
          voiceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.75);
          voiceGain.gain.setValueAtTime(0.0, startTime + 0.76);

          ping1.start(startTime);
          ping2.start(startTime);
          rideNoise.start(startTime);
          const stopT = startTime + 0.8;
          ping1.stop(stopT);
          ping2.stop(stopT);
          rideNoise.stop(stopT);

          stopCallbacks.push((st) => {
            voiceGain.gain.setValueAtTime(0.0, st);
            try { ping1.stop(st + 0.01); ping2.stop(st + 0.01); rideNoise.stop(st + 0.01); } catch {}
          });
        }
        break;
      }

      default: {
        // Universal acoustic/synth voice with strict auto-stop
        const osc = this.ctx.createOscillator();
        osc.type = instrumentId === 'bass' || instrumentId === 'guitar' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        osc.connect(voiceGain);
        const targetVol = velFactor * volFactor;
        voiceGain.gain.setValueAtTime(0.0001, startTime);
        voiceGain.gain.linearRampToValueAtTime(targetVol, startTime + 0.01);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, noteEndTime + 0.2);
        voiceGain.gain.setValueAtTime(0.0, noteEndTime + 0.21);

        osc.start(startTime);
        osc.stop(noteEndTime + 0.22);

        stopCallbacks.push((stopT) => {
          voiceGain.gain.setValueAtTime(0.0, stopT);
          try { osc.stop(stopT + 0.02); } catch {}
        });
        break;
      }
    }

    return (stopTime: number) => {
      try {
        voiceGain.gain.cancelScheduledValues(0);
        voiceGain.gain.setValueAtTime(0, stopTime);
        voiceGain.disconnect();
      } catch {}
      if (panner) {
        try { panner.disconnect(); } catch {}
      }
      stopCallbacks.forEach((cb) => {
        try { cb(stopTime); } catch {}
      });
    };
  }

  public startPlayback(
    tracks: Track[],
    bpm: number,
    startTick: number = 0,
    onTickUpdate?: (tick: number) => void,
    onEnded?: () => void,
    options: { countInTicks?: number } = {}
  ) {
    if (!this.ctx) {
      this.init();
    }
    if (!this.ctx) return;

    this.stopPlayback();

    const now = this.ctx.currentTime;
    if (this.playbackBus) {
      this.playbackBus.gain.cancelScheduledValues(0);
      this.playbackBus.gain.setValueAtTime(1.0, now);
    }
    if (this.auxSendBus) {
      this.auxSendBus.gain.cancelScheduledValues(0);
      this.auxSendBus.gain.setValueAtTime(1.0, now);
    }
    if (this.currentEffectorSettings && this.delayFeedbackGain) {
      const feedback = this.currentEffectorSettings.delay.enabled
        ? Math.min(0.85, (this.currentEffectorSettings.delay.feedback / 100) * 0.8)
        : 0;
      this.delayFeedbackGain.gain.cancelScheduledValues(0);
      this.delayFeedbackGain.gain.setValueAtTime(feedback, now);
    }

    this.isPlaying = true;
    this.playheadTick = startTick;
    this.tempoBpm = bpm;
    this.activeTracks = tracks;
    this.songEnd = songEndTick(tracks);
    this.onPlayheadTickUpdate = onTickUpdate || null;
    this.onPlaybackEnded = onEnded || null;
    // A count-in starts the clock earlier: the metronome clicks while the playhead waits at startTick
    const countIn = Math.max(0, options.countInTicks ?? 0);
    this.anchor = { audioTime: this.ctx.currentTime + 0.05, tick: startTick - countIn, bpm };
    this.scheduledUntilTick = startTick - countIn;
    this.playStartTick = startTick;
    this.preWrapAnchor = null;

    this.workerTimer?.start(() => this.schedulerTick());
  }

  /**
   * One scheduler step: publishes the playhead and schedules every note that starts before the
   * lookahead horizon. Reads the current song each time, so edits made while playing are heard.
   */
  private schedulerTick() {
    if (!this.isPlaying || !this.ctx) return;

    const now = this.ctx.currentTime;
    // Right after a loop wrap is scheduled, the old timeline still applies until the wrap moment
    if (this.preWrapAnchor && now >= this.wrapAudioTime) this.preWrapAnchor = null;
    const shown = this.preWrapAnchor ?? this.anchor;
    const currentTick = Math.max(this.playStartTick, Math.round(tickAtTime(shown, now)));
    this.playheadTick = currentTick;
    this.onPlayheadTickUpdate?.(currentTick);

    const looping = this.loop !== null && currentTick < this.loop.end;
    if (!looping && currentTick >= Math.max(this.songEnd, 480 * 4) + 480) {
      this.stopPlayback();
      this.onPlaybackEnded?.();
      return;
    }

    let from = this.scheduledUntilTick;
    let horizon = Math.round(tickAtTime(this.anchor, now + LOOKAHEAD_SEC));
    for (let guard = 0; guard < 8; guard++) {
      const loop = this.loop && from < this.loop.end ? this.loop : null;
      const to = loop ? Math.min(horizon, loop.end) : horizon;
      if (to > from) this.scheduleRange(from, to, now, loop?.end ?? Infinity);
      if (!loop || horizon < loop.end) {
        this.scheduledUntilTick = Math.max(this.scheduledUntilTick, to);
        return;
      }
      // Wrap: continue the timeline at the loop start, exactly at the loop end's audio time
      this.preWrapAnchor = this.anchor;
      this.wrapAudioTime = timeAtTick(this.anchor, loop.end);
      this.anchor = { audioTime: this.wrapAudioTime, tick: loop.start, bpm: this.anchor.bpm };
      this.playStartTick = Math.min(this.playStartTick, loop.start);
      from = loop.start;
      this.scheduledUntilTick = loop.start;
      horizon = Math.round(tickAtTime(this.anchor, now + LOOKAHEAD_SEC));
    }
  }

  /** Schedules metronome clicks and notes starting in [from, to); notes are cut at `cutTick` (loop end). */
  private scheduleRange(from: number, to: number, now: number, cutTick: number) {
    const secondsPerTick = 60 / (this.anchor.bpm * 480);

    // Metronome: always during the count-in, then only when enabled
    for (let beat = Math.ceil(from / 480) * 480; beat < to; beat += 480) {
      if (beat >= this.playStartTick && !this.metronome.enabled) continue;
      const beatIndex = Math.round(beat / 480);
      const n = Math.max(1, this.metronome.beatsPerBar);
      this.click(timeAtTick(this.anchor, beat), ((beatIndex % n) + n) % n === 0);
    }

    const fromTick = Math.max(from, this.playStartTick);
    for (const track of audibleTracks(this.activeTracks)) {
      for (const note of notesInWindow(sortedByStart(track.notes), fromTick, to)) {
        const durationSec = (Math.min(note.startTick + note.durationTicks, cutTick) - note.startTick) * secondsPerTick;
        const isSustain = !!(note.sustain ?? track.sustainPedal ?? (track.instrumentId === 'grand-piano'));
        const stopVoice = this.synthesizeInstrument(
          track.instrumentId,
          note.pitch,
          note.velocity,
          Math.max(now, timeAtTick(this.anchor, note.startTick)),
          durationSec,
          track.volume,
          track.auxSend,
          track.pan,
          true,
          isSustain
        );

        let voices = this.activePlaybackVoices.get(track.id);
        if (!voices) {
          voices = new Set();
          this.activePlaybackVoices.set(track.id, voices);
        }
        voices.add(stopVoice);
        const voiceCleanupSec = durationSec + (isSustain ? 2.5 : 0.5) + LOOKAHEAD_SEC * 2;
        setTimeout(() => voices!.delete(stopVoice), voiceCleanupSec * 1000);
      }
    }
  }

  /** Loop region (ticks) or null. Takes effect immediately, also while playing. */
  public setLoop(loop: { start: number; end: number } | null) {
    this.loop = loop && loop.end > loop.start ? { ...loop } : null;
  }

  /**
   * Live song update while playing (note edits, mute/solo, added/removed tracks).
   * Voices of tracks that became silent are released immediately.
   */
  public updateSong(tracks: Track[]) {
    this.activeTracks = tracks;
    this.songEnd = songEndTick(tracks);
    if (!this.isPlaying || !this.ctx) return;

    const audible = new Set(audibleTracks(tracks).map((t) => t.id));
    const now = this.ctx.currentTime;
    for (const [trackId, voices] of this.activePlaybackVoices) {
      if (audible.has(trackId)) continue;
      voices.forEach((stop) => {
        try {
          stop(now);
        } catch {}
      });
      this.activePlaybackVoices.delete(trackId);
    }
  }

  /** Short metronome tick (accented on the first beat of the bar); never part of exports. */
  private click(time: number, accent: boolean) {
    if (!this.ctx || !this.masterGain || time < this.ctx.currentTime - 0.01) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 1760 : 1175, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  public setMetronome(enabled: boolean, beatsPerBar: number) {
    this.metronome = { enabled, beatsPerBar };
  }

  /** Exact playback position right now (more precise than the last published playhead). */
  public currentTick(): number {
    if (!this.isPlaying || !this.ctx) return this.playheadTick;
    return tickAtTime(this.anchor, this.ctx.currentTime);
  }

  /** Note held from a MIDI keyboard: sounds until releaseHeldNote (no fixed length). */
  public startHeldNote(
    instrumentId: InstrumentId,
    pitch: number,
    velocity: number,
    trackVolume: number,
    auxSend: boolean,
    pan: number,
    sustain: boolean
  ): string {
    return this.playNote(instrumentId, pitch, velocity, 30, trackVolume, auxSend, pan, sustain);
  }

  public releaseHeldNote(noteVoiceId: string) {
    this.stopNote(noteVoiceId);
  }

  /** Live tempo change: playback continues from the current position at the new tempo. */
  public setTempo(bpm: number) {
    if (!(bpm > 0) || bpm === this.tempoBpm) return;
    this.tempoBpm = bpm;
    if (this.isPlaying && this.ctx) {
      if (this.preWrapAnchor) {
        // A loop wrap is pending: the new tempo applies now on the old timeline and from the wrap point on
        this.preWrapAnchor = reanchor(this.preWrapAnchor, this.ctx.currentTime, bpm);
        this.anchor = { ...this.anchor, bpm };
      } else {
        this.anchor = reanchor(this.anchor, this.ctx.currentTime, bpm);
      }
    }
  }

  public stopPlayback() {
    this.isPlaying = false;
    this.workerTimer?.stop();

    if (this.ctx) {
      const now = this.ctx.currentTime;
      // Immediately mute playback bus and KEEP it muted until next play
      if (this.playbackBus) {
        this.playbackBus.gain.cancelScheduledValues(0);
        this.playbackBus.gain.setValueAtTime(0.0, now);
      }

      // Cut send bus and delay feedback loop to stop runaway echoes/buzz
      if (this.auxSendBus) {
        this.auxSendBus.gain.cancelScheduledValues(0);
        this.auxSendBus.gain.setValueAtTime(0.0, now);
      }
      if (this.delayFeedbackGain) {
        this.delayFeedbackGain.gain.cancelScheduledValues(0);
        this.delayFeedbackGain.gain.setValueAtTime(0.0, now);
      }

      // Stop all active playback voices and disconnect them immediately
      this.activePlaybackVoices.forEach((voices) =>
        voices.forEach((stopFn) => {
          try { stopFn(now); } catch {}
        })
      );
      this.activePlaybackVoices.clear();
      this.stopAllNotes();
    }
  }

  public pausePlayback() {
    this.stopPlayback();
  }

  /**
   * Renders the song offline through exactly the same instruments, mix and effects as live playback
   * (used by the WAV export, so the file sounds like what was heard in the editor).
   */
  public static async renderOffline(
    tracks: Track[],
    bpm: number,
    effector: EffectorSettings,
    sampleRate = 48000
  ): Promise<AudioBuffer> {
    const audible = audibleTracks(tracks);
    await sampleLibrary.loadAll(audible.map((t) => t.instrumentId));

    const secondsPerTick = 60 / (bpm * 480);
    const lead = 0.05;
    const seconds = Math.max(2, lead + songEndTick(audible) * secondsPerTick + 3.5); // reverb/release tail
    const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
    const engine = new AudioEngine({ context: ctx });
    engine.currentEffectorSettings = effector;
    await engine.init();

    for (const track of audible) {
      for (const note of track.notes) {
        const isSustain = !!(note.sustain ?? track.sustainPedal ?? (track.instrumentId === 'grand-piano'));
        engine.synthesizeInstrument(
          track.instrumentId,
          note.pitch,
          note.velocity,
          lead + note.startTick * secondsPerTick,
          note.durationTicks * secondsPerTick,
          track.volume,
          track.auxSend,
          track.pan,
          true,
          isSustain
        );
      }
    }
    return ctx.startRendering();
  }

  public getPlaybackState(): { isPlaying: boolean; playheadTick: number } {
    return {
      isPlaying: this.isPlaying,
      playheadTick: this.playheadTick,
    };
  }
}
