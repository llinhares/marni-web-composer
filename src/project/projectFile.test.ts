import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeProject,
  parseProjectFile,
  projectSignature,
  isProjectFileContent,
  projectFileName,
  ProjectFormatError,
  DEFAULT_EFFECTOR_SETTINGS,
  type ProjectState,
} from './projectFile.ts';

const makeState = (): ProjectState => ({
  title: 'Minha Música',
  author: 'Tchepper',
  bpm: 96,
  timeSignature: '3/4',
  gridSnap: '1/8',
  accidentals: 'flat',
  scaleType: 'major',
  bdoGrade: 'A',
  bdoOwnerId: 1009649,
  effectorSettings: { ...DEFAULT_EFFECTOR_SETTINGS, delay: { enabled: true, feedback: 50, time: 20, mix: 10 } },
  activeTrackId: 'track-b',
  tracks: [
    {
      id: 'track-a',
      name: 'Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 80,
      pan: -0.5,
      isMuted: false,
      isSolo: true,
      auxSend: true,
      sustainPedal: true,
      notes: [
        { id: 'n1', trackId: 'track-a', pitch: 60, startTick: 0, durationTicks: 480, velocity: 100, selected: true },
        { id: 'n2', trackId: 'track-a', pitch: 64, startTick: 480, durationTicks: 240, velocity: 70, sustain: false },
      ],
    },
    {
      id: 'track-b',
      name: 'Flauta',
      instrumentId: 'flute',
      color: '#64b5f6',
      volume: 70,
      pan: 0,
      isMuted: true,
      isSolo: false,
      auxSend: false,
      notes: [],
    },
  ],
  markers: [
    { id: 'm1', tick: 0, name: 'Intro' },
    { id: 'm2', tick: 7680, name: 'Refrão' },
  ],
  bdoProtection: { isProtected: true, author: 'Orig', composer: 'Comp', arranger: 'Arr', ownerId: 42 },
});

test('project round-trips through serialize/parse without losing session state', () => {
  const state = makeState();
  const parsed = parseProjectFile(serializeProject(state, new Date('2026-10-21T12:00:00Z')));

  assert.equal(parsed.savedAt, '2026-10-21T12:00:00.000Z');
  assert.equal(parsed.version, 1);
  const { format: _f, version: _v, savedAt: _s, app: _a, ...restored } = parsed;
  const expected = makeState();
  expected.tracks[0].notes[0] = { ...expected.tracks[0].notes[0] };
  delete expected.tracks[0].notes[0].selected;
  assert.deepEqual(restored, expected);
});

test('selection is view state: it is not saved and does not change the signature', () => {
  const a = makeState();
  const b = makeState();
  b.tracks[0].notes = b.tracks[0].notes.map((n) => ({ ...n, selected: !n.selected }));
  assert.equal(projectSignature(a), projectSignature(b));
  assert.ok(!serializeProject(a).includes('"selected"'));

  b.tracks[0].notes[0] = { ...b.tracks[0].notes[0], pitch: 61 };
  assert.notEqual(projectSignature(a), projectSignature(b));
});

test('parseProjectFile repairs invalid fields and drops broken notes', () => {
  const text = JSON.stringify({
    format: 'marni-project',
    version: 1,
    bpm: 'abc',
    timeSignature: '7/8',
    activeTrackId: 'missing',
    tracks: [
      {
        id: 'dup',
        instrumentId: 'kazoo',
        volume: 500,
        notes: [{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 300 }, { pitch: 'x' }],
      },
      { id: 'dup', instrumentId: 'harp', notes: [] },
    ],
  });
  const p = parseProjectFile(text);
  assert.equal(p.bpm, 120);
  assert.equal(p.timeSignature, '4/4');
  assert.equal(p.tracks[0].instrumentId, 'grand-piano');
  assert.equal(p.tracks[0].volume, 100);
  assert.equal(p.tracks[0].notes.length, 1);
  assert.equal(p.tracks[0].notes[0].velocity, 127);
  assert.notEqual(p.tracks[0].id, p.tracks[1].id, 'Duplicate track ids are made unique');
  assert.equal(p.activeTrackId, p.tracks[0].id);
});

test('parseProjectFile rejects other formats, empty projects and newer versions', () => {
  assert.throws(() => parseProjectFile('not json'), ProjectFormatError);
  assert.throws(() => parseProjectFile('{"tracks":[{}]}'), ProjectFormatError);
  assert.throws(() => parseProjectFile('{"format":"marni-project","version":1,"tracks":[]}'), ProjectFormatError);
  assert.throws(() => parseProjectFile('{"format":"marni-project","version":99,"tracks":[{}]}'), /versão mais nova/);
});

test('isProjectFileContent and projectFileName', () => {
  assert.ok(isProjectFileContent(serializeProject(makeState())));
  assert.ok(!isProjectFileContent('{"tracks":[]}'));
  assert.equal(projectFileName('Minha Música: Ação!'), 'minha_musica_acao.marni');
  assert.equal(projectFileName('   '), 'projeto_marni.marni');
});

test('a parsed project file has the same signature as the state it was saved from', () => {
  const state = makeState();
  const parsed = parseProjectFile(serializeProject(state));
  assert.equal(projectSignature(parsed), projectSignature(state));
});
