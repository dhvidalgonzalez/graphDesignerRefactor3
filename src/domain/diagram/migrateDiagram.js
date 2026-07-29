import { CURRENT_SCHEMA_VERSION } from "./createDiagram.js";
import { validateDiagram } from "./validateDiagram.js";
import { importLegacyGraph, isLegacyGraph } from "../../legacy/importLegacyGraph.js";
import { normalizeCurrentDiagram } from "./normalizeDiagram.js";
import { migrateV1ToV2 } from "./migrateV1.js";
import { migrateV2ToV3 } from "./migrateV2.js";

export function parseAndMigrateDiagram(input) {
  const candidate = typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  const standardized = isLegacyGraph(candidate) ? importLegacyGraph(candidate) : candidate;

  let migrated;
  if (standardized.schemaVersion === 1) {
    migrated = migrateV2ToV3(migrateV1ToV2(standardized));
  } else if (standardized.schemaVersion === 2) {
    migrated = migrateV2ToV3(standardized);
  } else {
    migrated = normalizeCurrentDiagram(standardized);
  }

  if (migrated.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Versión de diagrama no compatible: ${migrated.schemaVersion ?? "sin versión"}.`);
  }

  const errors = validateDiagram(migrated);
  if (errors.length) throw new Error(errors.join("\n"));
  return migrated;
}
