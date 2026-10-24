import React from 'react';
import {
  BDO_INSTRUMENT_DEFS,
  BDO_TABS,
  BDO_TIER_NAMES,
  MARNION_SOUND_NAMES,
  bdoInstrumentCode,
} from '../bdo/bdoInstruments.ts';

/**
 * Game instrument codes with their labels, grouped like the game's instrument tabs. With `perSound`,
 * each Marnion sound is its own option; otherwise one option per instrument (its first sound).
 */
export function bdoInstrumentOptions(perSound: boolean) {
  return BDO_TABS.map((tab) => ({
    tab: tab.name,
    options: BDO_INSTRUMENT_DEFS.filter((d) => d.tab === tab.id).flatMap((d) =>
      Array.from({ length: perSound ? d.sounds : 1 }, (_, sound) => ({
        code: bdoInstrumentCode(d, sound),
        label: `${BDO_TIER_NAMES[d.tier]} · ${d.name}${perSound && d.sounds > 1 ? ` (${MARNION_SOUND_NAMES[sound]})` : ''}`,
      }))
    ),
  }));
}

const WITH_SOUNDS = bdoInstrumentOptions(true);
const WITHOUT_SOUNDS = bdoInstrumentOptions(false);

/** Select of the game instruments (value = instrument code in the game file; first sound when `perSound` is off). */
export const BdoInstrumentSelect: React.FC<{
  value: number;
  onChange: (code: number) => void;
  className?: string;
  title?: string;
  /** List each Marnion sound separately (default true). */
  perSound?: boolean;
}> = ({ value, onChange, className, title, perSound = true }) => (
  <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={className} title={title}>
    {(perSound ? WITH_SOUNDS : WITHOUT_SOUNDS).map((group) => (
      <optgroup key={group.tab} label={group.tab}>
        {group.options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </optgroup>
    ))}
  </select>
);
