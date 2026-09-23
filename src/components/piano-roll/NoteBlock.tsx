import { useState, useRef } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { type KonvaEventObject } from 'konva/lib/Node';
import { type Note } from '@/types';
import { PIANO_ROLL } from '@/utils/constants';
import { useComposerStore } from '@/store/useComposerStore';
import { useShallow } from 'zustand/react/shallow';

interface NoteBlockProps {
  note: Note;
  trackId: string;
  removeNote: (trackId: string, noteId: string) => void;
  updateNote: (trackId: string, noteId: string, updates: Partial<Note>) => void;
  scroll: { x: number, y: number }; 
  snapResolution: number; 
  onEditRequest: (note: Note, x: number, y: number) => void;
  isSelected: boolean;
  gridNotes: string[];
  beatWidth: number;
  noteHeight: number;
}

export function NoteBlock({ 
  note, trackId, removeNote, updateNote, scroll, snapResolution, 
  onEditRequest, isSelected, gridNotes, beatWidth, noteHeight 
}: NoteBlockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const isDraggingRef = useRef(false);

  const { currentTool, setSelectedNotes } = useComposerStore(useShallow(state => ({
    currentTool: state.currentTool, setSelectedNotes: state.setSelectedNotes
  })));

  const snapWidth = (beatWidth * 4) / snapResolution;

  const rowIndex = gridNotes.indexOf(note.pitch);
  const yPos = rowIndex * noteHeight;
  const xPos = PIANO_ROLL.KEYBOARD_WIDTH + (note.startTick / PIANO_ROLL.TICKS_PER_BEAT) * beatWidth;
  
  const storeWidth = (note.durationTicks / PIANO_ROLL.TICKS_PER_BEAT) * beatWidth;
  const currentWidth = dragWidth !== null ? dragWidth : storeWidth;
  const handleWidth = Math.min(6, currentWidth);

  const showResize = (isHovered || isSelected) && currentTool === 'select';

  const colors = { 
    fill: isSelected ? '#DAB16C' : '#B99155', 
    stroke: isSelected ? '#FFFFFF' : '#D4AB6A', 
    text: '#1C1A1A', 
    handle: '#FFFFFF' 
  };

  const handleContextMenu = (e: KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    removeNote(trackId, note.id);
  };

  const handleResizeDragMove = (e: KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const rawWidth = newX + handleWidth; 
    setDragWidth(Math.max(snapWidth, Math.round(rawWidth / snapWidth) * snapWidth));
  };

  const handleResizeDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const newDurationTicks = Math.max(1, Math.round((currentWidth / beatWidth) * PIANO_ROLL.TICKS_PER_BEAT));
    if (newDurationTicks !== note.durationTicks) {
      updateNote(trackId, note.id, { durationTicks: newDurationTicks });
    }
    
    setDragWidth(null);
    e.target.x(currentWidth - handleWidth);
    e.target.y(0);
  };

  const noteDragBoundFunc = (pos: { x: number, y: number }) => {
    const localX = pos.x + scroll.x;
    const localY = pos.y + scroll.y - PIANO_ROLL.TIMELINE_HEIGHT;

    const boundedX = Math.max(PIANO_ROLL.KEYBOARD_WIDTH, localX);
    const snappedLocalX = Math.round((boundedX - PIANO_ROLL.KEYBOARD_WIDTH) / snapWidth) * snapWidth + PIANO_ROLL.KEYBOARD_WIDTH;

    const snappedLocalY = Math.round(localY / noteHeight) * noteHeight;
    const maxY = (gridNotes.length - 1) * noteHeight;
    const finalLocalY = Math.max(0, Math.min(maxY, snappedLocalY));

    return { 
      x: snappedLocalX - scroll.x, 
      y: finalLocalY - scroll.y + PIANO_ROLL.TIMELINE_HEIGHT 
    };
  };

  const handleNoteDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target.name() === 'resize-handle') return;
    isDraggingRef.current = false;

    const newX = e.target.x();
    const newY = e.target.y();

    const newRowIndex = Math.round(newY / noteHeight);
    const newPitch = gridNotes[newRowIndex];

    const snappedX = Math.max(PIANO_ROLL.KEYBOARD_WIDTH, newX);
    const beats = (snappedX - PIANO_ROLL.KEYBOARD_WIDTH) / beatWidth;
    const newStartTick = Math.max(0, Math.round(beats * PIANO_ROLL.TICKS_PER_BEAT));

    if (newPitch && (newPitch !== note.pitch || newStartTick !== note.startTick)) {
      updateNote(trackId, note.id, { pitch: newPitch, startTick: newStartTick });
    } else {
      e.target.x(xPos);
      e.target.y(yPos);
    }
  };

  const handleEditRequest = (e: KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    const nativeEvent = e.evt as any;
    
    const clientX = 
      nativeEvent.clientX ?? 
      nativeEvent.changedTouches?.[0]?.clientX ?? 
      nativeEvent.touches?.[0]?.clientX ?? 
      window.innerWidth / 2;

    const clientY = 
      nativeEvent.clientY ?? 
      nativeEvent.changedTouches?.[0]?.clientY ?? 
      nativeEvent.touches?.[0]?.clientY ?? 
      window.innerHeight / 2;
    
    onEditRequest(note, clientX, clientY); 
  };

  if (rowIndex === -1) return null;

  return (
    <Group 
      x={xPos} 
      y={yPos}
      name="note-group"
      draggable={currentTool === 'select'} 
      dragBoundFunc={noteDragBoundFunc}
      onClick={(e) => {
        if (currentTool === 'select') {
          e.cancelBubble = true;
          setSelectedNotes([note.id]);
        }
      }}
      onTap={(e) => {
        if (currentTool === 'select') {
          e.cancelBubble = true;
          setSelectedNotes([note.id]);
        }
      }}
      onDragStart={(e) => {
        if (e.target.name() === 'resize-handle') return;
        isDraggingRef.current = true;
        e.cancelBubble = true; 
        if (!isSelected) setSelectedNotes([note.id]); 
      }}
      onDragEnd={handleNoteDragEnd}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (currentTool === 'select') {
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = 'move';
        }
      }}
      onMouseLeave={(e) => {
        if (isDraggingRef.current) return; 
        setIsHovered(false);
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }}
      onContextMenu={handleContextMenu}
      onDblClick={handleEditRequest}
      onDblTap={handleEditRequest}
    >
      <Rect 
        width={currentWidth} 
        height={noteHeight} 
        fill={colors.fill} 
        stroke={isHovered ? '#FFFFFF' : colors.stroke} 
        strokeWidth={isSelected ? 2 : 1} 
        cornerRadius={2} 
      />
      <Rect 
        x={0} 
        y={0} 
        width={currentWidth} 
        height={Math.min(4, noteHeight / 4)} 
        fill="rgba(255, 255, 255, 0.15)" 
        cornerRadius={[2, 2, 0, 0]} 
        listening={false} 
      />

      {currentWidth > 30 && noteHeight >= 14 && (
        <Text 
          text={note.pitch} 
          x={4} 
          y={Math.max(2, (noteHeight - 12) / 2)} 
          fontSize={Math.min(10, noteHeight - 4)} 
          fill={colors.text} 
          fontFamily="sans-serif" 
          fontStyle="bold" 
          listening={false} 
        />
      )}

      {showResize && (
        <Rect
          name="resize-handle"
          x={currentWidth - handleWidth}
          y={0}
          width={handleWidth}
          height={noteHeight}
          fill="transparent"
          stroke={colors.handle}
          strokeWidth={2}
          cornerRadius={[0, 2, 2, 0]}
          draggable
          onDragStart={(e) => { e.cancelBubble = true; }}
          onDragMove={handleResizeDragMove}
          onDragEnd={handleResizeDragEnd}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'ew-resize';
            e.cancelBubble = true; 
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'move';
          }}
          dragBoundFunc={(pos) => {
            const absoluteNoteX = xPos - scroll.x;
            const minX = absoluteNoteX + snapWidth - handleWidth;
            return { x: Math.max(minX, pos.x), y: yPos - scroll.y + PIANO_ROLL.TIMELINE_HEIGHT };
          }}
        />
      )}
    </Group>
  );
}