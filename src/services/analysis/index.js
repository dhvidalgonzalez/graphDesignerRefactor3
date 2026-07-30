import client from "../api/client/index.js";

function errorMessage(errors, fallback) {
  return errors?.map((item) => item.message).filter(Boolean).join("; ") || fallback;
}

export function createAnalysisClientRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function startAnalysisService(input) {
  const result = await client.mutations.startAnalysis(input);
  if (result.errors?.length || !result.data?.studyId) {
    throw new Error(errorMessage(result.errors, "No se pudo iniciar el análisis."));
  }
  return result.data;
}

export async function getAnalysisStudyService(studyId) {
  if (!studyId) return null;
  const result = await client.models.AnalysisStudy.get({ id: studyId });
  if (result.errors?.length) {
    throw new Error(errorMessage(result.errors, "No se pudo consultar el estudio."));
  }
  return result.data ?? null;
}

export async function listAnalysisStudiesByDiagramService(diagramId, limit = 30) {
  if (!diagramId) return [];
  const result = await client.models.AnalysisStudy.listAnalysisStudiesByDiagram(
    { diagramId },
    { limit },
  );
  if (result.errors?.length) {
    throw new Error(errorMessage(result.errors, "No se pudo cargar el historial de análisis."));
  }
  return [...result.data].sort(
    (left, right) => new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime(),
  );
}

export async function requestAnalysisArtifactService(studyId, artifactType) {
  const result = await client.queries.requestAnalysisArtifact({
    studyId,
    artifactType,
  });
  if (result.errors?.length || !result.data?.url) {
    throw new Error(errorMessage(result.errors, "El archivo del análisis todavía no está disponible."));
  }
  return result.data;
}

export async function loadAnalysisArtifactTextService(studyId, artifactType) {
  const ticket = await requestAnalysisArtifactService(studyId, artifactType);
  const response = await fetch(ticket.url, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar ${artifactType.toLowerCase()} (${response.status}).`);
  }
  return {
    ticket,
    text: await response.text(),
  };
}

export async function saveAnalysisResultLayoutService(studyId, layout) {
  if (!studyId) return false;
  const result = await client.mutations.saveAnalysisResultLayout({
    studyId,
    layoutJson: JSON.stringify(layout ?? {}),
  });
  if (result.errors?.length || result.data !== true) {
    throw new Error(errorMessage(result.errors, "No se pudo guardar la posición de las etiquetas."));
  }
  return true;
}
