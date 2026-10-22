import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrintedNote,
  keyAlteration,
  eventQuarters,
  expandPlayingOrder,
  buildScore,
  findInvalidMeasures,
  mergeRepairedMeasures,
  measureIsValid,
  tempoFrom,
  type ScoreJson,
  type ScoreMeasure,
} from './scoreTranscription.ts';

const m = (number: number, upper: ScoreMeasure['staves'][0]['voices'][0]['events'], extra: Partial<ScoreMeasure> = {}): ScoreMeasure => ({
  number,
  staves: [{ staff: 1, voices: [{ events: upper }] }],
  ...extra,
});
const pitchesOf = (score: ScoreJson) => buildScore(score, 't').notes.map((n) => [n.pitch, n.startTick, n.durationTicks]);

test('parsePrintedNote reads letters, printed accidentals and octaves', () => {
  assert.deepEqual(parsePrintedNote('C4'), { letter: 'C', accidental: null, octave: 4 });
  assert.deepEqual(parsePrintedNote('F#5'), { letter: 'F', accidental: 1, octave: 5 });
  assert.deepEqual(parsePrintedNote('Bb3'), { letter: 'B', accidental: -1, octave: 3 });
  assert.deepEqual(parsePrintedNote('Bn4'), { letter: 'B', accidental: 0, octave: 4 });
  assert.deepEqual(parsePrintedNote('Cx4'), { letter: 'C', accidental: 2, octave: 4 });
  assert.equal(parsePrintedNote('H2'), null);
});

test('key signature applies to unprinted accidentals', () => {
  assert.equal(keyAlteration(-3, 'B'), -1); // Eb major: Bb Eb Ab
  assert.equal(keyAlteration(-3, 'D'), 0);
  assert.equal(keyAlteration(2, 'C'), 1); // D major: F# C#
  // In Eb major, a printed "B4" with no accidental sounds Bb4
  assert.deepEqual(pitchesOf({ keyFifths: -3, measures: [m(1, [{ notes: ['B4'], d: 'w' }])] }), [[70, 0, 1920]]);
});

test('an accidental lasts until the barline, then the key signature returns', () => {
  const score: ScoreJson = {
    keyFifths: 0,
    measures: [
      m(1, [
        { notes: ['F#4'], d: 'h' },
        { notes: ['F4'], d: 'h' }, // still F# in this bar
      ]),
      m(2, [{ notes: ['F4'], d: 'w' }]), // natural again
    ],
  };
  assert.deepEqual(pitchesOf(score).map((x) => x[0]), [66, 66, 65]);
});

test('printed natural cancels the key signature for the rest of the bar', () => {
  const score: ScoreJson = { keyFifths: -1, measures: [m(1, [{ notes: ['Bn4'], d: 'h' }, { notes: ['B4'], d: 'h' }])] };
  assert.deepEqual(pitchesOf(score).map((x) => x[0]), [71, 71]);
});

test('onsets come from adding durations: dots, tuplets, rests and chords', () => {
  assert.equal(eventQuarters({ d: 'q', dots: 1 }), 1.5);
  assert.equal(eventQuarters({ d: '8', tuplet: [3, 2] }), 1 / 3);
  const score: ScoreJson = {
    measures: [
      m(1, [
        { notes: ['C4', 'E4', 'G4'], d: 'q', dots: 1 },
        { notes: ['D4'], d: '8' },
        { rest: true, d: 'q' },
        { notes: ['E4'], d: '8', tuplet: [3, 2] },
        { notes: ['F4'], d: '8', tuplet: [3, 2] },
        { notes: ['G4'], d: '8', tuplet: [3, 2] },
      ]),
    ],
  };
  assert.deepEqual(pitchesOf(score), [
    [60, 0, 720],
    [64, 0, 720],
    [67, 0, 720],
    [62, 720, 240],
    [64, 1440, 160],
    [65, 1600, 160],
    [67, 1760, 160],
  ]);
});

test('ties merge into one longer note, also across the barline (keeping the accidental)', () => {
  const score: ScoreJson = {
    measures: [m(1, [{ rest: true, d: 'h' }, { notes: ['C#5'], d: 'h', tie: true }]), m(2, [{ notes: ['C5'], d: 'h' }, { rest: true, d: 'h' }])],
  };
  // The tied-over note is written without accidental in bar 2 but still sounds C#: one long note
  assert.deepEqual(pitchesOf(score), [[73, 960, 1920]]);

  const sameSpelling: ScoreJson = {
    keyFifths: 2, // D major: C is sharp in both bars
    measures: [m(1, [{ rest: true, d: 'h' }, { notes: ['C5'], d: 'h', tie: true }]), m(2, [{ notes: ['C5'], d: 'h' }, { rest: true, d: 'h' }])],
  };
  assert.deepEqual(pitchesOf(sameSpelling), [[73, 960, 1920]]);
});

test('two staves become right and left hand; voices on one staff run in parallel', () => {
  const score: ScoreJson = {
    measures: [
      {
        number: 1,
        staves: [
          { staff: 1, clef: 'treble', voices: [{ events: [{ notes: ['E5'], d: 'w' }] }, { events: [{ notes: ['C5'], d: 'h' }, { notes: ['D5'], d: 'h' }] }] },
          { staff: 2, clef: 'bass', voices: [{ events: [{ notes: ['C3'], d: 'w' }] }] },
        ],
      },
    ],
  };
  const r = buildScore(score, 't');
  assert.deepEqual(r.rightHandNotes.map((n) => [n.pitch, n.startTick]), [
    [76, 0],
    [72, 0],
    [74, 960],
  ]);
  assert.deepEqual(r.leftHandNotes.map((n) => n.pitch), [48]);
});

test('a short first bar is a pickup; 6/8 bars last 3 quarters', () => {
  const score: ScoreJson = {
    timeSignature: '6/8',
    measures: [m(1, [{ notes: ['G4'], d: '8' }]), m(2, [{ notes: ['C5'], d: 'q', dots: 1 }, { notes: ['E5'], d: 'q', dots: 1 }])],
  };
  const r = buildScore(score, 't');
  assert.deepEqual(r.notes.map((n) => [n.pitch, n.startTick, n.durationTicks]), [
    [67, 0, 240],
    [72, 240, 720],
    [76, 960, 720],
  ]);
  assert.equal(r.timeSignature, '6/8');
  assert.deepEqual(r.measuresToReview, []);
});

test('measures that do not add up are reported for review', () => {
  const score: ScoreJson = {
    measures: [m(1, [{ notes: ['C4'], d: 'w' }]), m(2, [{ notes: ['C4'], d: 'h' }, { notes: ['D4'], d: 'q' }]), m(3, [{ notes: ['C4'], d: 'w' }])],
  };
  assert.deepEqual(findInvalidMeasures(score), [2]);
  assert.match(buildScore(score, 't').warnings.join(' '), /compasso 2/);
  const fixed = mergeRepairedMeasures(score, [m(2, [{ notes: ['C4'], d: 'h' }, { notes: ['D4'], d: 'h' }])]);
  assert.deepEqual(findInvalidMeasures(fixed), []);
});

test('repeats with first and second endings expand into playing order', () => {
  const ms: ScoreMeasure[] = [
    m(1, [], { repeatStart: true }),
    m(2, []),
    m(3, [], { ending: [1], repeatEnd: true }),
    m(4, [], { ending: [2] }),
    m(5, []),
  ];
  assert.deepEqual(expandPlayingOrder(ms).map((i) => i + 1), [1, 2, 3, 1, 2, 4, 5]);
});

test('repeat without start sign goes back to the beginning; D.C. al Fine stops at Fine', () => {
  assert.deepEqual(expandPlayingOrder([m(1, []), m(2, [], { repeatEnd: true }), m(3, [])]).map((i) => i + 1), [1, 2, 1, 2, 3]);
  const dc = [m(1, []), m(2, [], { fine: true }), m(3, []), m(4, [], { jump: 'dc-al-fine' })];
  assert.deepEqual(expandPlayingOrder(dc).map((i) => i + 1), [1, 2, 3, 4, 1, 2]);
});

test('D.S. al Coda jumps to the segno and then to the coda', () => {
  const ms = [m(1, []), m(2, [], { segno: true }), m(3, [], { toCoda: true }), m(4, [], { jump: 'ds-al-coda' }), m(5, [], { coda: true }), m(6, [])];
  assert.deepEqual(expandPlayingOrder(ms).map((i) => i + 1), [1, 2, 3, 4, 2, 3, 5, 6]);
});

test('repeated sections are placed back to back in time', () => {
  const score: ScoreJson = { measures: [m(1, [{ notes: ['C4'], d: 'w' }], { repeatStart: true, repeatEnd: true }), m(2, [{ notes: ['D4'], d: 'w' }])] };
  assert.deepEqual(pitchesOf(score).map((x) => [x[0], x[1]]), [
    [60, 0],
    [60, 1920],
    [62, 3840],
  ]);
});

test('dynamics set velocities and tempo words give a BPM', () => {
  const score: ScoreJson = { measures: [m(1, [{ notes: ['C4'], d: 'w' }], { dynamic: 'p' }), m(2, [{ notes: ['C4'], d: 'w' }], { dynamic: 'ff' })] };
  assert.deepEqual(buildScore(score, 't').notes.map((n) => n.velocity), [56, 112]);
  assert.equal(tempoFrom(undefined, 'Allegro ♩ = 144'), 144);
  assert.equal(tempoFrom(undefined, 'Andante'), 84);
  assert.equal(tempoFrom(90, 'Presto'), 90);
});

test('measureIsValid rejects a short bar unless a pickup is allowed', () => {
  const short = m(5, [{ notes: ['C4'], d: 'h' }]);
  assert.equal(measureIsValid(short, '4/4', false), false);
  assert.equal(measureIsValid(short, '4/4', true), true);
  assert.equal(measureIsValid(m(5, [{ notes: ['C4'], d: 'h', dots: 1 }]), '3/4', false), true);
  assert.equal(measureIsValid(m(5, [{ notes: ['C4'], d: 'w' }]), '3/4', true), false, 'Too long is never valid');
});
