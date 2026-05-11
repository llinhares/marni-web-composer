import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text, Rect, Group } from 'react-konva';
import { type KonvaEventObject } from 'konva/lib/Node';
import { PIANO_ROLL, INSTRUMENT_DICT } from '@/utils/constants';
import { useComposerStore } from '@/store/useComposerStore';
import type { InstrumentType, Note } from '@/types';
import { NoteBlock } from './NoteBlock';
import { playFeedbackNote } from '@/core/audio/ToneEngine';
import * as Tone from 'tone';

const generateNoteId = () => `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export function PianoRoll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPointerPosRef = useRef<{ x: number, y: number } | null>(null);

  const { 
    tracks, activeTrackId, addNoteToTrack, removeNoteFromTrack, updateNoteInTrack, isPlaying, song, snapResolution,
    currentTool, selectedNoteIds, setSelectedNotes, deleteSelectedNotes
  } = useComposerStore();
  
  const activeTrack = tracks.find(track => track.id === activeTrackId);
  const instrumentKey = (activeTrack?.instrument || 'Grand Piano') as InstrumentType;
  const gridNotes = INSTRUMENT_DICT[instrumentKey] || INSTRUMENT_DICT['Grand Piano'];

  const [editingNote, setEditingNote] = useState<{ note: Note, x: number, y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT') return;
        deleteSelectedNotes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedNotes]);

  useEffect(() => {
    setScroll({ x: 0, y: 0 });
  }, [activeTrack?.instrument]);

  const colors = { gridMeasure: '#352F2A', gridBeat: '#221E1B', bgKeyboardBlack: '#1C1917', bgKeyboardWhite: '#26221E', textMuted: '#686055', textPrimary: '#938A7E', timelineBg: '#1C1917' };

  const totalHeight = gridNotes.length * PIANO_ROLL.NOTE_HEIGHT;
  const beatsPerMeasure = song.timeSignature[0];
  const noteValue = song.timeSignature[1];
  const beatWidth = (PIANO_ROLL.BEAT_WIDTH * 4) / noteValue;
  const snapWidth = (PIANO_ROLL.BEAT_WIDTH * 4) / snapResolution;
  const snapTicks = (PIANO_ROLL.TICKS_PER_BEAT * 4) / snapResolution;
  const totalMeasures = 100;
  const totalWidth = PIANO_ROLL.KEYBOARD_WIDTH + (totalMeasures * beatsPerMeasure * beatWidth);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    setScroll((prev) => {
      const maxX = Math.max(0, totalWidth - dimensions.width);
      const maxY = Math.max(0, totalHeight + PIANO_ROLL.TIMELINE_HEIGHT - dimensions.height);
      return {
        x: Math.max(0, Math.min(prev.x + e.evt.deltaX, maxX)),
        y: Math.max(0, Math.min(prev.y + e.evt.deltaY, maxY)),
      };
    });
  };

  const handleDown = (e: KonvaEventObject<any>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const isNote = e.target.hasName('resize-handle') || !!e.target.findAncestor('.note-group', true);
    if (isNote) return;

    const pos = stage.getPointerPosition();
    const evt = e.evt as any;
    const isTouch = evt.pointerType === 'touch' || e.type.startsWith('touch');

    if (evt.button === 1 || (isTouch && currentTool === 'select')) {
      isPanningRef.current = true;
      if (pos) lastPointerPosRef.current = { x: pos.x, y: pos.y };
      stage.container().style.cursor = 'grabbing';
      return;
    }

    if (!isTouch && evt.button === 0 && currentTool === 'select') {
      if (pos && pos.x > PIANO_ROLL.KEYBOARD_WIDTH && pos.y > PIANO_ROLL.TIMELINE_HEIGHT) {
        const absX = pos.x + scroll.x;
        const absY = pos.y + scroll.y;
        setSelectionBox({ x1: absX, y1: absY, x2: absX, y2: absY });
        setSelectedNotes([]); 
      }
    }
  };

  const handleMove = (e: KonvaEventObject<any>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (isPanningRef.current && lastPointerPosRef.current) {
      const dx = pos.x - lastPointerPosRef.current.x;
      const dy = pos.y - lastPointerPosRef.current.y;

      setScroll((prev) => {
        const maxX = Math.max(0, totalWidth - dimensions.width);
        const maxY = Math.max(0, totalHeight + PIANO_ROLL.TIMELINE_HEIGHT - dimensions.height);
        return {
          x: Math.max(0, Math.min(prev.x - dx, maxX)),
          y: Math.max(0, Math.min(prev.y - dy, maxY)),
        };
      });
      
      lastPointerPosRef.current = { x: pos.x, y: pos.y };
      return;
    }

    if (selectionBox && currentTool === 'select') {
      setSelectionBox({ ...selectionBox, x2: pos.x + scroll.x, y2: pos.y + scroll.y });
    }
  };

  const handleUp = (e: KonvaEventObject<any>) => {
    const stage = e.target.getStage();
    if (stage) {
      isPanningRef.current = false;
      lastPointerPosRef.current = null;
      stage.container().style.cursor = 'default';
    }

    if (selectionBox && currentTool === 'select' && activeTrack) {
      const rx = Math.min(selectionBox.x1, selectionBox.x2);
      const ry = Math.min(selectionBox.y1, selectionBox.y2);
      const rw = Math.abs(selectionBox.x2 - selectionBox.x1);
      const rh = Math.abs(selectionBox.y2 - selectionBox.y1);

      if (rw > 5 || rh > 5) {
        const newSelected = activeTrack.notes.filter(note => {
          const nx = PIANO_ROLL.KEYBOARD_WIDTH + (note.startTick / PIANO_ROLL.TICKS_PER_BEAT) * PIANO_ROLL.BEAT_WIDTH;
          const ny = gridNotes.indexOf(note.pitch) * PIANO_ROLL.NOTE_HEIGHT + PIANO_ROLL.TIMELINE_HEIGHT;
          const nw = (note.durationTicks / PIANO_ROLL.TICKS_PER_BEAT) * PIANO_ROLL.BEAT_WIDTH;
          const nh = PIANO_ROLL.NOTE_HEIGHT;
          return (rx < nx + nw && rx + rw > nx && ry < ny + nh && ry + rh > ny);
        }).map(n => n.id);
        
        setSelectedNotes(newSelected);
      }
      setSelectionBox(null);
    }
  };

  const handleGridClick = (e: KonvaEventObject<Event>) => {
    if (!activeTrackId || !activeTrack || currentTool !== 'draw') return;
    
    const evt = e.evt as any;
    const isTouch = evt.pointerType === 'touch' || e.type === 'tap' || e.type === 'touchend';
    
    if (!isTouch && evt.button !== 0) return;

    const stage = e.target.getStage();
    const pointerPos = stage?.getPointerPosition();
    if (!pointerPos || pointerPos.x <= PIANO_ROLL.KEYBOARD_WIDTH) return;

    const absoluteX = pointerPos.x + scroll.x;
    const absoluteY = pointerPos.y + scroll.y - PIANO_ROLL.TIMELINE_HEIGHT;
    if (absoluteY < 0) return; 

    const rowIndex = Math.floor(absoluteY / PIANO_ROLL.NOTE_HEIGHT);
    const pitch = gridNotes[rowIndex]; 
    if (!pitch) return;

    const xWithoutKeyboard = absoluteX - PIANO_ROLL.KEYBOARD_WIDTH;
    const rawSnaps = xWithoutKeyboard / snapWidth;
    const snappedSnaps = Math.floor(rawSnaps);
    const startTick = snappedSnaps * snapTicks;
    const clickedTick = rawSnaps * snapTicks;

    const isOverlapping = activeTrack.notes.some(n => {
      const isSamePitch = n.pitch === pitch;
      const isInsideTime = clickedTick >= n.startTick && clickedTick < (n.startTick + n.durationTicks);
      return isSamePitch && isInsideTime;
    });

    if (isOverlapping) return;

    const hasSolo = tracks.some(t => t.isSolo);
    const newNote: Note = { id: generateNoteId(), pitch, startTick, durationTicks: snapTicks, velocity: 100 };
    addNoteToTrack(activeTrackId, newNote);
    playFeedbackNote(pitch, activeTrack, hasSolo);
  };

  const playheadRef = useRef<any>(null);
  useEffect(() => {
    let animId: number;
    const animatePlayhead = () => {
      if (playheadRef.current && Tone.Transport.state === 'started') {
        const currentX = PIANO_ROLL.KEYBOARD_WIDTH + (Tone.Transport.ticks / PIANO_ROLL.TICKS_PER_BEAT) * PIANO_ROLL.BEAT_WIDTH;
        playheadRef.current.x(currentX);
      }
      animId = requestAnimationFrame(animatePlayhead);
    };
    if (isPlaying) animatePlayhead();
    else if (playheadRef.current) playheadRef.current.x(PIANO_ROLL.KEYBOARD_WIDTH);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-surface-base outline-none relative touch-none select-none">
      <Stage 
        width={dimensions.width} height={dimensions.height}
        onClick={handleGridClick} 
        onTap={handleGridClick} 
        onWheel={handleWheel}
        onPointerDown={handleDown} 
        onPointerMove={handleMove} 
        onPointerUp={handleUp}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          <Group x={-scroll.x} y={-scroll.y + PIANO_ROLL.TIMELINE_HEIGHT}>
            <Rect x={PIANO_ROLL.KEYBOARD_WIDTH} y={0} width={totalWidth} height={totalHeight} fill="transparent" />

            <Group listening={false}>
              {gridNotes.map((note, index) => (
                <Line key={`h-line-${note}`} points={[PIANO_ROLL.KEYBOARD_WIDTH, index * PIANO_ROLL.NOTE_HEIGHT, totalWidth, index * PIANO_ROLL.NOTE_HEIGHT]} stroke={colors.gridBeat} strokeWidth={1} />
              ))}
              {Array.from({ length: totalMeasures * beatsPerMeasure }).map((_, index) => {
                const x = PIANO_ROLL.KEYBOARD_WIDTH + (index * beatWidth);
                const isMeasureStart = index % beatsPerMeasure === 0;
                return (
                  <Line key={`v-line-${index}`} points={[x, 0, x, totalHeight]} stroke={isMeasureStart ? colors.gridMeasure : colors.gridBeat} strokeWidth={isMeasureStart ? 2 : 1} />
                );
              })}
            </Group>

            <Group>
              {activeTrack?.notes.map((note) => (
                <NoteBlock 
                  key={note.id} note={note} trackId={activeTrack.id} 
                  removeNote={removeNoteFromTrack} updateNote={updateNoteInTrack} 
                  scroll={scroll} snapResolution={snapResolution}
                  onEditRequest={(n, clientX, clientY) => setEditingNote({ note: n, x: clientX, y: clientY })} 
                  isSelected={selectedNoteIds.includes(note.id)}
                  gridNotes={gridNotes} 
                />
              ))}
            </Group>

            {selectionBox && (
              <Rect
                x={Math.min(selectionBox.x1, selectionBox.x2) - scroll.x}
                y={Math.min(selectionBox.y1, selectionBox.y2) - scroll.y - PIANO_ROLL.TIMELINE_HEIGHT}
                width={Math.abs(selectionBox.x2 - selectionBox.x1)}
                height={Math.abs(selectionBox.y2 - selectionBox.y1)}
                fill="rgba(218, 177, 108, 0.15)" stroke="#DAB16C" strokeWidth={1} listening={false}
              />
            )}

            <Line ref={playheadRef} points={[0, 0, 0, totalHeight + PIANO_ROLL.TIMELINE_HEIGHT]} x={PIANO_ROLL.KEYBOARD_WIDTH} y={0} stroke="#DAB16C" strokeWidth={2} listening={false} shadowColor="#DAB16C" shadowBlur={6} shadowOpacity={0.8} />
          </Group>

          <Group x={0} y={-scroll.y + PIANO_ROLL.TIMELINE_HEIGHT} listening={false}>
            {gridNotes.map((note, index) => {
              const y = index * PIANO_ROLL.NOTE_HEIGHT;
              const isBlackKey = note.includes('#');
              return (
                <Group key={`key-${note}`} y={y}>
                  <Rect x={0} y={0} width={PIANO_ROLL.KEYBOARD_WIDTH} height={PIANO_ROLL.NOTE_HEIGHT} fill={isBlackKey ? colors.bgKeyboardBlack : colors.bgKeyboardWhite} stroke={colors.gridBeat} strokeWidth={1} />
                  <Text text={note} x={6} y={7} fontSize={10} fill={isBlackKey ? colors.textMuted : colors.textPrimary} fontFamily="sans-serif" fontStyle="bold" />
                </Group>
              );
            })}
            <Line points={[PIANO_ROLL.KEYBOARD_WIDTH, 0, PIANO_ROLL.KEYBOARD_WIDTH, totalHeight]} stroke={colors.gridMeasure} strokeWidth={2} />
          </Group>

          <Group x={-scroll.x} y={0} listening={false}>
            <Rect x={PIANO_ROLL.KEYBOARD_WIDTH} y={0} width={totalWidth} height={PIANO_ROLL.TIMELINE_HEIGHT} fill={colors.timelineBg} />
            {Array.from({ length: totalMeasures }).map((_, index) => {
              const x = PIANO_ROLL.KEYBOARD_WIDTH + (index * beatWidth * beatsPerMeasure);
              return (
                <Group key={`measure-marker-${index}`}>
                  <Line points={[x, PIANO_ROLL.TIMELINE_HEIGHT - 6, x, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
                  <Text text={`${index + 1}`} x={x + 6} y={PIANO_ROLL.TIMELINE_HEIGHT / 2 - 4} fontSize={10} fill={colors.textMuted} fontFamily="sans-serif" fontStyle="bold" />
                </Group>
              );
            })}
            <Line points={[PIANO_ROLL.KEYBOARD_WIDTH, PIANO_ROLL.TIMELINE_HEIGHT, totalWidth, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
          </Group>

          <Group x={0} y={0} listening={false}>
            <Rect width={PIANO_ROLL.KEYBOARD_WIDTH} height={PIANO_ROLL.TIMELINE_HEIGHT} fill={colors.timelineBg} />
            <Text text="0/10000" x={6} y={PIANO_ROLL.TIMELINE_HEIGHT / 2 - 4} fontSize={10} fill="#DAB16C" fontFamily="sans-serif" fontStyle="bold" />
            <Line points={[PIANO_ROLL.KEYBOARD_WIDTH, 0, PIANO_ROLL.KEYBOARD_WIDTH, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
            <Line points={[0, PIANO_ROLL.TIMELINE_HEIGHT, PIANO_ROLL.KEYBOARD_WIDTH, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
          </Group>
        </Layer>
      </Stage>

      {editingNote && (
        <div style={{ left: editingNote.x + 10, top: editingNote.y + 10 }} className="fixed z-50 flex w-48 flex-col gap-3 rounded border border-grid-light bg-surface-modal p-3 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-content-primary">Editar Nota ({editingNote.note.pitch})</span>
            <button onClick={() => setEditingNote(null)} className="text-content-muted hover:text-content-primary">×</button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Tensão / Velocity ({editingNote.note.velocity})</label>
            <input type="range" min="0" max="100" value={editingNote.note.velocity} onChange={(e) => {
              const newVelocity = parseInt(e.target.value);
              if (activeTrackId) updateNoteInTrack(activeTrackId, editingNote.note.id, { velocity: newVelocity });
              setEditingNote({ ...editingNote, note: { ...editingNote.note, velocity: newVelocity } });
            }} className="w-full accent-accent-primary" />
          </div>
          
          <button 
            onClick={() => {
              if (activeTrackId) removeNoteFromTrack(activeTrackId, editingNote.note.id);
              setEditingNote(null);
            }}
            className="mt-1 w-full rounded border border-[#4C2020] bg-[#2A1111] py-1.5 text-[11px] font-bold text-[#FF6B6B] hover:bg-[#3D1818] transition-colors"
          >
            Excluir Nota
          </button>
        </div>
      )}
    </div>
  );
}