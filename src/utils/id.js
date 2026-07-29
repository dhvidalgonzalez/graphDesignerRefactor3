let counter = 0;

export function createId(prefix) {
  counter += 1;
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
