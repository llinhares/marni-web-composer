export interface MidiNoteLike {
  name: string;
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
}

export function applySustainToNotes(notes: MidiNoteLike[], cc64Events: any[] = []): MidiNoteLike[] {
  if (!cc64Events || cc64Events.length === 0) {
    return notes;
  }

  type EventType = 
    | { kind: 'note_on'; ticks: number; midi: number; name: string; velocity: number }
    | { kind: 'note_off'; ticks: number; midi: number }
    | { kind: 'cc64'; ticks: number; isDown: boolean };

  const events: EventType[] = [];

  notes.forEach(n => {
    events.push({ kind: 'note_on', ticks: n.ticks, midi: n.midi, name: n.name, velocity: n.velocity });
    events.push({ kind: 'note_off', ticks: n.ticks + n.durationTicks, midi: n.midi });
  });

  cc64Events.forEach(cc => {
    const isDown = cc.value >= 64 || (cc.value > 0 && cc.value <= 1.0 && cc.value >= 0.5);
    events.push({ kind: 'cc64', ticks: cc.ticks, isDown });
  });

  events.sort((a, b) => {
    if (a.ticks !== b.ticks) return a.ticks - b.ticks;
    const order = (k: string) => k === 'cc64' ? 0 : k === 'note_off' ? 1 : 2;
    return order(a.kind) - order(b.kind);
  });

  let isSustainOn = false;
  const activeNotes = new Map<number, { name: string, startTick: number, velocity: number }>();
  const sustainedNotes = new Map<number, { name: string, startTick: number, velocity: number }>();
  const outputNotes: MidiNoteLike[] = [];

  for (const ev of events) {
    if (ev.kind === 'cc64') {
      isSustainOn = ev.isDown;
      if (!isSustainOn) {
        for (const [midi, data] of sustainedNotes.entries()) {
          const dur = Math.max(1, ev.ticks - data.startTick);
          outputNotes.push({
            name: data.name,
            midi,
            ticks: data.startTick,
            durationTicks: dur,
            velocity: data.velocity
          });
        }
        sustainedNotes.clear();
      }
    } else if (ev.kind === 'note_on') {
      if (sustainedNotes.has(ev.midi)) {
        const old = sustainedNotes.get(ev.midi)!;
        outputNotes.push({
          name: old.name,
          midi: ev.midi,
          ticks: old.startTick,
          durationTicks: Math.max(1, ev.ticks - old.startTick),
          velocity: old.velocity
        });
        sustainedNotes.delete(ev.midi);
      }
      if (activeNotes.has(ev.midi)) {
        const old = activeNotes.get(ev.midi)!;
        outputNotes.push({
          name: old.name,
          midi: ev.midi,
          ticks: old.startTick,
          durationTicks: Math.max(1, ev.ticks - old.startTick),
          velocity: old.velocity
        });
        activeNotes.delete(ev.midi);
      }
      activeNotes.set(ev.midi, { name: ev.name, startTick: ev.ticks, velocity: ev.velocity });
    } else if (ev.kind === 'note_off') {
      if (activeNotes.has(ev.midi)) {
        const data = activeNotes.get(ev.midi)!;
        activeNotes.delete(ev.midi);
        if (isSustainOn) {
          sustainedNotes.set(ev.midi, data);
        } else {
          outputNotes.push({
            name: data.name,
            midi: ev.midi,
            ticks: data.startTick,
            durationTicks: Math.max(1, ev.ticks - data.startTick),
            velocity: data.velocity
          });
        }
      }
    }
  }

  const lastTick = events.length > 0 ? events[events.length - 1].ticks : 0;
  for (const [midi, data] of [...activeNotes.entries(), ...sustainedNotes.entries()]) {
    outputNotes.push({
      name: data.name,
      midi,
      ticks: data.startTick,
      durationTicks: Math.max(120, lastTick - data.startTick),
      velocity: data.velocity
    });
  }

  return outputNotes;
}
