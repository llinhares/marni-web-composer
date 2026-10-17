import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBdoScore, getRecommendedBdoGrade, trackToMML } from './bdoConverter.ts';
import type { Track, SongMetadata } from '../types/music.ts';

test('getRecommendedBdoGrade identifies proper grade thresholds', () => {
  assert.equal(getRecommendedBdoGrade(300), 'F');
  assert.equal(getRecommendedBdoGrade(750), 'D');
  assert.equal(getRecommendedBdoGrade(1500), 'C');
  assert.equal(getRecommendedBdoGrade(3500), 'B');
  assert.equal(getRecommendedBdoGrade(5000), 'A');
  assert.equal(getRecommendedBdoGrade(8500), 'S');
});

test('trackToMML produces valid tempo and note strings', () => {
  const track: Track = {
    id: 't1',
    name: 'Flute Solo',
    instrumentId: 'flute',
    color: '#64b5f6',
    volume: 80,
    pan: 0,
    isMuted: false,
    isSolo: false,
    auxSend: false,
    notes: [
      { id: 'n1', trackId: 't1', pitch: 60, startTick: 0, durationTicks: 480, velocity: 100 }, // C4 quarter
      { id: 'n2', trackId: 't1', pitch: 62, startTick: 480, durationTicks: 480, velocity: 100 }, // D4 quarter
    ],
  };

  const mml = trackToMML(track, 120);
  assert.ok(mml.includes('T120'));
  assert.ok(mml.includes('c4'));
  assert.ok(mml.includes('d4'));
});

test('generateBdoScore outputs structured XML and MML with correct counts', () => {
  const tracks: Track[] = [
    {
      id: 't1',
      name: 'Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 75,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes: [
        { id: 'n1', trackId: 't1', pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 },
      ],
    },
  ];

  const meta: SongMetadata = {
    title: 'Balenos Serenade',
    author: 'Adventurer',
    bpm: 128,
    timeSignature: '4/4',
    ticksPerQuarterNote: 480,
    accidentals: 'sharp',
    gridSnap: '1/4',
    bdoGrade: 'S',
  };

  const result = generateBdoScore(tracks, meta);
  assert.equal(result.totalNotes, 1);
  assert.equal(result.isWithinLimits, true);
  assert.ok(result.xmlContent.includes('<MarniScore'));
  assert.ok(result.xmlContent.includes('<Title>Balenos Serenade</Title>'));
  assert.ok(result.xmlContent.includes('instrumentId="grand-piano"'));
  assert.ok(result.mmlContent.includes('Balenos Serenade'));
});
