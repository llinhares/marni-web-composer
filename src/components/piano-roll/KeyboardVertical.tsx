import { Group, Rect, Text, Line } from 'react-konva';
import { PIANO_ROLL } from '@/utils/constants';

interface KeyboardVerticalProps {
  gridNotes: string[];
  currentNoteHeight: number;
  scroll: { x: number; y: number };
  totalHeight: number;
  colors: { bgKeyboardBlack: string; bgKeyboardWhite: string; gridBeat: string; gridMeasure: string; textMuted: string; textPrimary: string };
}

export function KeyboardVertical({ gridNotes, currentNoteHeight, scroll, totalHeight, colors }: KeyboardVerticalProps) {
  return (
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
  );
}
