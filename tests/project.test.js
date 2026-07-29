import { describe, expect, it } from "vitest";
import {
  createDiagramSheet,
  createProject,
  duplicateDiagramSheet,
  nextDiagramName,
  normalizeProject,
} from "../src/domain/project/projectModel.js";


describe("modelo de proyectos", () => {
  it("crea un proyecto con una hoja activa y propietario local", () => {
    const project = createProject({ name: "Subestación Norte" });
    expect(project.name).toBe("Subestación Norte");
    expect(project.diagrams).toHaveLength(1);
    expect(project.activeDiagramId).toBe(project.diagrams[0].id);
    expect(project.members[0].role).toBe("owner");
  });

  it("duplica una hoja con identificadores independientes", () => {
    const source = createDiagramSheet({ name: "Principal" });
    const copy = duplicateDiagramSheet(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.document.id).toBe(copy.id);
    expect(copy.document.nodes).toEqual(source.document.nodes);
  });

  it("normaliza proyectos sin hojas agregando una hoja vacía", () => {
    const normalized = normalizeProject({ id: "project-1", name: "Vacío", diagrams: [] });
    expect(normalized.diagrams).toHaveLength(1);
    expect(normalized.activeDiagramId).toBe(normalized.diagrams[0].id);
  });

  it("genera nombres sin colisionar", () => {
    const project = createProject({ name: "Prueba" });
    project.diagrams[0].name = "Diagrama 2";
    expect(nextDiagramName(project)).toBe("Diagrama 3");
  });
});
