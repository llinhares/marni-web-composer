export type InstrumentCategory = 'Percussão' | 'Teclas' | 'Cordas' | 'Sopros';

export type InstrumentType = 
  | 'Tamborim' 
  | 'Kit de Bateria' 
  | 'Grand Piano' 
  | 'Violão Acústico' 
  | 'Contrabaixo' 
  | 'Harpa' 
  | 'Violino' 
  | 'Flauta Transversal' 
  | 'Clarinete' 
  | 'Trompa';

export type ToolType = 'draw' | 'select';
export type NoteStyleType = 'Sustenido' | 'Pedal de Sustentação';

export interface Note {
  id: string;
  pitch: string;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

export interface Track {
  id: string;
  name: string;
  instrument: InstrumentType;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
  notes: Note[];
}

export interface SongContext {
  title: string;
  bpm: number;
  timeSignature: [number, number];
}

export interface EffectorSettings {
  reverbTime: number;
  delayFeedback: number;
  chorusFeedback: number;
  chorusDepth: number;
  chorusFreq: number;
}

export interface ComposerState {
  song: SongContext;
  tracks: Track[];
  activeTrackId: string | null;
  isPlaying: boolean;
  snapResolution: number;
  effectorSettings: EffectorSettings;
  currentTool: ToolType;
  noteStyle: NoteStyleType;
  selectedNoteIds: string[];
  zoomX: number;
  zoomY: number;
  seekTick: number;
  
  setTitle: (title: string) => void;
  setBpm: (bpm: number) => void;
  addTrack: (track: Track) => void;
  setActiveTrack: (trackId: string) => void;
  addNoteToTrack: (trackId: string, note: Note) => void;  
  removeNoteFromTrack: (trackId: string, noteId: string) => void;
  updateNoteInTrack: (trackId: string, noteId: string, updates: Partial<Note>) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  updateTrackVolume: (trackId: string, volume: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setSnapResolution: (res: number) => void;
  setTimeSignature: (ts: [number, number]) => void;
  clearTrackNotes: (trackId: string) => void;
  duplicateTrack: (trackId: string) => void;
  removeTrack: (trackId: string) => void;
  setEffectorSettings: (settings: EffectorSettings) => void;
  setCurrentTool: (tool: ToolType) => void;
  setNoteStyle: (style: NoteStyleType) => void;
  setSelectedNotes: (ids: string[]) => void;
  deleteSelectedNotes: () => void;
  setMidiData: (tracks: Track[], bpm: number) => void;
  setZoomX: (zoom: number) => void;
  setZoomY: (zoom: number) => void;
  setSeekTick: (tick: number) => void;
}