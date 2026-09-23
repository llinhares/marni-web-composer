import { Group, Rect, Line, Text } from 'react-konva';
import { type KonvaEventObject } from 'konva/lib/Node';
import { PIANO_ROLL } from '@/utils/constants';

interface TimelineRulerProps {
  scroll: { x: number; y: number };
  totalWidth: number;
  totalMeasures: number;
  currentBeatWidth: number;
  beatsPerMeasure: number;
  colors: { timelineBg: string; gridMeasure: string; textMuted: string };
  onTimelineClick: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
}

export function TimelineRuler({ 
  scroll, totalWidth, totalMeasures, currentBeatWidth, beatsPerMeasure, colors, onTimelineClick 
}: TimelineRulerProps) {
  return (
    <Group x={-scroll.x} y={0}>
      <Rect 
        x={PIANO_ROLL.KEYBOARD_WIDTH} 
        y={0} 
        width={totalWidth} 
        height={PIANO_ROLL.TIMELINE_HEIGHT} 
        fill={colors.timelineBg}
        onClick={onTimelineClick}
        onTap={onTimelineClick}
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
  );
}
