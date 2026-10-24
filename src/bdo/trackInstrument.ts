/**
 * Creating tracks and switching their game instrument (shared by the track list, the instrument
 * picker and the importers).
 */

import type { Track } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import {
  bdoInstrumentLabel,
  gameInstrumentFields,
  getBdoInstrument,
  trackGameInstrument,
  type BdoInstrumentKey,
} from './bdoInstruments.ts';

/** Fields of a track playing a game instrument: sound family, colour, default volume and pedal. */
export function instrumentTrackFields(key: BdoInstrumentKey, sound = 0) {
  const fields = gameInstrumentFields(key, sound);
  const family = BDO_INSTRUMENTS.find((i) => i.id === fields.instrumentId);
  return {
    ...fields,
    color: family?.color ?? '#d4a373',
    volume: family?.defaultVolume ?? 75,
    sustainPedal: fields.instrumentId === 'grand-piano',
  };
}

/** Name for a new track of an instrument, numbered when the project already has one. */
export function newTrackName(key: BdoInstrumentKey, existing: Track[]): string {
  const def = getBdoInstrument(key)!;
  const base = bdoInstrumentLabel(def);
  const count = existing.filter((t) => trackGameInstrument(t).def.key === key).length;
  return count === 0 ? base : `${base} ${count + 1}`;
}

/**
 * Changes for switching a track to another game instrument. The name follows the instrument when it
 * was still the default one; the volume and notes are kept.
 */
export function switchTrackInstrument(track: Track, key: BdoInstrumentKey, sound = 0): Partial<Track> {
  const { def: oldDef, sound: oldSound } = trackGameInstrument(track);
  const oldLabel = bdoInstrumentLabel(oldDef);
  const fields = instrumentTrackFields(key, sound);
  const newLabel = bdoInstrumentLabel(getBdoInstrument(key)!);
  let name = track.name;
  if (track.name === oldLabel || track.name === bdoInstrumentLabel(oldDef, oldSound)) name = newLabel;
  else if (track.name.startsWith(`${oldLabel} `)) name = `${newLabel}${track.name.slice(oldLabel.length)}`;
  const changingFamily = fields.instrumentId !== track.instrumentId;
  return {
    bdoInstrument: fields.bdoInstrument,
    bdoSound: fields.bdoSound,
    instrumentId: fields.instrumentId,
    name,
    color: changingFamily ? fields.color : track.color,
    sustainPedal: changingFamily ? fields.sustainPedal : track.sustainPedal,
  };
}
