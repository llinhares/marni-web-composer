import { type InstrumentType } from '@/types';

export const generateScale = (top: string, bottom: string): string[] => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const topOct = parseInt(top.replace(/\D/g, ''));
  const botOct = parseInt(bottom.replace(/\D/g, ''));

  const result: string[] = [];
  let started = false;

  for (let oct = topOct; oct >= botOct; oct--) {
    for (let i = notes.length - 1; i >= 0; i--) {
      const current = `${notes[i]}${oct}`;
      if (!started && current === top) started = true;
      if (started) {
        result.push(current);
        if (current === bottom) return result;
      }
    }
  }
  return result;
};

export const DRUM_KIT_NOTES = [
  'SnrRollL', 'SnrRollS', 'CymRide', 'CymCrsh', 'Tom5', 'Tom4',
  'HihatO', 'Tom3', 'HatPdl', 'Tom2', 'HihatC', 'Tom1',
  'SnrFlam', 'RimShot', 'SnrHit', 'SnrSide', 'Kck'
];

export const INSTRUMENT_DICT: Record<InstrumentType, string[]> = {
  'Tamborim': generateScale('E6', 'A2'),
  'Kit de Bateria': DRUM_KIT_NOTES,
  'Grand Piano': generateScale('C8', 'C1'),
  'Violão Acústico': generateScale('E6', 'C2'),
  'Contrabaixo': generateScale('E4', 'E1'),
  'Harpa': generateScale('F6', 'C2'),
  'Violino': generateScale('E6', 'G2'),
  'Flauta Transversal': generateScale('E6', 'C3'),
  'Clarinete': generateScale('B6', 'C1'),
  'Trompa': generateScale('B6', 'C1'),
};

export const PIANO_ROLL = {
  NOTE_HEIGHT: 24,         
  BEAT_WIDTH: 80,          
  KEYBOARD_WIDTH: 75,
  TICKS_PER_BEAT: 480,     
  TIMELINE_HEIGHT: 30,
};