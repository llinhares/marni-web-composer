import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImportFormat, parseLegacyJson } from './fileImport.ts';

const enc = (s: string) => new TextEncoder().encode(s);

test('detectImportFormat recognises formats by content before extension', () => {
  const smf = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]);
  assert.equal(detectImportFormat(smf, 'song.bin', null), 'midi');
  assert.equal(detectImportFormat(new Uint8Array([1, 2, 3]), 'song.mid', null), 'midi');
  assert.equal(detectImportFormat(new Uint8Array([1, 2, 3]), 'score.bms', null), 'bdo');

  const project = '{"format":"marni-project","version":1,"tracks":[]}';
  assert.equal(detectImportFormat(enc(project), 'x.json', project), 'project');
  const mxl = '<?xml version="1.0"?><score-partwise version="3.1"></score-partwise>';
  assert.equal(detectImportFormat(enc(mxl), 'x.xml', mxl), 'musicxml');
  const bdoXml = '<?xml version="1.0"?><MarniScore><Tracks></Tracks></MarniScore>';
  assert.equal(detectImportFormat(enc(bdoXml), 'x.xml', bdoXml), 'bdo-xml');
  assert.equal(detectImportFormat(enc('{"tracks":[]}'), 'x.json', '{"tracks":[]}'), 'json');
  assert.equal(detectImportFormat(enc('hello'), 'notes.txt', 'hello'), 'unknown');
});

test('parseLegacyJson validates tracks and keeps only what the file defines', () => {
  const parsed = parseLegacyJson(
    JSON.stringify({ tracks: [{ id: 't', instrumentId: 'harp', notes: [{ pitch: 60, startTick: 0, durationTicks: 480 }, { pitch: 'bad' }] }], bpm: 90 })
  )!;
  assert.equal(parsed.importedTracks.length, 1);
  assert.equal(parsed.importedTracks[0].notes.length, 1, 'Broken notes are dropped');
  assert.equal(parsed.bpm, 90);
  assert.equal(parsed.title, undefined);
  assert.equal(parseLegacyJson('{"tracks":[]}'), null);
  assert.equal(parseLegacyJson('not json'), null);
});
