import { Group, Line } from 'react-konva';
import { PIANO_ROLL } from '@/utils/constants';

interface GridBackgroundProps {
  visibleGrid: {
    beatLines: { x: number; isMeasure: boolean; key: string }[];
    pitchLines: { y: number; key: string }[];
  };
  totalWidth: number;
  totalHeight: number;
  colors: { gridMeasure: string; gridBeat: string };
}

export function GridBackground({ visibleGrid, totalWidth, totalHeight, colors }: GridBackgroundProps) {
  return (
    <Group listening={false}>
      {visibleGrid.pitchLines.map((line) => (
        <Line key={line.key} points={[PIANO_ROLL.KEYBOARD_WIDTH, line.y, totalWidth, line.y]} stroke={colors.gridBeat} strokeWidth={1} />
      ))}
      {visibleGrid.beatLines.map((line) => (
        <Line key={line.key} points={[line.x, 0, line.x, totalHeight]} stroke={line.isMeasure ? colors.gridMeasure : colors.gridBeat} strokeWidth={line.isMeasure ? 2 : 1} />
      ))}
    </Group>
  );
}
