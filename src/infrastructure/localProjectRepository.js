import { parseAndMigrateDiagram } from "../domain/diagram/migrateDiagram.js";
import { createProject, getProjectSummary, normalizeProject } from "../domain/project/projectModel.js";

const INDEX_KEY = "graph-designer:projects:index:v1";
const PROJECT_PREFIX = "graph-designer:project:v1:";
const LEGACY_DIAGRAM_KEY = "electrical-diagram-editor:prototype:v1";

function readJson(storage, key, fallback) {
  const raw = storage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

export class LocalProjectRepository {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  projectKey(id) {
    return `${PROJECT_PREFIX}${id}`;
  }

  list() {
    const index = readJson(this.storage, INDEX_KEY, []);
    return [...index].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  get(id) {
    const raw = this.storage.getItem(this.projectKey(id));
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  }

  save(project) {
    const normalized = normalizeProject(project);
    normalized.updatedAt = new Date().toISOString();
    this.storage.setItem(this.projectKey(normalized.id), JSON.stringify(normalized));

    const summaries = this.list().filter((item) => item.id !== normalized.id);
    summaries.push(getProjectSummary(normalized));
    this.storage.setItem(INDEX_KEY, JSON.stringify(summaries));
    return normalized;
  }

  create(input) {
    return this.save(createProject(input));
  }

  delete(id) {
    this.storage.removeItem(this.projectKey(id));
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((item) => item.id !== id)));
  }

  migrateLegacySingleDiagram() {
    if (this.list().length) return null;
    const raw = this.storage.getItem(LEGACY_DIAGRAM_KEY);
    if (!raw) return null;

    const document = parseAndMigrateDiagram(raw);
    const project = createProject({ name: "Proyecto migrado", description: "Creado desde el diagrama local de la versión anterior." });
    project.diagrams[0].name = document.name;
    project.diagrams[0].document = document;
    project.diagrams[0].id = document.id;
    project.activeDiagramId = document.id;
    return this.save(project);
  }
}

export const localProjectRepository = new LocalProjectRepository();
