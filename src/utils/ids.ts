/** Collision-free id for notes and tracks (crypto.randomUUID with a fallback for old browsers). */
export function newId(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}-${uuid}` : uuid;
}
