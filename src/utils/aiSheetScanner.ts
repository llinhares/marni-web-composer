import type { Note, TimeSignature } from '../types/music.ts';

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
}

export interface ScanOptions {
  model?: string;
  targetTrackId?: string;
  pageRange?: string;
  startTickOffset?: number;
}

const STORAGE_KEY = 'mwc_gemini_api_key';

/**
 * Discovers available Gemini models for generateContent on the provided API key.
 */
export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const fallbackList = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-flash'];
  if (!apiKey || !apiKey.trim()) return fallbackList;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
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

const OMR_SYSTEM_PROMPT = `Você é um especialista em transcrição de partituras para piano (Optical Music Recognition - OMR).
Analise com máxima atenção a imagem ou PDF da partitura e transcreva as notas musicais para a grade do Piano Roll.

[DIRETRIZES CRÍTICAS DE TRANSCRIÇÃO]:
1. PENTAGRAMA DUPLO / GRAND STAFF (Mão Direita e Mão Esquerda):
   - Pauta Superior: Clave de Sol (Mão Direita / Treble Clef). Linhas: E4(64), G4(67), B4(71), D5(74), F5(77). Espaços: F4(65), A4(69), C5(72), E5(76). Dó Central = C4 (MIDI 60).
   - Pauta Inferior: Clave de Fá (Mão Esquerda / Bass Clef). Linhas: G2(43), B2(47), D3(50), F3(53), A3(57). Espaços: A2(45), C3(48), E3(52), G3(55). Dó Central = C4 (MIDI 60).
   - Transcreva AMBAS as mãos simultaneamente!

2. ARMADURA DE CLAVE (Key Signature) E ACIDENTES:
   - Identifique os acidentes (bemóis ou sustenidos) no início da pauta.
   - Aplique os acidentes a todas as notas correspondentes em toda a música, a menos que haja um bequadro.

3. CONTINUIDADE E COMPASSOS (NUNCA PULE COMPASSOS):
   - Transcreva todos os compassos em ordem sequencial (1, 2, 3, 4...).
   - NUNCA deixe saltos ou buracos de compassos vazios entre as seções.
   - Para acordes, liste todas as notas que soam juntas com o mesmo compasso e mesmo beat.

4. FORMATO DE NOTAS (ARRAY COM 5 ELEMENTOS):
   Cada nota no array "notes" DEVE ser uma lista compacta:
   [pitch, measure, beat, durationBeats, hand]

   - pitch: número MIDI da nota (12 a 119, C0 a B8).
   - measure: número do compasso na partitura (1, 2, 3, 4...).
   - beat: tempo dentro do compasso onde a nota inicia (1.0 = início do compasso, 1.5 = meio do primeiro tempo, 2.0 = segundo tempo, etc.).
   - durationBeats: duração em tempos (1.0 = semínima / quarter note, 0.5 = colcheia / eighth note, 0.25 = semicolcheia / sixteenth note, 2.0 = mínima / half note, 4.0 = semibreve / whole note, 1.5 = semínima pontuada).
   - hand: "right" para mão direita (Clave de Sol) ou "left" para mão esquerda (Clave de Fá).

Responda APENAS em JSON estrito:
{
  "title": "Nome da Música",
  "bpm": 140,
  "timeSignature": "4/4",
  "keySignature": "C minor (3 flats: Bb, Eb, Ab)",
  "chords": [
    { "measure": 1, "chord": "Cm" }
  ],
  "notes": [
    [72, 1, 1.0, 1.0, "right"],
    [48, 1, 1.0, 2.0, "left"],
    [75, 1, 2.0, 0.5, "right"],
    [74, 1, 2.5, 0.5, "right"]
  ]
}`;

/**
 * Transcribes a sheet music image or PDF using Google Gemini Vision API.
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
  const targetTrackId = options?.targetTrackId || `track-${Date.now()}`;
  const startTickOffset = options?.startTickOffset || 0;

  const { mimeType, data: base64Data } = await fileToBase64(file);

  // Model retry candidates if 404 (model not found / deprecated for new accounts)
  const candidateModels = [
    requestedModel,
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
    'gemini-2.5-flash',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let promptText = OMR_SYSTEM_PROMPT;
  if (options?.pageRange && options.pageRange !== 'all') {
    promptText += `\n\nATENÇÃO: Foque e transcreva rigorosamente as páginas solicitadas: ${options.pageRange}.`;
  }

  let lastError: Error | null = null;
  let rawText: string | undefined;

  for (const modelToTry of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${apiKey.trim()}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 65536,
      },
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha de conexão com a API do Gemini: ${message}. Verifique sua internet.`);
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errJson = await response.json();
        errorDetail = errJson.error?.message || response.statusText;
      } catch {
        errorDetail = response.statusText;
      }

      if (response.status === 400 || errorDetail.includes('API_KEY_INVALID')) {
        throw new Error('Chave de API do Gemini inválida ou não autorizada. Verifique no Google AI Studio.');
      }
      if (response.status === 429 || errorDetail.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('Limite de requisições gratuitas por minuto atingido no Gemini. Aguarde 30 segundos e tente novamente.');
      }

      // If 404 (model not found or deprecated for new users), continue to next candidate
      if (response.status === 404) {
        lastError = new Error(`Erro na API Gemini (${response.status}): ${errorDetail}`);
        continue;
      }

      throw new Error(`Erro na API Gemini (${response.status}): ${errorDetail}`);
    }

    const resultData = await response.json();
    rawText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) break;
  }

  if (!rawText) {
    if (lastError) throw lastError;
    throw new Error('A IA não retornou dados legíveis para a imagem enviada. Verifique se a foto da partitura está nítida.');
  }

  // Parse JSON response safely
  let parsedJson: unknown;
  try {
    const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsedJson = JSON.parse(cleanedText);
  } catch (parseErr) {
    throw new Error('Erro ao interpretar a resposta estruturada da IA. Tente novamente com outra foto ou formato.');
  }

  return parseAiTranscription(parsedJson, targetTrackId, { startTickOffset });
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

  rawParsedNotes.forEach((item, idx) => {
    if (item.pitch < lowestPitch) lowestPitch = item.pitch;
    if (item.pitch > highestPitch) highestPitch = item.pitch;

    const endTick = item.rawStartTick + item.durationTicks;
    if (endTick > maxEndTick) maxEndTick = endTick;

    const noteObj: Note = {
      id: `ai-note-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
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
