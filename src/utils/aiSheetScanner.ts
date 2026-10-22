import type { Note, TimeSignature } from '../types/music.ts';
import { newId } from './ids.ts';
import {
  buildScore,
  findInvalidMeasures,
  measureIsValid,
  mergeRepairedMeasures,
  timeSignatureAt,
  type ScoreBuildResult,
  type ScoreJson,
  type ScoreMeasure,
} from './scoreTranscription.ts';

export type SheetTranscriptionCompactNote = [number, number, number, number?, (string | number)?];

export interface SheetTranscriptionNoteObject {
  pitch?: number;
  noteName?: string;
  startTick?: number;
  durationTicks?: number;
  measure?: number;
  beat?: number;
  velocity?: number;
  hand?: 'right' | 'left';
}

export type SheetTranscriptionNote = SheetTranscriptionNoteObject | SheetTranscriptionCompactNote;

export interface SheetTranscriptionJson {
  title?: string;
  bpm?: number;
  timeSignature?: string;
  keySignature?: string;
  chords?: Array<{ measure: number; chord: string }>;
  notes: SheetTranscriptionNote[];
}

export interface ParsedScoreResult {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  keySignature: string;
  notes: Note[];
  rightHandNotes: Note[];
  leftHandNotes: Note[];
  chords: Array<{ measure: number; chord: string }>;
  stats: {
    totalNotes: number;
    rightHandCount: number;
    leftHandCount: number;
    measures: number;
    durationTicks: number;
    highestPitch: number;
    lowestPitch: number;
  };
  /** Things the user should check (e.g. measures whose rhythm did not add up). */
  warnings?: string[];
  measuresToReview?: number[];
}

export interface ScanOptions {
  model?: string;
  targetTrackId?: string;
  pageRange?: string;
  startTickOffset?: number;
  onProgress?: (stage: string) => void;
}

const STORAGE_KEY = 'mwc_gemini_api_key';

/**
 * Discovers available Gemini models for generateContent on the provided API key.
 */
export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const fallbackList = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-flash'];
  if (!apiKey || !apiKey.trim()) return fallbackList;

  try {
    // Key in a header, not the URL: URLs end up in history, proxies and logs
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey.trim() },
    });
    if (!res.ok) return fallbackList;
    const data = await res.json();
    if (Array.isArray(data.models)) {
      const flashModels: string[] = [];
      const otherModels: string[] = [];

      data.models.forEach((m: { name: string; supportedGenerationMethods?: string[] }) => {
        if (m.supportedGenerationMethods?.includes('generateContent')) {
          const cleanName = m.name.replace(/^models\//, '');
          if (cleanName.includes('flash')) {
            flashModels.push(cleanName);
          } else {
            otherModels.push(cleanName);
          }
        }
      });

      // Sort models: 3.8 at top, then other 3.x, then 2.5
      flashModels.sort((a, b) => {
        if (a.includes('3.8') && !b.includes('3.8')) return -1;
        if (!a.includes('3.8') && b.includes('3.8')) return 1;
        return a.localeCompare(b);
      });

      const list = [...flashModels, ...otherModels];
      return list.length > 0 ? list : fallbackList;
    }
    return fallbackList;
  } catch {
    return fallbackList;
  }
}

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearGeminiApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Converts a note name with accidental and octave (e.g., 'C4', 'Eb4', 'F#5', 'G3') to MIDI pitch (12-119, C0-B8).
 */
export function noteNameToPitch(name: string): number {
  if (!name || typeof name !== 'string') return 60;
  const match = name.trim().match(/^([A-Ga-g])([#b♯♭]?)(\d+)$/);
  if (!match) return 60;

  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = parseInt(match[3], 10);

  const basePitches: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let semitone = basePitches[letter] ?? 0;
  if (accidental === '#' || accidental === '♯') semitone += 1;
  else if (accidental === 'b' || accidental === '♭') semitone -= 1;

  const midiPitch = (octave + 1) * 12 + semitone;
  return Math.max(12, Math.min(119, midiPitch));
}

/**
 * Converts a File object to base64 string and mimeType, resizing if dimensions are excessively large.
 */
export async function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  // If it's a PDF, read directly
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve({ mimeType: 'application/pdf', data: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // For images, optimize size using an off-screen canvas if in browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 2048;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const rawBase64 = (e.target?.result as string).split(',')[1] || '';
            resolve({ mimeType: file.type || 'image/png', data: rawBase64 });
            return;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const base64 = dataUrl.split(',')[1] || '';
          resolve({ mimeType: 'image/jpeg', data: base64 });
        };
        img.onerror = () => {
          const rawBase64 = (e.target?.result as string).split(',')[1] || '';
          resolve({ mimeType: file.type || 'image/png', data: rawBase64 });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Fallback for non-browser or general files
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve({ mimeType: file.type || 'image/png', data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const OMR_SYSTEM_PROMPT = `Você é um copista musical especialista em leitura óptica de partituras (OMR).
Sua tarefa é DESCREVER EXATAMENTE O QUE ESTÁ IMPRESSO na partitura, compasso por compasso.
NÃO calcule números MIDI, NÃO aplique a armadura de clave, NÃO conte tempos: o programa faz isso.

COMO LER:
1. Percorra todos os sistemas e todas as páginas, da esquerda para a direita. Numere os compassos em sequência a partir de 1 (uma anacruse/compasso incompleto inicial é o compasso 1). Não pule nenhum compasso.
2. Pautas: staff 1 = pauta superior (mão direita); staff 2 = pauta inferior (mão esquerda). Melodia em pauta única: só staff 1.
   Informe a clave de cada pauta em cada compasso ("treble" ou "bass") e preste atenção em trocas de clave (a pauta inferior às vezes passa para clave de sol).
3. Nome das notas: letra + oitava científica (Dó central = C4), lido pela posição na pauta COM a clave dela.
   Clave de sol: linhas E4 G4 B4 D5 F5, espaços F4 A4 C5 E5. Clave de fá: linhas G2 B2 D3 F3 A3, espaços A2 C3 E3 G3.
   Conte as linhas suplementares com cuidado. Sob "8va" a oitava soa uma acima; sob "8vb", uma abaixo: informe a oitava que SOA.
4. Acidentes: escreva #, b, n (bequadro), ## ou bb SOMENTE quando o símbolo estiver desenhado imediatamente antes daquela cabeça de nota.
   Nunca aplique a armadura. Informe a armadura em keyFifths (+n sustenidos, -n bemóis, 0 nenhum).
5. Ritmo de cada evento: d = "w" (semibreve), "h" (mínima), "q" (semínima), "8", "16", "32" (colcheia, semicolcheia, fusa) pela cabeça, haste, colchetes e barras.
   dots = número de pontos de aumento. Quiálteras (número 3, 5, 6 sobre o grupo): tuplet [3,2] (ou [5,4], [6,4]).
   Pausas são eventos com rest:true e sua figura. Compasso inteiro de pausa: rest com a figura que preenche o compasso.
6. Acordes: notas na mesma haste formam UM evento com várias notas.
7. Vozes: se uma pauta tem duas linhas independentes (hastes para cima e para baixo com ritmos diferentes), separe em vozes. Cada voz deve preencher o compasso inteiro (inclua pausas).
8. Ligadura de prolongamento (curva unindo duas notas de MESMA altura): tie:true na primeira nota. Ligaduras de expressão (frases) NÃO são tie.
9. Apojaturas/notas de enfeite pequenas: grace:true.
10. Estrutura: repeatStart / repeatEnd (barras de repetição), repeatTimes se indicado (ex.: "3x"), ending [1] ou [2] para casas de 1ª/2ª vez, segno, coda (início da coda), toCoda, fine, jump ("dc", "dc-al-fine", "dc-al-coda", "ds", "ds-al-fine", "ds-al-coda") no compasso onde está escrito.
11. Dinâmica (pp, p, mp, mf, f, ff) no compasso onde aparece. Andamento: bpm se houver indicação metronômica, e tempoText com o texto (ex.: "Allegro").
12. Confira antes de responder: em cada voz, a soma das figuras deve fechar a fórmula de compasso.`;

const SCORE_EVENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
    rest: { type: 'BOOLEAN' },
    d: { type: 'STRING', enum: ['w', 'h', 'q', '8', '16', '32', '64'] },
    dots: { type: 'INTEGER' },
    tuplet: { type: 'ARRAY', items: { type: 'INTEGER' } },
    tie: { type: 'BOOLEAN' },
    grace: { type: 'BOOLEAN' },
  },
  required: ['d'],
};

const SCORE_MEASURE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    number: { type: 'INTEGER' },
    timeSignature: { type: 'STRING' },
    keyFifths: { type: 'INTEGER' },
    repeatStart: { type: 'BOOLEAN' },
    repeatEnd: { type: 'BOOLEAN' },
    repeatTimes: { type: 'INTEGER' },
    ending: { type: 'ARRAY', items: { type: 'INTEGER' } },
    dynamic: { type: 'STRING' },
    segno: { type: 'BOOLEAN' },
    coda: { type: 'BOOLEAN' },
    toCoda: { type: 'BOOLEAN' },
    fine: { type: 'BOOLEAN' },
    jump: { type: 'STRING', enum: ['dc', 'dc-al-fine', 'dc-al-coda', 'ds', 'ds-al-fine', 'ds-al-coda'] },
    staves: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          staff: { type: 'INTEGER' },
          clef: { type: 'STRING', enum: ['treble', 'bass', 'alto', 'tenor'] },
          voices: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { events: { type: 'ARRAY', items: SCORE_EVENT_SCHEMA } }, required: ['events'] },
          },
        },
        required: ['staff', 'voices'],
      },
    },
  },
  required: ['number', 'staves'],
};

const SCORE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    bpm: { type: 'NUMBER' },
    tempoText: { type: 'STRING' },
    timeSignature: { type: 'STRING' },
    keyFifths: { type: 'INTEGER' },
    measures: { type: 'ARRAY', items: SCORE_MEASURE_SCHEMA },
  },
  required: ['timeSignature', 'keyFifths', 'measures'],
};

const REPAIR_SCHEMA = {
  type: 'OBJECT',
  properties: { measures: { type: 'ARRAY', items: SCORE_MEASURE_SCHEMA } },
  required: ['measures'],
};

/** At most this many measures are sent back for a second reading. */
const MAX_REPAIR_MEASURES = 40;

interface GeminiRequest {
  apiKey: string;
  models: string[];
  parts: Array<Record<string, unknown>>;
  schema: Record<string, unknown>;
}

/**
 * Calls Gemini with structured JSON output. Falls through to the next model on 404 and retries once
 * without the schema if the model rejects it (older models / API changes).
 */
async function callGemini(req: GeminiRequest): Promise<string> {
  let lastError: Error | null = null;
  for (const model of req.models) {
    for (const useSchema of [true, false]) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const body = {
        contents: [{ parts: req.parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(useSchema ? { responseSchema: req.schema } : {}),
          temperature: 0,
          maxOutputTokens: 65536,
        },
      };

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey.trim() },
          body: JSON.stringify(body),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Falha de conexão com a API do Gemini: ${message}. Verifique sua internet.`);
      }

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0];
        const text: string | undefined = candidate?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? '')
          .join('');
        if (candidate?.finishReason === 'MAX_TOKENS') {
          throw new Error('A partitura é longa demais para uma leitura só. Envie menos páginas por vez (ex.: "1-2", depois "3-4").');
        }
        if (text) return text;
        lastError = new Error('A IA não retornou dados legíveis para a imagem enviada. Verifique se a partitura está nítida.');
        break;
      }

      let detail = '';
      try {
        const errJson = await response.json();
        detail = errJson.error?.message || response.statusText;
      } catch {
        detail = response.statusText;
      }
      if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(detail) || response.status === 401 || response.status === 403) {
        throw new Error('Chave de API do Gemini inválida ou não autorizada. Verifique no Google AI Studio.');
      }
      if (response.status === 429 || detail.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('Limite de requisições do Gemini atingido. Aguarde um minuto e tente novamente.');
      }
      lastError = new Error(`Erro na API Gemini (${response.status}): ${detail}`);
      if (response.status === 404) break; // model unavailable: next model
      if (response.status === 400 && useSchema) continue; // schema rejected: retry without it
      throw lastError;
    }
  }
  throw lastError ?? new Error('Nenhum modelo do Gemini respondeu.');
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch {
    throw new Error('Erro ao interpretar a resposta estruturada da IA. Tente novamente com outra foto ou formato.');
  }
}

function toParsedResult(built: ScoreBuildResult): ParsedScoreResult {
  return {
    title: built.title,
    bpm: built.bpm,
    timeSignature: built.timeSignature,
    keySignature: built.keySignature,
    notes: built.notes,
    rightHandNotes: built.rightHandNotes,
    leftHandNotes: built.leftHandNotes,
    chords: [],
    stats: built.stats,
    warnings: built.warnings,
    measuresToReview: built.measuresToReview,
  };
}

/**
 * Transcribes a sheet music image or PDF using Google Gemini Vision API.
 * 1. The model describes what is printed (measures, notes as written, note values, repeats).
 * 2. Measures whose voices do not add up are sent back for a second, focused reading.
 * 3. Pitches, accidentals, timing and repeats are resolved deterministically (scoreTranscription.ts).
 */
export async function transcribeSheetImageWithGemini(
  file: File,
  apiKey: string,
  options?: ScanOptions
): Promise<ParsedScoreResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Chave de API do Gemini não configurada. Insira sua chave gratuita do Google AI Studio.');
  }

  const requestedModel = options?.model || 'gemini-3.8-flash';
  const targetTrackId = options?.targetTrackId || newId('track');
  const startTickOffset = options?.startTickOffset || 0;
  const report = options?.onProgress ?? (() => {});
  const models = [requestedModel, 'gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-flash'].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );

  const { mimeType, data: base64Data } = await fileToBase64(file);
  const image = { inlineData: { mimeType, data: base64Data } };

  let prompt = OMR_SYSTEM_PROMPT;
  if (options?.pageRange && options.pageRange !== 'all') {
    prompt += `\n\nTranscreva SOMENTE as páginas ${options.pageRange}, numerando os compassos a partir de 1.`;
  }

  report('Lendo a partitura compasso por compasso...');
  const raw = parseJsonText(await callGemini({ apiKey, models, parts: [image, { text: prompt }], schema: SCORE_SCHEMA }));

  // Older/unexpected answers in the previous note-list format are still accepted
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as ScoreJson).measures)) {
    return parseAiTranscription(raw, targetTrackId, { startTickOffset });
  }

  let score = raw as ScoreJson;
  const invalid = findInvalidMeasures(score);
  if (invalid.length > 0 && invalid.length <= MAX_REPAIR_MEASURES) {
    report(`Relendo ${invalid.length} compasso(s) com ritmo inconsistente...`);
    const previous = score.measures.filter((m) => invalid.includes(m.number));
    const repairPrompt = `${OMR_SYSTEM_PROMPT}

REVISÃO: na leitura anterior, as durações dos compassos ${invalid.join(', ')} não fecham com a fórmula de compasso ${score.timeSignature ?? ''}.
Leitura anterior desses compassos (JSON):
${JSON.stringify(previous)}

Olhe de novo SOMENTE esses compassos na imagem (mesma numeração) e devolva {"measures": [...]} apenas com eles, corrigidos.
Verifique figuras, pontos, quiálteras, pausas e a separação em vozes.`;
    try {
      const repaired = parseJsonText(
        await callGemini({ apiKey, models, parts: [image, { text: repairPrompt }], schema: REPAIR_SCHEMA })
      ) as { measures?: ScoreMeasure[] };
      if (Array.isArray(repaired.measures)) {
        // Keep a re-read measure only if it is actually valid now
        const tsAt = timeSignatureAt(score);
        const lastNumber = score.measures[score.measures.length - 1]?.number;
        const firstNumber = score.measures[0]?.number;
        const better = repaired.measures.filter(
          (m) =>
            invalid.includes(m.number) &&
            Array.isArray(m.staves) &&
            measureIsValid(m, tsAt.get(m.number) ?? '4/4', m.number === firstNumber || m.number === lastNumber)
        );
        score = mergeRepairedMeasures(score, better);
      }
    } catch (err) {
      console.warn('Revisão dos compassos falhou, mantendo a primeira leitura:', err);
    }
  }

  report('Aplicando armadura, acidentes, ligaduras e repetições...');
  return toParsedResult(buildScore(score, targetTrackId, { startTickOffset }));
}

/**
 * Validates and converts raw AI JSON into Marni Web Composer Note[] structure,
 * supporting both compact tuples and traditional objects, and separating hands.
 */
export function parseAiTranscription(
  raw: unknown,
  targetTrackId: string,
  options?: { startTickOffset?: number }
): ParsedScoreResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Formato de resposta da IA inválido.');
  }

  const offset = options?.startTickOffset || 0;
  const data = raw as SheetTranscriptionJson;
  const rawNotes = Array.isArray(data.notes) ? data.notes : [];

  if (rawNotes.length === 0) {
    throw new Error('Nenhuma nota musical foi detectada na imagem fornecida. Certifique-se de que a partitura está visível e legível.');
  }

  const title = (data.title && typeof data.title === 'string' ? data.title.trim() : 'Partitura Importada') || 'Partitura Importada';
  const bpm = typeof data.bpm === 'number' && data.bpm >= 40 && data.bpm <= 260 ? Math.round(data.bpm) : 120;

  let timeSignature: TimeSignature = '4/4';
  if (data.timeSignature && typeof data.timeSignature === 'string') {
    const sig = data.timeSignature.trim();
    if (['4/4', '3/4', '6/8', '2/4', '12/8'].includes(sig)) {
      timeSignature = sig as TimeSignature;
    }
  }

  const keySignature = data.keySignature || 'Natural';
  const chords = Array.isArray(data.chords) ? data.chords : [];

  const beatsPerMeasure = timeSignature === '3/4' ? 3 : timeSignature === '2/4' ? 2 : timeSignature === '6/8' ? 6 : timeSignature === '12/8' ? 12 : 4;
  const ticksPerBeat = timeSignature === '6/8' || timeSignature === '12/8' ? 240 : 480;
  const ticksPerMeasure = beatsPerMeasure * ticksPerBeat;

  const rawParsedNotes: Array<{
    pitch: number;
    rawStartTick: number;
    durationTicks: number;
    velocity: number;
    hand: 'right' | 'left';
  }> = [];

  rawNotes.forEach((n) => {
    let pitch = 60;
    let rawStartTick = 0;
    let durationTicks = 480;
    let velocity = 95;
    let hand: 'right' | 'left' = 'right';

    if (Array.isArray(n)) {
      pitch = typeof n[0] === 'number' ? Math.max(12, Math.min(119, Math.round(n[0]))) : 60;

      // Distinguish between Format B: [pitch, measure, beat, durationBeats, hand]
      // and Format A: [pitch, startTick, durationTicks, velocity?, hand?]
      // In Format B, n[2] is beat (<= 16) and n[3] is duration in beats (<= 16)
      const isMeasureFormat = typeof n[2] === 'number' && n[2] <= 16;
      if (isMeasureFormat) {
        const measure = typeof n[1] === 'number' && n[1] >= 1 ? Math.round(n[1]) : 1;
        const beat = typeof n[2] === 'number' && n[2] >= 1 ? n[2] : 1;
        const durationBeats = typeof n[3] === 'number' && n[3] > 0 ? n[3] : 1;

        rawStartTick = (measure - 1) * ticksPerMeasure + Math.round((beat - 1) * ticksPerBeat);
        durationTicks = Math.max(60, Math.round(durationBeats * ticksPerBeat));
        velocity = 95;
        hand = n[4] === 'left' || n[4] === 1 ? 'left' : n[4] === 'right' || n[4] === 0 ? 'right' : (pitch < 57 ? 'left' : 'right');
      } else {
        rawStartTick = typeof n[1] === 'number' && n[1] >= 0 ? Math.round(n[1]) : 0;
        durationTicks = typeof n[2] === 'number' && n[2] > 0 ? Math.max(60, Math.min(19200, Math.round(n[2]))) : 480;
        velocity = typeof n[3] === 'number' ? Math.max(1, Math.min(127, Math.round(n[3]))) : 95;
        hand = n[4] === 'left' || n[4] === 1 ? 'left' : n[4] === 'right' || n[4] === 0 ? 'right' : (pitch < 57 ? 'left' : 'right');
      }
    } else if (n && typeof n === 'object') {
      const obj = n as SheetTranscriptionNoteObject;
      if (typeof obj.pitch === 'number' && obj.pitch >= 12 && obj.pitch <= 119) {
        pitch = Math.round(obj.pitch);
      } else if (obj.noteName && typeof obj.noteName === 'string') {
        pitch = noteNameToPitch(obj.noteName);
      }

      if (typeof obj.startTick === 'number' && obj.startTick >= 0) {
        rawStartTick = Math.round(obj.startTick);
      } else if (typeof obj.measure === 'number' && obj.measure >= 1) {
        const beatOffset = typeof obj.beat === 'number' && obj.beat >= 1 ? (obj.beat - 1) * ticksPerBeat : 0;
        rawStartTick = (obj.measure - 1) * ticksPerMeasure + Math.round(beatOffset);
      } else {
        rawStartTick = 0;
      }

      if (typeof obj.durationTicks === 'number' && obj.durationTicks > 0) {
        durationTicks = Math.max(60, Math.min(19200, Math.round(obj.durationTicks)));
      }

      if (typeof obj.velocity === 'number') {
        velocity = Math.max(1, Math.min(127, Math.round(obj.velocity)));
      }

      hand = obj.hand === 'left' ? 'left' : obj.hand === 'right' ? 'right' : (pitch < 57 ? 'left' : 'right');
    }

    rawParsedNotes.push({ pitch, rawStartTick, durationTicks, velocity, hand });
  });

  if (rawParsedNotes.length === 0) {
    throw new Error('Nenhuma nota musical foi detectada no documento.');
  }

  // Sort notes chronologically by rawStartTick
  rawParsedNotes.sort((a, b) => a.rawStartTick - b.rawStartTick || a.pitch - b.pitch);

  // 1. Compact interior excessive gaps of dead silence (> 2 measures) down to 1 measure
  // This eliminates the bug where the AI hallucinates a jump between sections or pages
  const maxSilenceGap = ticksPerMeasure * 2;
  let accumulatedGapReduction = 0;
  let prevEndTick = rawParsedNotes[0].rawStartTick + rawParsedNotes[0].durationTicks;

  for (let i = 1; i < rawParsedNotes.length; i++) {
    const n = rawParsedNotes[i];
    const currentStart = n.rawStartTick - accumulatedGapReduction;
    const silence = currentStart - prevEndTick;

    if (silence > maxSilenceGap) {
      const gapToTrim = silence - ticksPerMeasure;
      accumulatedGapReduction += gapToTrim;
    }

    n.rawStartTick -= accumulatedGapReduction;
    const currentEnd = n.rawStartTick + n.durationTicks;
    if (currentEnd > prevEndTick) {
      prevEndTick = currentEnd;
    }
  }

  // 2. Align startTickOffset for append mode:
  // If offset > 0 (appending to existing track), align incoming notes so they seamlessly start
  // immediately after the existing notes, without any double-offset or empty gap!
  if (offset > 0) {
    const minIncomingStart = Math.min(...rawParsedNotes.map((n) => n.rawStartTick));
    const shiftToTarget = offset - minIncomingStart;
    rawParsedNotes.forEach((n) => {
      n.rawStartTick += shiftToTarget;
    });
  }

  // 3. Construct final Note objects and distribute to hands
  const validNotes: Note[] = [];
  const rightHandNotes: Note[] = [];
  const leftHandNotes: Note[] = [];

  let highestPitch = 0;
  let lowestPitch = 127;
  let maxEndTick = offset;

  rawParsedNotes.forEach((item) => {
    if (item.pitch < lowestPitch) lowestPitch = item.pitch;
    if (item.pitch > highestPitch) highestPitch = item.pitch;

    const endTick = item.rawStartTick + item.durationTicks;
    if (endTick > maxEndTick) maxEndTick = endTick;

    const noteObj: Note = {
      id: newId('note'),
      trackId: targetTrackId,
      pitch: item.pitch,
      startTick: item.rawStartTick,
      durationTicks: item.durationTicks,
      velocity: item.velocity,
      selected: false,
    };

    validNotes.push(noteObj);
    if (item.hand === 'left') {
      leftHandNotes.push({ ...noteObj });
    } else {
      rightHandNotes.push({ ...noteObj });
    }
  });

  const totalMeasures = Math.max(1, Math.ceil(maxEndTick / ticksPerMeasure));

  return {
    title,
    bpm,
    timeSignature,
    keySignature,
    notes: validNotes,
    rightHandNotes,
    leftHandNotes,
    chords,
    stats: {
      totalNotes: validNotes.length,
      rightHandCount: rightHandNotes.length,
      leftHandCount: leftHandNotes.length,
      measures: totalMeasures,
      durationTicks: maxEndTick,
      highestPitch: highestPitch === 0 ? 60 : highestPitch,
      lowestPitch: lowestPitch === 127 ? 60 : lowestPitch,
    },
  };
}
