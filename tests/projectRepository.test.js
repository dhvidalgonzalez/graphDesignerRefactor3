import { describe, expect, it } from "vitest";
import { LocalProjectRepository } from "../src/infrastructure/localProjectRepository.js";

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

describe("repositorio local de proyectos", () => {
  it("crea, lista, recupera y elimina proyectos", () => {
    const repository = new LocalProjectRepository(new MemoryStorage());
    const project = repository.create({ name: "Proyecto A" });

    expect(repository.list()).toHaveLength(1);
    expect(repository.get(project.id).name).toBe("Proyecto A");

    repository.delete(project.id);
    expect(repository.list()).toHaveLength(0);
    expect(repository.get(project.id)).toBeNull();
  });

  it("mantiene documentos separados por proyecto", () => {
    const repository = new LocalProjectRepository(new MemoryStorage());
    const first = repository.create({ name: "Primero" });
    const second = repository.create({ name: "Segundo" });
    first.diagrams[0].document.name = "Hoja modificada";
    repository.save(first);

    expect(repository.get(first.id).diagrams[0].document.name).toBe("Hoja modificada");
    expect(repository.get(second.id).diagrams[0].document.name).not.toBe("Hoja modificada");
  });
});
