import * as Tone from 'tone';
import { useComposerStore } from '@/store/useComposerStore';
import { triggerLiveNoteOn, triggerLiveNoteOff } from '@/core/audio/ToneEngine';
import { type Note } from '@/types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiNumberToPitch = (midiNumber: number): string => {
  const octave = Math.floor(midiNumber / 12) - 1;
  const note = NOTE_NAMES[midiNumber % 12];
  return `${note}${octave}`;
};

interface MIDIMessageEventLike {
  data: Uint8Array;
}

interface MIDIInputLike {
  onmidimessage: ((event: MIDIMessageEventLike) => void) | null;
}

interface MIDIAccessLike {
  inputs: Map<string, MIDIInputLike>;
  onstatechange: (() => void) | null;
}

class WebMidiManager {
  private midiAccess: MIDIAccessLike | null = null;
  private pendingNotes: Map<number, { pitch: string, startTick: number, velocity: number }> = new Map();
  private sustainedNotes: Map<number, { pitch: string, startTick: number, velocity: number }> = new Map();
  private isSustainPedalDown: boolean = false;
  public isSupported: boolean = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  public async init(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('Web MIDI API is not supported in this browser.');
      return false;
    }

    try {
      const access = await (navigator as any).requestMIDIAccess();
      this.midiAccess = access;
      this.bindInputs();
      
      access.onstatechange = () => {
        this.bindInputs();
        this.updateConnectionStatus();
      };

      this.updateConnectionStatus();
      return true;
    } catch (err) {
      console.warn('Failed to get MIDI access:', err);
      useComposerStore.getState().setMidiConnected(false);
      return false;
    }
  }

  private bindInputs() {
    if (!this.midiAccess) return;

    for (const input of this.midiAccess.inputs.values()) {
      input.onmidimessage = (event: MIDIMessageEventLike) => {
        this.handleMidiMessage(event);
      };
    }
  }

  private updateConnectionStatus() {
    if (!this.midiAccess) {
      useComposerStore.getState().setMidiConnected(false);
      return;
    }
    const hasInputs = this.midiAccess.inputs.size > 0;
    useComposerStore.getState().setMidiConnected(hasInputs);
  }

  private handleMidiMessage(event: MIDIMessageEventLike) {
    if (!event.data || event.data.length < 3) return;

    const [statusByte, noteNumber, velocity] = event.data;
    const command = statusByte >> 4;

    const state = useComposerStore.getState();
    const activeTrack = state.tracks.find(t => t.id === state.activeTrackId);
    if (!activeTrack) return;

    // Control Change (command 11) - CC64 Sustain Pedal
    if (command === 11 && noteNumber === 64) {
      const isDown = velocity >= 64;
      this.isSustainPedalDown = isDown;

      if (!isDown) {
        // Release all sustained notes
        const currentTick = Math.max(0, Tone.Transport.ticks);
        this.sustainedNotes.forEach((pending) => {
          triggerLiveNoteOff(pending.pitch, activeTrack);
          if (state.isPlaying && state.isRecording) {
            const durationTicks = Math.max(120, currentTick - pending.startTick);
            const newNote: Note = {
              id: `note-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              pitch: pending.pitch,
              startTick: pending.startTick,
              durationTicks,
              velocity: pending.velocity
            };
            state.addNoteToTrack(activeTrack.id, newNote);
          }
        });
        this.sustainedNotes.clear();
      }
      return;
    }

    const pitch = midiNumberToPitch(noteNumber);

    // Note On (command 9) with velocity > 0
    if (command === 9 && velocity > 0) {
      // If note was sustained, end it cleanly before retriggering
      if (this.sustainedNotes.has(noteNumber)) {
        const oldPending = this.sustainedNotes.get(noteNumber)!;
        triggerLiveNoteOff(oldPending.pitch, activeTrack);
        if (state.isPlaying && state.isRecording) {
          const currentTick = Math.max(0, Tone.Transport.ticks);
          const durationTicks = Math.max(120, currentTick - oldPending.startTick);
          state.addNoteToTrack(activeTrack.id, {
            id: `note-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            pitch: oldPending.pitch,
            startTick: oldPending.startTick,
            durationTicks,
            velocity: oldPending.velocity
          });
        }
        this.sustainedNotes.delete(noteNumber);
      }

      triggerLiveNoteOn(pitch, velocity, activeTrack);

      if (state.isPlaying && state.isRecording) {
        const currentTick = Math.max(0, Tone.Transport.ticks);
        this.pendingNotes.set(noteNumber, {
          pitch,
          startTick: currentTick,
          velocity
        });
      }
    } 
    // Note Off (command 8 or command 9 with velocity 0)
    else if (command === 8 || (command === 9 && velocity === 0)) {
      if (this.isSustainPedalDown) {
        // Defer release until sustain pedal goes up
        const pending = this.pendingNotes.get(noteNumber);
        if (pending) {
          this.sustainedNotes.set(noteNumber, pending);
          this.pendingNotes.delete(noteNumber);
        }
      } else {
        triggerLiveNoteOff(pitch, activeTrack);

        if (state.isPlaying && state.isRecording) {
          const pending = this.pendingNotes.get(noteNumber);
          if (pending) {
            const currentTick = Math.max(0, Tone.Transport.ticks);
            const durationTicks = Math.max(120, currentTick - pending.startTick);
            
            const newNote: Note = {
              id: `note-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              pitch: pending.pitch,
              startTick: pending.startTick,
              durationTicks,
              velocity: pending.velocity
            };

            state.addNoteToTrack(activeTrack.id, newNote);
            this.pendingNotes.delete(noteNumber);
          }
        }
      }
    }
  }
}

export const webMidi = new WebMidiManager();
