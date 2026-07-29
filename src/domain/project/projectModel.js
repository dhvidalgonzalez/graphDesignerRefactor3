import { createEmptyDiagram } from "../diagram/createDiagram.js";
import { createSampleDiagram } from "../diagram/sampleDiagram.js";
import { parseAndMigrateDiagram } from "../diagram/migrateDiagram.js";
import { createId } from "../../utils/id.js";

export const PROJECT_SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

export function createDiagramSheet({ name = "Diagrama 1", sample = false, document = null } = {}) {
  const id = createId("diagram");
  const diagramDocument = document
    ? parseAndMigrateDiagram(document)
    : sample
      ? { ...createSampleDiagram(), id, name }
      : createEmptyDiagram({ id, name });

  diagramDocument.id = id;
  diagramDocument.name = name || diagramDocument.name;

  const timestamp = now();
  return {
    id,
    name: diagramDocument.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    document: diagramDocument,
  };
}

export function createProject({ name, description = "", sample = false } = {}) {
  const timestamp = now();
  const firstSheet = createDiagramSheet({
    name: sample ? "Diagrama de demostración" : "Diagrama 1",
    sample,
  });

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId("project"),
    name: String(name || "Proyecto sin nombre").trim() || "Proyecto sin nombre",
    description: String(description || "").trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    activeDiagramId: firstSheet.id,
    owner: {
      id: "local-owner",
      displayName: "Propietario local",
    },
    members: [
      {
        id: "local-owner",
        displayName: "Propietario local",
        role: "owner",
        status: "active",
      },
    ],
    diagrams: [firstSheet],
  };
}

export function normalizeProject(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("El proyecto no es válido.");
  const diagrams = Array.isArray(candidate.diagrams)
    ? candidate.diagrams.map((sheet, index) => {
        const document = parseAndMigrateDiagram(sheet.document ?? sheet);
        const id = String(sheet.id ?? document.id ?? createId("diagram"));
        document.id = id;
        document.name = String(document.name ?? sheet.name ?? `Diagrama ${index + 1}`);
        return {
          id,
          name: document.name,
          createdAt: sheet.createdAt ?? candidate.createdAt ?? now(),
          updatedAt: sheet.updatedAt ?? document.updatedAt ?? now(),
          document,
        };
      })
    : [];

  if (!diagrams.length) diagrams.push(createDiagramSheet());
  const activeDiagramId = diagrams.some((sheet) => sheet.id === candidate.activeDiagramId)
    ? candidate.activeDiagramId
    : diagrams[0].id;

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: String(candidate.id ?? createId("project")),
    name: String(candidate.name || "Proyecto sin nombre"),
    description: String(candidate.description || ""),
    createdAt: candidate.createdAt ?? now(),
    updatedAt: candidate.updatedAt ?? now(),
    activeDiagramId,
    owner: candidate.owner ?? { id: "local-owner", displayName: "Propietario local" },
    members: Array.isArray(candidate.members) && candidate.members.length
      ? candidate.members
      : [{ id: "local-owner", displayName: "Propietario local", role: "owner", status: "active" }],
    diagrams,
  };
}

export function getProjectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    diagramCount: project.diagrams.length,
    memberCount: project.members.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function nextDiagramName(project) {
  const used = new Set(project.diagrams.map((sheet) => sheet.name));
  let index = project.diagrams.length + 1;
  while (used.has(`Diagrama ${index}`)) index += 1;
  return `Diagrama ${index}`;
}

export function duplicateDiagramSheet(sheet, name) {
  const document = structuredClone(sheet.document);
  return createDiagramSheet({
    name: name ?? `${sheet.name} copia`,
    document,
  });
}
