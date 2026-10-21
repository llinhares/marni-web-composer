/**
 * MusicXML Decoder for Marni Web Composer
 * Supports standard MusicXML 1.0 - 4.0 (.musicxml and .xml) files,
 * including multi-part scores, Grand Staff (two-hand piano split),
 * key signatures, tempo directions, chords, backups, and divisions.
 * 
 * Works in both browser (DOMParser) and headless/Node environments with built-in zero-dependency XML parser.
 */

import type { Track, Note, InstrumentId, TimeSignature } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';

export interface DecodedMusicXml {
  tracks: Track[];
  bpm?: number;
  title?: string;
  timeSignature?: TimeSignature;
}

export interface XmlNodeLike {
  tagName: string;
  attributes: Record<string, string>;
  children: XmlNodeLike[];
  textContent: string;
  getAttribute(name: string): string | null;
  querySelector(selector: string): XmlNodeLike | null;
  querySelectorAll(selector: string): XmlNodeLike[];
}

const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function stepToPitch(step: string, octave: number, alter: number = 0): number {
  const cleanStep = step.toUpperCase().trim();
  const base = STEP_SEMITONES[cleanStep] ?? 0;
  const pitch = (octave + 1) * 12 + base + alter;
  return Math.max(12, Math.min(119, Math.round(pitch)));
}

import { detectBdoInstrument } from '../utils/instrumentDetection.ts';

function detectInstrument(name: string): InstrumentId {
  return detectBdoInstrument({ name });
}

/**
 * Checks if raw text is standard MusicXML (score-partwise or score-timewise).
 */
export function isMusicXmlContent(text: string): boolean {
  return (
    text.includes('<score-partwise') ||
    text.includes('<score-timewise') ||
    (text.includes('<?xml') && text.includes('<part-list>'))
  );
}

// Lightweight XML DOM tree parser for universal execution without external packages
function matchSelector(node: XmlNodeLike, sel: string): boolean {
  const s = sel.trim().toLowerCase();
  const attrMatch = s.match(/^([a-z0-9_-]+)\[([a-z0-9_-]+)\]$/i);
  if (attrMatch) {
    return node.tagName.toLowerCase() === attrMatch[1].toLowerCase() && node.attributes[attrMatch[2].toLowerCase()] !== undefined;
  }
  return node.tagName.toLowerCase() === s;
}

function queryNode(node: XmlNodeLike, selector: string): XmlNodeLike | null {
  const all = queryNodes(node, selector);
  return all.length > 0 ? all[0] : null;
}

function queryNodes(node: XmlNodeLike, selector: string): XmlNodeLike[] {
  const parts = selector.split('>').map((s) => s.trim());
  if (parts.length === 1) {
    const results: XmlNodeLike[] = [];
    const walk = (curr: XmlNodeLike) => {
      for (const c of curr.children) {
        if (matchSelector(c, parts[0])) {
          results.push(c);
        }
        walk(c);
      }
    };
    walk(node);
    return results;
  }

  // Hierarchical traversal: find first part in all descendants, then direct children for '>'
  let currentParents = queryNodes(node, parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const nextMatches: XmlNodeLike[] = [];
    for (const parent of currentParents) {
      for (const child of parent.children) {
        if (matchSelector(child, part)) {
          nextMatches.push(child);
        }
      }
    }
    currentParents = nextMatches;
  }
  return currentParents;
}

function parseXmlToTree(xml: string): XmlNodeLike {
  const cleanXml = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();

  const root: XmlNodeLike = {
    tagName: '__root__',
    attributes: {},
    children: [],
    textContent: '',
    getAttribute: (name: string) => root.attributes[name.toLowerCase()] ?? null,
    querySelector: (sel: string) => queryNode(root, sel),
    querySelectorAll: (sel: string) => queryNodes(root, sel),
  };

  const stack: XmlNodeLike[] = [root];
  const tagRegex = /<(\/)?([a-zA-Z0-9_-]+)([^>]*?)(\/)?>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleanXml)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    const rawAttrs = match[3];
    const isSelfClosing = match[4] === '/';
    const textContent = match[5];

    if (textContent) {
      const trimmed = textContent.trim();
      if (trimmed && stack.length > 0) {
        const parent = stack[stack.length - 1];
        parent.textContent = parent.textContent ? `${parent.textContent} ${trimmed}` : trimmed;
      }
      continue;
    }

    if (isClosing) {
      if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tagName.toLowerCase()) {
        stack.pop();
      }
      continue;
    }

    if (tagName) {
      const attributes: Record<string, string> = {};
      if (rawAttrs) {
        const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let aMatch: RegExpExecArray | null;
        while ((aMatch = attrRegex.exec(rawAttrs)) !== null) {
          attributes[aMatch[1].toLowerCase()] = aMatch[2] ?? aMatch[3] ?? '';
        }
      }

      const newNode: XmlNodeLike = {
        tagName,
        attributes,
        children: [],
        textContent: '',
        getAttribute: (name: string) => newNode.attributes[name.toLowerCase()] ?? null,
        querySelector: (sel: string) => queryNode(newNode, sel),
        querySelectorAll: (sel: string) => queryNodes(newNode, sel),
      };

      const parent = stack[stack.length - 1];
      parent.children.push(newNode);

      if (!isSelfClosing) {
        stack.push(newNode);
      }
    }
  }

  return root;
}

/**
 * Parses a MusicXML string into Marni Web Composer tracks and metadata.
 */
export function parseMusicXml(xmlContent: string): DecodedMusicXml {
  let doc: XmlNodeLike;

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const nativeDoc = parser.parseFromString(xmlContent, 'text/xml');
      if (nativeDoc.querySelector('parsererror')) {
        doc = parseXmlToTree(xmlContent);
      } else {
        // Wrap native Document into XmlNodeLike interface for unified parsing
        const wrapNative = (el: Element): XmlNodeLike => {
          const attributes: Record<string, string> = {};
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            attributes[attr.name.toLowerCase()] = attr.value;
          }
          const wrapped: XmlNodeLike = {
            tagName: el.tagName,
            attributes,
            children: Array.from(el.children).map(wrapNative),
            textContent: el.textContent?.trim() || '',
            getAttribute: (name: string) => el.getAttribute(name),
            querySelector: (sel: string) => {
              const res = el.querySelector(sel);
              return res ? wrapNative(res) : null;
            },
            querySelectorAll: (sel: string) => Array.from(el.querySelectorAll(sel)).map(wrapNative),
          };
          return wrapped;
        };

        const rootEl = nativeDoc.documentElement;
        doc = {
          tagName: '__root__',
          attributes: {},
          children: [wrapNative(rootEl)],
          textContent: '',
          getAttribute: () => null,
          querySelector: (sel: string) => {
            const res = nativeDoc.querySelector(sel);
            return res ? wrapNative(res) : null;
          },
          querySelectorAll: (sel: string) => Array.from(nativeDoc.querySelectorAll(sel)).map(wrapNative),
        };
      }
    } catch {
      doc = parseXmlToTree(xmlContent);
    }
  } else {
    doc = parseXmlToTree(xmlContent);
  }

  // 1. Metadata
  const workTitleEl = doc.querySelector('work-title') || doc.querySelector('work > work-title');
  const movementTitleEl = doc.querySelector('movement-title');
  const title = workTitleEl?.textContent?.trim() || movementTitleEl?.textContent?.trim() || 'Partitura MusicXML';

  // BPM Tempo
  let bpm: number | undefined;
  const soundEl = doc.querySelector('sound[tempo]');
  if (soundEl?.getAttribute('tempo')) {
    bpm = Math.round(Number(soundEl.getAttribute('tempo')));
  } else {
    const perMinuteEl = doc.querySelector('per-minute');
    if (perMinuteEl?.textContent) {
      bpm = Math.round(Number(perMinuteEl.textContent));
    }
  }

  // Time Signature
  let timeSignature: TimeSignature | undefined;
  const beatsEl = doc.querySelector('time > beats');
  const beatTypeEl = doc.querySelector('time > beat-type');
  if (beatsEl?.textContent && beatTypeEl?.textContent) {
    const candidate = `${beatsEl.textContent.trim()}/${beatTypeEl.textContent.trim()}`;
    if (['4/4', '3/4', '6/8', '2/4', '12/8'].includes(candidate)) {
      timeSignature = candidate as TimeSignature;
    }
  }

  // 2. Part List Mapping
  const partMap = new Map<string, { name: string; instrumentId: InstrumentId }>();
  const scoreParts = doc.querySelectorAll('part-list > score-part');
  scoreParts.forEach((sp) => {
    const id = sp.getAttribute('id') || '';
    const partNameEl = sp.querySelector('part-name');
    const name = partNameEl?.textContent?.trim() || 'Instrumento';
    partMap.set(id, {
      name,
      instrumentId: detectInstrument(name),
    });
  });

  // 3. Process Parts
  const parts = doc.querySelectorAll('part');
  const resultTracks: Track[] = [];

  parts.forEach((partEl, partIdx) => {
    const partId = partEl.getAttribute('id') || `P${partIdx + 1}`;
    const partMeta = partMap.get(partId) || { name: `Faixa ${partIdx + 1}`, instrumentId: 'grand-piano' };

    let divisions = 1; // MusicXML divisions per quarter note
    let ticksPerDivision = 480;

    // Check if part uses multiple staves (e.g. Piano Grand Staff 1 & 2)
    const stavesEl = partEl.querySelector('staves');
    const numStaves = stavesEl ? Number(stavesEl.textContent) || 1 : 1;
    const isGrandStaff = numStaves >= 2;

    const staff1Notes: Note[] = [];
    const staff2Notes: Note[] = [];

    const measures = partEl.querySelectorAll('measure');
    let measureStartTick = 0;

    measures.forEach((measureEl) => {
      // Check divisions in attributes
      const divisionsEl = measureEl.querySelector('attributes > divisions');
      if (divisionsEl?.textContent) {
        divisions = Math.max(1, Number(divisionsEl.textContent) || 1);
        ticksPerDivision = 480 / divisions;
      }

      // Check measure time signature or tempo updates
      const mSoundEl = measureEl.querySelector('sound[tempo]');
      if (mSoundEl?.getAttribute('tempo') && !bpm) {
        bpm = Math.round(Number(mSoundEl.getAttribute('tempo')));
      }

      let currentVoiceTick = measureStartTick;
      let lastNoteStartTick = measureStartTick;
      let maxMeasureTick = measureStartTick;

      const children = measureEl.children;

      for (const child of children) {
        const tagName = child.tagName.toLowerCase();

        if (tagName === 'attributes') {
          const divEl = child.querySelector('divisions');
          if (divEl?.textContent) {
            divisions = Math.max(1, Number(divEl.textContent) || 1);
            ticksPerDivision = 480 / divisions;
          }
        } else if (tagName === 'backup') {
          const durEl = child.querySelector('duration');
          const dur = Number(durEl?.textContent) || 0;
          currentVoiceTick = Math.max(measureStartTick, currentVoiceTick - Math.round(dur * ticksPerDivision));
        } else if (tagName === 'forward') {
          const durEl = child.querySelector('duration');
          const dur = Number(durEl?.textContent) || 0;
          currentVoiceTick += Math.round(dur * ticksPerDivision);
          if (currentVoiceTick > maxMeasureTick) maxMeasureTick = currentVoiceTick;
        } else if (tagName === 'note') {
          const isRest = child.querySelector('rest') !== null;
          const isChord = child.querySelector('chord') !== null;
          const durEl = child.querySelector('duration');
          const durVal = Number(durEl?.textContent) || divisions;
          const durTicks = Math.max(60, Math.round(durVal * ticksPerDivision));

          const staffNumber = Number(child.querySelector('staff')?.textContent) || 1;

          if (isRest) {
            if (!isChord) {
              currentVoiceTick += durTicks;
              if (currentVoiceTick > maxMeasureTick) maxMeasureTick = currentVoiceTick;
            }
            continue;
          }

          const pitchEl = child.querySelector('pitch');
          if (!pitchEl) {
            if (!isChord) {
              currentVoiceTick += durTicks;
              if (currentVoiceTick > maxMeasureTick) maxMeasureTick = currentVoiceTick;
            }
            continue;
          }

          const step = pitchEl.querySelector('step')?.textContent || 'C';
          const octave = Number(pitchEl.querySelector('octave')?.textContent) || 4;
          const alter = Number(pitchEl.querySelector('alter')?.textContent) || 0;
          const pitch = stepToPitch(step, octave, alter);

          const startTick = isChord ? lastNoteStartTick : currentVoiceTick;

          const noteObj: Note = {
            id: `xml-note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            trackId: '',
            pitch,
            startTick,
            durationTicks: durTicks,
            velocity: 95,
            selected: false,
          };

          if (isGrandStaff && staffNumber >= 2) {
            staff2Notes.push(noteObj);
          } else {
            staff1Notes.push(noteObj);
          }

          if (!isChord) {
            lastNoteStartTick = currentVoiceTick;
            currentVoiceTick += durTicks;
            if (currentVoiceTick > maxMeasureTick) maxMeasureTick = currentVoiceTick;
          }
        }
      }

      // Advance measure tick
      const beatsInBar = 4;
      const nominalMeasureTicks = beatsInBar * 480;
      const actualMeasureTicks = maxMeasureTick - measureStartTick;
      measureStartTick += Math.max(nominalMeasureTicks, actualMeasureTicks);
    });

    const instObj = BDO_INSTRUMENTS.find((i) => i.id === partMeta.instrumentId);

    if (isGrandStaff && staff2Notes.length > 0) {
      // 2 tracks for grand staff (Right and Left hand)
      const track1Id = `track-xml-${partIdx}-rh-${Date.now()}`;
      const track2Id = `track-xml-${partIdx}-lh-${Date.now() + 1}`;

      resultTracks.push({
        id: track1Id,
        name: `${partMeta.name} (Mão Direita)`,
        instrumentId: partMeta.instrumentId,
        color: instObj?.color || '#d4a373',
        volume: 75,
        pan: -0.15,
        isMuted: false,
        isSolo: false,
        auxSend: true,
        notes: staff1Notes.map((n) => ({ ...n, trackId: track1Id })),
      });

      resultTracks.push({
        id: track2Id,
        name: `${partMeta.name} (Mão Esquerda)`,
        instrumentId: partMeta.instrumentId,
        color: '#a373d4',
        volume: 75,
        pan: 0.15,
        isMuted: false,
        isSolo: false,
        auxSend: true,
        notes: staff2Notes.map((n) => ({ ...n, trackId: track2Id })),
      });
    } else {
      const allNotes = [...staff1Notes, ...staff2Notes];
      const trackId = `track-xml-${partIdx}-${Date.now()}`;
      resultTracks.push({
        id: trackId,
        name: partMeta.name,
        instrumentId: partMeta.instrumentId,
        color: instObj?.color || '#d4a373',
        volume: 75,
        pan: 0,
        isMuted: false,
        isSolo: false,
        auxSend: true,
        notes: allNotes.map((n) => ({ ...n, trackId })),
      });
    }
  });

  return {
    tracks: resultTracks,
    bpm,
    title,
    timeSignature,
  };
}
