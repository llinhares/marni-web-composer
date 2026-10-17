/**
 * Marni Audio Engine
 * High-performance Web Audio API synthesis for all Black Desert Online instruments,
 * Master Effector rack (Reverb, Stereo Delay, Chorus), and multi-track routing.
 * Built with zero-residual-hum protection and automatic oscillator termination.
 */

import type { InstrumentId, EffectorSettings, Track, Note } from '../types/music.ts';
import { pitchToFrequency, ticksToSeconds } from '../utils/musicMath.ts';
import { WorkerTimer } from './workerTimer.ts';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

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
  private activePlaybackVoices = new Set<(time: number) => void>();

  // Worker-driven lookahead playback scheduler
  private workerTimer: WorkerTimer | null = null;
  private isPlaying = false;
  private playheadTick = 0;
  private tempoBpm = 120;
  private activeTracks: Track[] = [];
  private onPlayheadTickUpdate: ((tick: number) => void) | null = null;
  private onPlaybackEnded: (() => void) | null = null;
  private currentEffectorSettings: EffectorSettings | null = null;

  constructor() {
    this.workerTimer = new WorkerTimer(20);
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass({
      latencyHint: 'interactive',
    });

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
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

    // Reverb
    if (this.reverbGain) {
      const revVol = fx.reverb.enabled ? (fx.reverb.mix / 100) * 0.7 : 0;
      this.reverbGain.gain.setTargetAtTime(revVol, now, 0.05);
    }

    // Delay
    if (this.delayGain && this.delayFeedbackGain && this.delayNode) {
      const delVol = fx.delay.enabled ? (fx.delay.mix / 100) * 0.6 : 0;
      const feedback = fx.delay.enabled ? Math.min(0.85, (fx.delay.feedback / 100) * 0.8) : 0;
      const delayTime = Math.max(0.05, Math.min(1.5, (fx.delay.time / 100) * 0.8 + 0.05));

      this.delayGain.gain.setTargetAtTime(delVol, now, 0.05);
      this.delayFeedbackGain.gain.setTargetAtTime(feedback, now, 0.05);
      this.delayNode.delayTime.setTargetAtTime(delayTime, now, 0.05);
    }

    // Chorus
    if (this.chorusGain && this.chorusLfo && this.chorusLfoGain) {
      const choVol = fx.chorus.enabled ? (fx.chorus.mix / 100) * 0.5 : 0;
      const rate = Math.max(0.1, (fx.chorus.lfoFrequency / 100) * 5.0 + 0.2);
      const depth = (fx.chorus.lfoDepth / 100) * 0.005 + 0.0005;

      this.chorusGain.gain.setTargetAtTime(choVol, now, 0.05);
      this.chorusLfo.frequency.setTargetAtTime(rate, now, 0.05);
      this.chorusLfoGain.gain.setTargetAtTime(depth, now, 0.05);
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
    trackPan = 0
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
      false // direct audition
    );

    this.activeAuditionVoices.set(noteVoiceId, { stop: stopFn });

    setTimeout(() => {
      this.activeAuditionVoices.delete(noteVoiceId);
    }, (durationSeconds + 0.8) * 1000);

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

  private synthesizeInstrument(
    instrumentId: InstrumentId,
    pitch: number,
    velocity: number,
    startTime: number,
    duration: number,
    trackVolume: number,
    auxSend: boolean,
    pan: number,
    isPlayback = true
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

    // Cleanup voiceGain from audio graph
    setTimeout(() => {
      try {
        voiceGain.disconnect();
        if (panner) panner.disconnect();
      } catch {}
    }, (duration + 1.2) * 1000);

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

        const targetVol = velFactor * volFactor;
        voiceGain.gain.setValueAtTime(0.0001, startTime);
        voiceGain.gain.linearRampToValueAtTime(targetVol, startTime + 0.005);
        voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetVol * 0.6), startTime + 0.2);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, noteEndTime + 0.25);
        voiceGain.gain.setValueAtTime(0.0, noteEndTime + 0.26);

        osc1.start(startTime);
        osc2.start(startTime);
        osc3.start(startTime);

        // ALWAYS schedule hard stop to kill oscillators!
        const autoStopT = noteEndTime + 0.3;
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
    onEnded?: () => void
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
    this.onPlayheadTickUpdate = onTickUpdate || null;
    this.onPlaybackEnded = onEnded || null;

    const LOOKAHEAD_SEC = 0.15;
    let currentScheduledTick = startTick;
    const baseAudioTime = this.ctx.currentTime + 0.05;
    const baseTick = startTick;

    let maxSongTick = 0;
    tracks.forEach((tr) => {
      tr.notes.forEach((n) => {
        const end = n.startTick + n.durationTicks;
        if (end > maxSongTick) maxSongTick = end;
      });
    });
    maxSongTick = Math.max(maxSongTick, 480 * 4);

    this.workerTimer?.start(() => {
      if (!this.isPlaying || !this.ctx) return;

      const currentAudioTime = this.ctx.currentTime;
      const elapsedAudio = currentAudioTime - baseAudioTime;
      const currentTick = Math.max(0, Math.round(baseTick + (elapsedAudio * this.tempoBpm * 480) / 60));

      this.playheadTick = currentTick;
      if (this.onPlayheadTickUpdate) {
        this.onPlayheadTickUpdate(currentTick);
      }

      if (currentTick >= maxSongTick + 480) {
        this.stopPlayback();
        if (this.onPlaybackEnded) {
          this.onPlaybackEnded();
        }
        return;
      }

      const scheduleHorizonAudio = currentAudioTime + LOOKAHEAD_SEC;
      const horizonTick = Math.round(baseTick + ((scheduleHorizonAudio - baseAudioTime) * this.tempoBpm * 480) / 60);
      const hasSolo = this.activeTracks.some((t) => t.isSolo);

      this.activeTracks.forEach((track) => {
        if (track.isMuted) return;
        if (hasSolo && !track.isSolo) return;

        track.notes.forEach((note) => {
          if (note.startTick >= currentScheduledTick && note.startTick < horizonTick) {
            const noteOffsetTicks = note.startTick - baseTick;
            const noteStartAudio = baseAudioTime + ticksToSeconds(noteOffsetTicks, this.tempoBpm);
            const durationSec = ticksToSeconds(note.durationTicks, this.tempoBpm);

            const stopVoice = this.synthesizeInstrument(
              track.instrumentId,
              note.pitch,
              note.velocity,
              Math.max(currentAudioTime, noteStartAudio),
              durationSec,
              track.volume,
              track.auxSend,
              track.pan,
              true
            );

            this.activePlaybackVoices.add(stopVoice);
            setTimeout(() => {
              this.activePlaybackVoices.delete(stopVoice);
            }, (durationSec + 0.5) * 1000);
          }
        });
      });

      currentScheduledTick = horizonTick;
    });
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
      this.activePlaybackVoices.forEach((stopFn) => {
        try { stopFn(now); } catch {}
      });
      this.activePlaybackVoices.clear();
      this.stopAllNotes();
    }
  }

  public pausePlayback() {
    this.stopPlayback();
  }

  public getPlaybackState(): { isPlaying: boolean; playheadTick: number } {
    return {
      isPlaying: this.isPlaying,
      playheadTick: this.playheadTick,
    };
  }
}
