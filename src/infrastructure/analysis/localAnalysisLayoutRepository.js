const LABEL_PREFIX = "gestion-diagrams:analysis-label-layout:v1";
const DISPLAY_PREFIX = "gestion-diagrams:analysis-display-options:v1";

function key(prefix, diagramId, studyId) {
  return `${prefix}:${String(diagramId || "unknown")}:${String(studyId || "unknown")}`;
}

function normalizeLabelLayout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, item]) => {
    const x = Number(item?.x);
    const y = Number(item?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? [[id, { x, y }]] : [];
  }));
}

export function loadAnalysisLabelLayout(diagramId, studyId) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return {};
  try {
    return normalizeLabelLayout(JSON.parse(window.localStorage.getItem(key(LABEL_PREFIX, diagramId, studyId)) || "{}"));
  } catch {
    return {};
  }
}

export function saveAnalysisLabelLayout(diagramId, studyId, layout) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return;
  try {
    window.localStorage.setItem(key(LABEL_PREFIX, diagramId, studyId), JSON.stringify(normalizeLabelLayout(layout)));
  } catch {
    // Una cuota local llena no debe impedir visualizar el estudio.
  }
}

export function clearAnalysisLabelLayout(diagramId, studyId) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return;
  try {
    window.localStorage.removeItem(key(LABEL_PREFIX, diagramId, studyId));
  } catch {
    // Sin acción: el layout visual es accesorio.
  }
}

export function parseAnalysisLabelLayoutJson(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    // El backend actual guarda el mapa directamente. Se tolera también el
    // contenedor v2 para una migración futura sin romper estudios históricos.
    return normalizeLabelLayout(parsed?.labelOffsets ?? parsed);
  } catch {
    return {};
  }
}

export function loadAnalysisDisplayOptions(diagramId, studyId) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(DISPLAY_PREFIX, diagramId, studyId)) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAnalysisDisplayOptions(diagramId, studyId, options) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return;
  try {
    window.localStorage.setItem(key(DISPLAY_PREFIX, diagramId, studyId), JSON.stringify(options || {}));
  } catch {
    // La preferencia visual es accesoria y no debe bloquear el editor.
  }
}

export function clearAnalysisDisplayOptions(diagramId, studyId) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return;
  try {
    window.localStorage.removeItem(key(DISPLAY_PREFIX, diagramId, studyId));
  } catch {
    // Sin acción.
  }
}
