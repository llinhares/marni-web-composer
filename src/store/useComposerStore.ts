import { create } from 'zustand';
import { temporal } from 'zundo';
import { useStore } from 'zustand';
import { type ComposerState, type Track } from '@/types';
import { updateTrackAudio, disposeTrackAudio, updateMasterVolume } from '@/core/audio/ToneEngine';

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useComposerStore = create<ComposerState>()(
  temporal(
    (set) => ({
      song: {
        title: '',
        bpm: 120,
        timeSignature: [4, 4],
      },
      tracks: [
        {
          id: 'track-default-1',
          name: 'Grand Piano',
          instrument: 'Grand Piano',
          volume: 70,
          pan: 0,
          isMuted: false,
          isSolo: false,
          notes: [],
        }
      ],
      activeTrackId: 'track-default-1',
      isPlaying: false,
      snapResolution: 4,
      effectorSettings: { reverbTime: 0, delayFeedback: 0, chorusFeedback: 0, chorusDepth: 0, chorusFreq: 0 },
      currentTool: 'draw',
      noteStyle: 'Sustenido',
      selectedNoteIds: [],
      zoomX: 1,
      zoomY: 1,
      seekTick: 0,
      masterVolume: 80,
      ghostNotesEnabled: true,
      isRecording: false,
      midiConnected: false,
      showMixer: false,

      setTitle: (title) => set((state) => ({ song: { ...state.song, title } })),
      setBpm: (bpm) => set((state) => ({ song: { ...state.song, bpm } })),
      addTrack: (track) => set((state) => ({ tracks: [...state.tracks, { ...track, pan: track.pan ?? 0 }] })),
      setActiveTrack: (trackId) => set({ activeTrackId: trackId, selectedNoteIds: [] }),
      addNoteToTrack: (trackId, note) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === trackId ? { ...track, notes: [...track.notes, note] } : track)
      })),
      removeNoteFromTrack: (trackId, noteId) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === trackId ? { ...track, notes: track.notes.filter((n) => n.id !== noteId) } : track)
      })),
      updateNoteInTrack: (trackId, noteId, updates) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === trackId ? {
          ...track, notes: track.notes.map((n) => n.id === noteId ? { ...n, ...updates } : n),
        } : track)
      })),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      updateTrackVolume: (trackId, volume) => set((state) => {
        const tracks = state.tracks.map((t) => t.id === trackId ? { ...t, volume } : t);
        const track = tracks.find(t => t.id === trackId);
        if (track) updateTrackAudio(trackId, volume, track.isMuted, track.isSolo, tracks.some(s => s.isSolo), track.pan || 0);
        return { tracks };
      }),
      setTrackPan: (trackId, pan) => set((state) => {
        const tracks = state.tracks.map((t) => t.id === trackId ? { ...t, pan } : t);
        const track = tracks.find(t => t.id === trackId);
        if (track) updateTrackAudio(trackId, track.volume, track.isMuted, track.isSolo, tracks.some(s => s.isSolo), pan);
        return { tracks };
      }),
      setMasterVolume: (volume) => {
        updateMasterVolume(volume);
        set({ masterVolume: volume });
      },
      toggleTrackMute: (trackId) => set((state) => {
        const tracks = state.tracks.map((t) => t.id === trackId ? { ...t, isMuted: !t.isMuted } : t);
        const track = tracks.find(t => t.id === trackId);
        if (track) updateTrackAudio(trackId, track.volume, track.isMuted, track.isSolo, tracks.some(s => s.isSolo), track.pan || 0);
        return { tracks };
      }),
      toggleTrackSolo: (trackId) => set((state) => {
        const tracks = state.tracks.map((t) => t.id === trackId ? { ...t, isSolo: !t.isSolo } : t);
        const hasSolo = tracks.some(s => s.isSolo);
        tracks.forEach(t => updateTrackAudio(t.id, t.volume, t.isMuted, t.isSolo, hasSolo, t.pan || 0));
        return { tracks };
      }),
      setSnapResolution: (res) => set({ snapResolution: res }),
      setTimeSignature: (ts) => set((state) => ({ song: { ...state.song, timeSignature: ts } })),
      clearTrackNotes: (trackId) => set((state) => ({
        tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, notes: [] } : t)),
        selectedNoteIds: []
      })),
      duplicateTrack: (trackId) => set((state) => {
        const trackToCopy = state.tracks.find((t) => t.id === trackId);
        if (!trackToCopy) return state;
        const newTrack: Track = {
          ...trackToCopy, id: `track-${generateId()}`, name: `${trackToCopy.name} (Cópia)`,
          notes: trackToCopy.notes.map(n => ({ ...n, id: `note-${generateId()}` }))
        };
        return { tracks: [...state.tracks, newTrack], activeTrackId: newTrack.id, selectedNoteIds: [] };
      }),
      removeTrack: (trackId) => {
        disposeTrackAudio(trackId);
        set((state) => {
          const newTracks = state.tracks.filter((t) => t.id !== trackId);
          return {
            tracks: newTracks,
            activeTrackId: state.activeTrackId === trackId ? (newTracks[0]?.id || null) : state.activeTrackId,
            selectedNoteIds: []
          };
        });
      },
      setEffectorSettings: (settings) => set({ effectorSettings: settings }),
      setCurrentTool: (tool) => set({ currentTool: tool }),
      setNoteStyle: (style) => set({ noteStyle: style }),
      setSelectedNotes: (ids) => set({ selectedNoteIds: ids }),
      deleteSelectedNotes: () => set((state) => {
        if (!state.activeTrackId || state.selectedNoteIds.length === 0) return state;
        return {
          tracks: state.tracks.map((track) => track.id === state.activeTrackId ? {
            ...track, notes: track.notes.filter((n) => !state.selectedNoteIds.includes(n.id))
          } : track),
          selectedNoteIds: []
        };
      }),
      setMidiData: (newTracks, bpm) => set((state) => ({
        tracks: newTracks.map(t => ({ ...t, pan: t.pan ?? 0 })),
        song: { ...state.song, bpm },
        activeTrackId: newTracks[0]?.id || null,
        selectedNoteIds: [],
        seekTick: 0
      })),
      setZoomX: (zoom) => set({ zoomX: Math.max(0.3, Math.min(3, zoom)) }),
      setZoomY: (zoom) => set({ zoomY: Math.max(0.6, Math.min(2, zoom)) }),
      setSeekTick: (seekTick) => set({ seekTick: Math.max(0, seekTick) }),
      toggleGhostNotes: () => set((state) => ({ ghostNotesEnabled: !state.ghostNotesEnabled })),
      setIsRecording: (isRecording) => set({ isRecording }),
      setMidiConnected: (connected) => set({ midiConnected: connected }),
      setShowMixer: (show) => set({ showMixer: show }),
    }),
    {
      partialize: (state) => ({ tracks: state.tracks }),
      limit: 50,
    }
  )
);

export const useComposerHistoryState = () => {
  const canUndo = useStore(useComposerStore.temporal, (state) => state.pastStates.length > 0);
  const canRedo = useStore(useComposerStore.temporal, (state) => state.futureStates.length > 0);
  const { undo, redo, clear } = useComposerStore.temporal.getState();
  return { canUndo, canRedo, undo, redo, clearHistory: clear };
};