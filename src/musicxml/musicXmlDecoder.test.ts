import { test } from 'node:test';
import assert from 'node:assert';
import { isMusicXmlContent, parseMusicXml } from './musicXmlDecoder.ts';

test('isMusicXmlContent correctly identifies MusicXML strings', () => {
  assert.strictEqual(isMusicXmlContent('<?xml version="1.0"?><score-partwise></score-partwise>'), true);
  assert.strictEqual(isMusicXmlContent('<score-timewise></score-timewise>'), true);
  assert.strictEqual(isMusicXmlContent('<?xml version="1.0"?><part-list></part-list>'), true);
  assert.strictEqual(isMusicXmlContent('{"tracks":[]}'), false);
  assert.strictEqual(isMusicXmlContent('<MarniScore></MarniScore>'), false);
});

test('parseMusicXml parses standard score-partwise with notes and chords', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Pegasus Fantasy</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>Grand Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
      </attributes>
      <direction>
        <sound tempo="164"/>
      </direction>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
      <note>
        <chord/>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = parseMusicXml(sampleXml);
  assert.strictEqual(result.title, 'Pegasus Fantasy');
  assert.strictEqual(result.bpm, 164);
  assert.strictEqual(result.timeSignature, '4/4');
  assert.strictEqual(result.tracks.length, 1);

  const notes = result.tracks[0].notes;
  assert.strictEqual(notes.length, 3);

  // First note: C4 (pitch 60), startTick 0, durationTicks 480
  assert.strictEqual(notes[0].pitch, 60);
  assert.strictEqual(notes[0].startTick, 0);
  assert.strictEqual(notes[0].durationTicks, 480);

  // Second note: E4 (pitch 64), startTick 480
  assert.strictEqual(notes[1].pitch, 64);
  assert.strictEqual(notes[1].startTick, 480);

  // Third note: G4 (chord on E4), same startTick 480!
  assert.strictEqual(notes[2].pitch, 67);
  assert.strictEqual(notes[2].startTick, 480);
});

test('parseMusicXml separates Grand Staff into Right and Left hand tracks', () => {
  const grandStaffXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <staves>2</staves>
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
      <!-- Staff 1 (Right Hand) -->
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <staff>1</staff>
      </note>
      <!-- Staff 2 (Left Hand) -->
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>2</duration>
        <staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = parseMusicXml(grandStaffXml);
  assert.strictEqual(result.tracks.length, 2);
  assert.strictEqual(result.tracks[0].name.includes('Mão Direita'), true);
  assert.strictEqual(result.tracks[1].name.includes('Mão Esquerda'), true);

  assert.strictEqual(result.tracks[0].notes.length, 1);
  assert.strictEqual(result.tracks[0].notes[0].pitch, 72); // C5

  assert.strictEqual(result.tracks[1].notes.length, 1);
  assert.strictEqual(result.tracks[1].notes[0].pitch, 48); // C3
});
