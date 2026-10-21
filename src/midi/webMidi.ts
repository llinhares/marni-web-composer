/**
 * Web MIDI API Manager for External MIDI Keyboards and Controllers
 */

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type MidiNoteCallback = (note: {
  type: 'noteon' | 'noteoff';
  pitch: number;
  velocity: number;
  channel: number;
}) => void;

export class WebMidiManager {
  private midiAccess: MIDIAccess | null = null;
  private isSupported: boolean = false;
  private noteCallbacks: Set<MidiNoteCallback> = new Set();
  private devices: MidiDevice[] = [];
  private onDevicesChanged: ((devices: MidiDevice[]) => void) | null = null;

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  public getSupported(): boolean {
    return this.isSupported;
  }

  public async requestAccess(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.refreshDevices();

      // Listen for hotplugging
      this.midiAccess.onstatechange = () => {
        this.refreshDevices();
      };

      // Bind input handlers
      this.bindInputs();
      return true;
    } catch {
      return false;
    }
  }

  private refreshDevices() {
    if (!this.midiAccess) return;
    const devList: MidiDevice[] = [];
    this.midiAccess.inputs.forEach((input) => {
      devList.push({
        id: input.id,
        name: input.name || 'MIDI Keyboard',
        manufacturer: input.manufacturer || 'Generic',
        state: input.state,
      });
    });
    this.devices = devList;
    if (this.onDevicesChanged) {
      this.onDevicesChanged(this.devices);
    }
  }

  private bindInputs() {
    if (!this.midiAccess) return;
    this.midiAccess.inputs.forEach((input) => {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (!event.data) return;
        const [status, noteNumber, velocity] = event.data;
        const command = status >> 4;
        const channel = status & 0xf;

        if (command === 9 && velocity > 0) {
          // Note On
          this.noteCallbacks.forEach((cb) =>
            cb({
              type: 'noteon',
              pitch: noteNumber,
              velocity,
              channel,
            })
          );
        } else if (command === 8 || (command === 9 && velocity === 0)) {
          // Note Off
          this.noteCallbacks.forEach((cb) =>
            cb({
              type: 'noteoff',
              pitch: noteNumber,
              velocity: 0,
              channel,
            })
          );
        }
      };
    });
  }

  public onNote(callback: MidiNoteCallback) {
    this.noteCallbacks.add(callback);
    return () => this.noteCallbacks.delete(callback);
  }

  public setDevicesChangedListener(listener: (devices: MidiDevice[]) => void) {
    this.onDevicesChanged = listener;
    listener(this.devices);
  }

  public getDevices(): MidiDevice[] {
    return this.devices;
  }
}
