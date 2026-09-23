import { useEffect, useRef, useState, useMemo } from 'react';
import { Stage, Layer, Line, Text, Rect, Group } from 'react-konva';
import { type KonvaEventObject } from 'konva/lib/Node';
import { PIANO_ROLL, INSTRUMENT_DICT } from '@/utils/constants';
import { useComposerStore, useComposerHistoryState } from '@/store/useComposerStore';
import type { InstrumentType, Note } from '@/types';
import { NoteBlock } from './NoteBlock';
import { playFeedbackNote, playComposition } from '@/core/audio/ToneEngine';
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
    currentTool, selectedNoteIds, setSelectedNotes, deleteSelectedNotes,
    zoomX, zoomY, setZoomX, seekTick, setSeekTick
  } = useComposerStore();

  const { undo, redo } = useComposerHistoryState();
  
  const activeTrack = tracks.find(track => track.id === activeTrackId);
  const instrumentKey = (activeTrack?.instrument || 'Grand Piano') as InstrumentType;
  const gridNotes = INSTRUMENT_DICT[instrumentKey] || INSTRUMENT_DICT['Grand Piano'];

  const [editingNote, setEditingNote] = useState<{ note: Note, x: number, y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedNotes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedNotes, undo, redo]);

  useEffect(() => {
    setScroll({ x: 0, y: 0 });
  }, [activeTrack?.instrument]);

  const colors = { 
    gridMeasure: '#352F2A', 
    gridBeat: '#221E1B', 
    bgKeyboardBlack: '#1C1917', 
    bgKeyboardWhite: '#26221E', 
    textMuted: '#686055', 
    textPrimary: '#938A7E', 
    timelineBg: '#1C1917' 
  };

  const currentNoteHeight = PIANO_ROLL.NOTE_HEIGHT * zoomY;
  const totalHeight = gridNotes.length * currentNoteHeight;
  const beatsPerMeasure = song.timeSignature[0];
  const noteValue = song.timeSignature[1];
  const currentBeatWidth = ((PIANO_ROLL.BEAT_WIDTH * 4) / noteValue) * zoomX;
  const snapWidth = ((PIANO_ROLL.BEAT_WIDTH * 4) / snapResolution) * zoomX;
  const snapTicks = (PIANO_ROLL.TICKS_PER_BEAT * 4) / snapResolution;
  const totalMeasures = 100;
  const totalWidth = PIANO_ROLL.KEYBOARD_WIDTH + (totalMeasures * beatsPerMeasure * currentBeatWidth);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    if (e.evt.ctrlKey) {
      const zoomDelta = e.evt.deltaY > 0 ? -0.1 : 0.1;
      setZoomX(zoomX + zoomDelta);
      return;
    }

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

    // Middle click or drag in select mode
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
          const nx = PIANO_ROLL.KEYBOARD_WIDTH + (note.startTick / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
          const ny = gridNotes.indexOf(note.pitch) * currentNoteHeight + PIANO_ROLL.TIMELINE_HEIGHT;
          const nw = (note.durationTicks / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
          const nh = currentNoteHeight;
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

    const rowIndex = Math.floor(absoluteY / currentNoteHeight);
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

  // Timeline click for scrubbing / seek
  const handleTimelineClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const pointerPos = stage?.getPointerPosition();
    if (!pointerPos || pointerPos.x <= PIANO_ROLL.KEYBOARD_WIDTH) return;

    const clickedX = pointerPos.x + scroll.x - PIANO_ROLL.KEYBOARD_WIDTH;
    const clickedBeats = Math.max(0, clickedX / currentBeatWidth);
    const newSeekTick = Math.max(0, Math.round(clickedBeats * PIANO_ROLL.TICKS_PER_BEAT));
    
    setSeekTick(newSeekTick);

    if (isPlaying) {
      playComposition(tracks, song.bpm, newSeekTick);
    } else if (playheadRef.current) {
      const headX = PIANO_ROLL.KEYBOARD_WIDTH + (newSeekTick / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
      playheadRef.current.x(headX);
      playheadRef.current.getLayer()?.batchDraw();
    }
  };

  const playheadRef = useRef<any>(null);
  useEffect(() => {
    let animId: number;
    const animatePlayhead = () => {
      if (playheadRef.current) {
        if (Tone.Transport.state === 'started') {
          const currentTicks = Tone.Transport.ticks;
          const currentX = PIANO_ROLL.KEYBOARD_WIDTH + (currentTicks / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
          playheadRef.current.x(currentX);
          playheadRef.current.getLayer()?.batchDraw();
        } else {
          const headX = PIANO_ROLL.KEYBOARD_WIDTH + (seekTick / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
          playheadRef.current.x(headX);
          playheadRef.current.getLayer()?.batchDraw();
        }
      }
      animId = requestAnimationFrame(animatePlayhead);
    };
    animatePlayhead();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentBeatWidth, seekTick]);

  // Viewport Culling for Note Blocks
  const visibleNotes = useMemo(() => {
    if (!activeTrack) return [];
    const viewLeft = scroll.x - 200;
    const viewRight = scroll.x + dimensions.width + 200;
    const viewTop = scroll.y - 100;
    const viewBottom = scroll.y + dimensions.height + 100;

    return activeTrack.notes.filter(note => {
      const rowIndex = gridNotes.indexOf(note.pitch);
      if (rowIndex === -1) return false;

      const xPos = PIANO_ROLL.KEYBOARD_WIDTH + (note.startTick / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
      const noteWidth = (note.durationTicks / PIANO_ROLL.TICKS_PER_BEAT) * currentBeatWidth;
      const yPos = rowIndex * currentNoteHeight;

      const isXVisible = (xPos + noteWidth >= viewLeft) && (xPos <= viewRight);
      const isYVisible = (yPos + currentNoteHeight >= viewTop) && (yPos <= viewBottom);

      return isXVisible && isYVisible;
    });
  }, [activeTrack, gridNotes, scroll.x, scroll.y, dimensions.width, dimensions.height, currentBeatWidth, currentNoteHeight]);

  // Viewport Culling for grid lines
  const visibleGrid = useMemo(() => {
    const totalBeats = totalMeasures * beatsPerMeasure;
    const minBeatIdx = Math.max(0, Math.floor((scroll.x - 100) / currentBeatWidth));
    const maxBeatIdx = Math.min(totalBeats, Math.ceil((scroll.x + dimensions.width + 100) / currentBeatWidth));

    const minPitchIdx = Math.max(0, Math.floor((scroll.y - 100) / currentNoteHeight));
    const maxPitchIdx = Math.min(gridNotes.length, Math.ceil((scroll.y + dimensions.height + 100) / currentNoteHeight));

    const beatLines: { x: number, isMeasure: boolean, key: string }[] = [];
    for (let i = minBeatIdx; i <= maxBeatIdx; i++) {
      beatLines.push({
        x: PIANO_ROLL.KEYBOARD_WIDTH + (i * currentBeatWidth),
        isMeasure: i % beatsPerMeasure === 0,
        key: `v-line-${i}`
      });
    }

    const pitchLines: { y: number, key: string }[] = [];
    for (let i = minPitchIdx; i <= maxPitchIdx; i++) {
      pitchLines.push({
        y: i * currentNoteHeight,
        key: `h-line-${i}`
      });
    }

    return { beatLines, pitchLines };
  }, [scroll.x, scroll.y, dimensions.width, dimensions.height, currentBeatWidth, currentNoteHeight, gridNotes.length, beatsPerMeasure]);

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
          {/* Main Piano Roll Area */}
          <Group x={-scroll.x} y={-scroll.y + PIANO_ROLL.TIMELINE_HEIGHT}>
            <Rect x={PIANO_ROLL.KEYBOARD_WIDTH} y={0} width={totalWidth} height={totalHeight} fill="transparent" />

            {/* Culled Grid lines */}
            <Group listening={false}>
              {visibleGrid.pitchLines.map((line) => (
                <Line key={line.key} points={[PIANO_ROLL.KEYBOARD_WIDTH, line.y, totalWidth, line.y]} stroke={colors.gridBeat} strokeWidth={1} />
              ))}
              {visibleGrid.beatLines.map((line) => (
                <Line key={line.key} points={[line.x, 0, line.x, totalHeight]} stroke={line.isMeasure ? colors.gridMeasure : colors.gridBeat} strokeWidth={line.isMeasure ? 2 : 1} />
              ))}
            </Group>

            {/* Culled Note Blocks */}
            <Group>
              {visibleNotes.map((note) => (
                <NoteBlock 
                  key={note.id} note={note} trackId={activeTrack!.id} 
                  removeNote={removeNoteFromTrack} updateNote={updateNoteInTrack} 
                  scroll={scroll} snapResolution={snapResolution}
                  onEditRequest={(n, clientX, clientY) => setEditingNote({ note: n, x: clientX, y: clientY })} 
                  isSelected={selectedNoteIds.includes(note.id)}
                  gridNotes={gridNotes}
                  beatWidth={currentBeatWidth}
                  noteHeight={currentNoteHeight}
                />
              ))}
            </Group>

            {/* Selection marquee */}
            {selectionBox && (
              <Rect
                x={Math.min(selectionBox.x1, selectionBox.x2) - scroll.x}
                y={Math.min(selectionBox.y1, selectionBox.y2) - scroll.y - PIANO_ROLL.TIMELINE_HEIGHT}
                width={Math.abs(selectionBox.x2 - selectionBox.x1)}
                height={Math.abs(selectionBox.y2 - selectionBox.y1)}
                fill="rgba(218, 177, 108, 0.15)" stroke="#DAB16C" strokeWidth={1} listening={false}
              />
            )}

            {/* Playhead Marker */}
            <Line 
              ref={playheadRef} 
              points={[0, 0, 0, totalHeight + PIANO_ROLL.TIMELINE_HEIGHT]} 
              x={PIANO_ROLL.KEYBOARD_WIDTH} 
              y={0} 
              stroke="#DAB16C" 
              strokeWidth={2} 
              listening={false} 
              shadowColor="#DAB16C" 
              shadowBlur={6} 
              shadowOpacity={0.8} 
            />
          </Group>

          {/* Left Vertical Keyboard */}
          <Group x={0} y={-scroll.y + PIANO_ROLL.TIMELINE_HEIGHT} listening={false}>
            {gridNotes.map((note, index) => {
              const y = index * currentNoteHeight;
              const isBlackKey = note.includes('#');
              return (
                <Group key={`key-${note}`} y={y}>
                  <Rect x={0} y={0} width={PIANO_ROLL.KEYBOARD_WIDTH} height={currentNoteHeight} fill={isBlackKey ? colors.bgKeyboardBlack : colors.bgKeyboardWhite} stroke={colors.gridBeat} strokeWidth={1} />
                  <Text text={note} x={6} y={Math.max(2, (currentNoteHeight - 10) / 2)} fontSize={10} fill={isBlackKey ? colors.textMuted : colors.textPrimary} fontFamily="sans-serif" fontStyle="bold" />
                </Group>
              );
            })}
            <Line points={[PIANO_ROLL.KEYBOARD_WIDTH, 0, PIANO_ROLL.KEYBOARD_WIDTH, totalHeight]} stroke={colors.gridMeasure} strokeWidth={2} />
          </Group>

          {/* Top Horizontal Timeline / Ruler with Click-to-Seek */}
          <Group x={-scroll.x} y={0}>
            <Rect 
              x={PIANO_ROLL.KEYBOARD_WIDTH} 
              y={0} 
              width={totalWidth} 
              height={PIANO_ROLL.TIMELINE_HEIGHT} 
              fill={colors.timelineBg}
              onClick={handleTimelineClick}
              onTap={handleTimelineClick}
            />
            {Array.from({ length: totalMeasures }).map((_, index) => {
              const x = PIANO_ROLL.KEYBOARD_WIDTH + (index * currentBeatWidth * beatsPerMeasure);
              return (
                <Group key={`measure-marker-${index}`} listening={false}>
                  <Line points={[x, PIANO_ROLL.TIMELINE_HEIGHT - 6, x, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
                  <Text text={`${index + 1}`} x={x + 6} y={PIANO_ROLL.TIMELINE_HEIGHT / 2 - 4} fontSize={10} fill={colors.textMuted} fontFamily="sans-serif" fontStyle="bold" />
                </Group>
              );
            })}
            <Line points={[PIANO_ROLL.KEYBOARD_WIDTH, PIANO_ROLL.TIMELINE_HEIGHT, totalWidth, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} listening={false} />
          </Group>

          {/* Top-Left Corner Box */}
          <Group x={0} y={0} listening={false}>
            <Rect width={PIANO_ROLL.KEYBOARD_WIDTH} height={PIANO_ROLL.TIMELINE_HEIGHT} fill={colors.timelineBg} />
            <Text text={`${activeTrack?.notes.length || 0} Notas`} x={6} y={PIANO_ROLL.TIMELINE_HEIGHT / 2 - 4} fontSize={10} fill="#DAB16C" fontFamily="sans-serif" fontStyle="bold" />
            <Line points={[PIANO_ROLL.KEYBOARD_WIDTH, 0, PIANO_ROLL.KEYBOARD_WIDTH, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
            <Line points={[0, PIANO_ROLL.TIMELINE_HEIGHT, PIANO_ROLL.KEYBOARD_WIDTH, PIANO_ROLL.TIMELINE_HEIGHT]} stroke={colors.gridMeasure} strokeWidth={2} />
          </Group>
        </Layer>
      </Stage>

      {/* Note Editing Popover */}
      {editingNote && (
        <div 
          style={{ left: Math.min(window.innerWidth - 210, editingNote.x + 10), top: Math.min(window.innerHeight - 150, editingNote.y + 10) }} 
          className="fixed z-50 flex w-48 flex-col gap-3 rounded border border-grid-light bg-surface-modal p-3 shadow-xl" 
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-content-primary">Editar Nota ({editingNote.note.pitch})</span>
            <button onClick={() => setEditingNote(null)} className="text-content-muted hover:text-content-primary">×</button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Tensão / Velocity ({editingNote.note.velocity})</label>
            <input type="range" min="1" max="127" value={editingNote.note.velocity} onChange={(e) => {
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