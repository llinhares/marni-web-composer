import type { Note, TimeSignature } from '../types/music.ts';

export interface SheetTranscriptionNote {
  pitch?: number;
  noteName?: string;
  startTick?: number;
  durationTicks?: number;
  measure?: number;
  beat?: number;
  velocity?: number;
}

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
  chords: Array<{ measure: number; chord: string }>;
  stats: {
    totalNotes: number;
    measures: number;
    durationTicks: number;
    highestPitch: number;
    lowestPitch: number;
  };
}

export interface ScanOptions {
  model?: string;
  targetTrackId?: string;
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
 * Converts a note name with accidental and octave (e.g., 'C4', 'Eb4', 'F#5', 'G3') to MIDI pitch (35-108).
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
  return Math.max(35, Math.min(108, midiPitch));
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

const OMR_SYSTEM_PROMPT = `Você é um especialista em transcrição de partituras e OMR (Optical Music Recognition).
Analise detalhadamente a partitura fornecida nesta imagem e transcreva todas as notas para notação musical e ticks MIDI.

Diretrizes Musicais Rigorosas:
1. Clave e Pauta:
   - Identifique a clave (Clave de Sol / Treble Clef ou Clave de Fá / Bass Clef).
   - Clave de Sol padrão: 1ª linha (inferior) = E4 (64), 2ª = G4 (67), 3ª = B4 (71), 4ª = D5 (74), 5ª = F5 (77). Espaços: F4 (65), A4 (69), C5 (72), E5 (76). Linha suplementar inferior = Dó Central C4 (60).
2. Armadura de Clave (Key Signature):
   - Identifique bemóis (b) ou sustenidos (#) no início de cada sistema.
   - Aplique as alterações nas notas correspondentes em toda a partitura (ex: 3 bemóis = Bb, Eb, Ab; 1 sustenido = F#; 2 sustenidos = F#, C#).
3. Compasso e Andamento:
   - Identifique o compasso (ex: 4/4, 3/4, 6/8, 2/4). Se não explícito, use 4/4.
   - Identifique o andamento/tempo BPM (ex: Allegro = 140 BPM, Andante = 90 BPM, Moderato = 110 BPM, Presto = 168 BPM).
4. Temporização em Ticks (Resolução padrão PPQ = 480 ticks por semínima / quarter note):
   - Semínima (Quarter note 1/4): 480 ticks
   - Colcheia (Eighth note 1/8): 240 ticks
   - Semicolcheia (Sixteenth note 1/16): 120 ticks
   - Mínima (Half note 1/2): 960 ticks
   - Semibreve (Whole note 1/1): 1920 ticks
   - Ponto de aumento: adiciona metade do valor (ex: semínima pontuada = 720 ticks, colcheia pontuada = 360 ticks).
   - Compasso 1 começa no tick 0.
   - Cada compasso 4/4 tem 1920 ticks (4 * 480).
   - Se houver compassos de espera/pausa de introdução (ex: "(Intro) 8" compassos), os compassos 1 a 8 são vazios e a melodia começa no compasso 9 (tick 15360 = 8 * 1920).
   - Calcule "startTick" exato acumulando a duração das notas e pausas de cada compasso.
5. Cifras de Acordes:
   - Se houver cifras de acordes escritas acima dos compassos (ex: Cm, Gm, G#, A#, D#, G), inclua no array "chords".

Responda APENAS em JSON estrito com o seguinte esquema:
{
  "title": "Nome da Música",
  "bpm": 140,
  "timeSignature": "4/4",
  "keySignature": "C minor (3 flats: Bb, Eb, Ab)",
  "chords": [
    { "measure": 9, "chord": "Cm" }
  ],
  "notes": [
    {
      "pitch": 55,
      "noteName": "G3",
      "measure": 9,
      "beat": 1.5,
      "startTick": 15600,
      "durationTicks": 240,
      "velocity": 95
    }
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

  const { mimeType, data: base64Data } = await fileToBase64(file);

  // Model retry candidates if 404 (model not found / deprecated for new accounts)
  const candidateModels = [
    requestedModel,
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
    'gemini-2.5-flash',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

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
              text: OMR_SYSTEM_PROMPT,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
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

  return parseAiTranscription(parsedJson, targetTrackId);
}

/**
 * Validates and converts raw AI JSON into Marni Web Composer Note[] structure.
 */
export function parseAiTranscription(raw: unknown, targetTrackId: string): ParsedScoreResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Formato de resposta da IA inválido.');
  }

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

  let highestPitch = 0;
  let lowestPitch = 127;
  let maxEndTick = 0;

  const validNotes: Note[] = [];

  rawNotes.forEach((n, idx) => {
    // Determine pitch from MIDI number or noteName (e.g. 'C4', 'Eb4')
    let pitch = 60;
    if (typeof n.pitch === 'number' && n.pitch >= 35 && n.pitch <= 108) {
      pitch = Math.round(n.pitch);
    } else if (n.noteName && typeof n.noteName === 'string') {
      pitch = noteNameToPitch(n.noteName);
    }

    if (pitch < lowestPitch) lowestPitch = pitch;
    if (pitch > highestPitch) highestPitch = pitch;

    // Determine startTick
    let startTick = 0;
    if (typeof n.startTick === 'number' && n.startTick >= 0) {
      startTick = Math.round(n.startTick);
    } else if (typeof n.measure === 'number' && n.measure >= 1) {
      const beatOffset = typeof n.beat === 'number' && n.beat >= 1 ? (n.beat - 1) * ticksPerBeat : 0;
      startTick = (n.measure - 1) * ticksPerMeasure + Math.round(beatOffset);
    } else {
      // Fallback: place note sequentially
      startTick = maxEndTick;
    }

    // Determine duration
    let durationTicks = 480;
    if (typeof n.durationTicks === 'number' && n.durationTicks > 0) {
      durationTicks = Math.max(60, Math.min(19200, Math.round(n.durationTicks)));
    }

    const velocity = typeof n.velocity === 'number' ? Math.max(1, Math.min(127, Math.round(n.velocity))) : 95;

    const endTick = startTick + durationTicks;
    if (endTick > maxEndTick) maxEndTick = endTick;

    validNotes.push({
      id: `ai-note-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      trackId: targetTrackId,
      pitch,
      startTick,
      durationTicks,
      velocity,
      selected: false,
    });
  });

  // Sort notes chronologically
  validNotes.sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    return a.pitch - b.pitch;
  });

  const totalMeasures = Math.max(1, Math.ceil(maxEndTick / ticksPerMeasure));

  return {
    title,
    bpm,
    timeSignature,
    keySignature,
    notes: validNotes,
    chords,
    stats: {
      totalNotes: validNotes.length,
      measures: totalMeasures,
      durationTicks: maxEndTick,
      highestPitch: highestPitch === 0 ? 60 : highestPitch,
      lowestPitch: lowestPitch === 127 ? 60 : lowestPitch,
    },
  };
}
