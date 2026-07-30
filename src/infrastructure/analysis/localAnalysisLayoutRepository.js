const PREFIX = "gestion-diagrams:analysis-label-layout:v1";

function key(diagramId, studyId) {
  return `${PREFIX}:${String(diagramId || "unknown")}:${String(studyId || "unknown")}`;
}

export function loadAnalysisLabelLayout(diagramId, studyId) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(diagramId, studyId)) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
      const x = Number(value?.x);
      const y = Number(value?.y);
      return Number.isFinite(x) && Number.isFinite(y) ? [[id, { x, y }]] : [];
    }));
  } catch {
    return {};
  }
}

export function saveAnalysisLabelLayout(diagramId, studyId, layout) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return;
  try {
    window.localStorage.setItem(key(diagramId, studyId), JSON.stringify(layout || {}));
  } catch {
    // Una cuota local llena no debe impedir visualizar el estudio.
  }
}

export function clearAnalysisLabelLayout(diagramId, studyId) {
  if (typeof window === "undefined" || !window.localStorage || !studyId) return;
  try {
    window.localStorage.removeItem(key(diagramId, studyId));
  } catch {
    // Sin acción: el layout visual es accesorio.
  }
}

export function parseAnalysisLabelLayoutJson(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, item]) => {
      const x = Number(item?.x);
      const y = Number(item?.y);
      return Number.isFinite(x) && Number.isFinite(y) ? [[id, { x, y }]] : [];
    }));
  } catch {
    return {};
  }
}
