import * as Tone from 'tone';
import { type EffectorSettings } from '@/types';

export const chorus = new Tone.Chorus({ frequency: 2, delayTime: 2.5, depth: 0.5 }).start();
export const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.2 });
export const reverb = new Tone.Reverb({ decay: 1.5 });
export const masterVolume = new Tone.Volume(0);
export const masterMeter = new Tone.Meter();

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
