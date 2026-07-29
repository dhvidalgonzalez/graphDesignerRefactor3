const PREFIX = "graph-designer:diagram-draft:v2";
const LEGACY_PREFIX = "graph-designer:diagram-draft:v1";

function storageKey(prefix, userId, projectId, diagramId) {
  return `${prefix}:${encodeURIComponent(userId || "anonymous")}:${encodeURIComponent(projectId)}:${encodeURIComponent(diagramId)}`;
}

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readDraft(storage, key) {
  const raw = storage?.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export const localDiagramDraftRepository = {
  save({ userId, projectId, diagramId, document, baseStorageVersion = null }) {
    const storage = getStorage();
    if (!storage || !projectId || !diagramId || !document) return null;
    const draft = {
      projectId,
      diagramId,
      baseStorageVersion: Number.isFinite(Number(baseStorageVersion))
        ? Number(baseStorageVersion)
        : null,
      savedAt: new Date().toISOString(),
      document,
    };
    storage.setItem(
      storageKey(PREFIX, userId, projectId, diagramId),
      JSON.stringify(draft),
    );
    return draft;
  },

  get({ userId, projectId, diagramId }) {
    const storage = getStorage();
    if (!storage || !projectId || !diagramId) return null;
    const currentKey = storageKey(PREFIX, userId, projectId, diagramId);
    const current = readDraft(storage, currentKey);
    if (current) return current;

    const legacyKey = storageKey(LEGACY_PREFIX, userId, projectId, diagramId);
    const legacy = readDraft(storage, legacyKey);
    if (!legacy) return null;

    storage.removeItem(legacyKey);
    storage.setItem(currentKey, JSON.stringify({ ...legacy, baseStorageVersion: null }));
    return { ...legacy, baseStorageVersion: null };
  },

  remove({ userId, projectId, diagramId }) {
    const storage = getStorage();
    storage?.removeItem(storageKey(PREFIX, userId, projectId, diagramId));
    storage?.removeItem(storageKey(LEGACY_PREFIX, userId, projectId, diagramId));
  },
};

export default localDiagramDraftRepository;
