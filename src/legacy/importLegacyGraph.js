export function isLegacyGraph(candidate) {
  return !candidate?.schemaVersion && Array.isArray(candidate?.nodes) && Array.isArray(candidate?.edges);
}

function portId(rawPoint, fallback = "1") {
  return String(rawPoint?.id ?? rawPoint?.pointId ?? fallback);
}

export function importLegacyGraph(legacy) {
  return {
    schemaVersion: 1,
    id: legacy.id ?? "imported-legacy-diagram",
    name: legacy.name ?? "Diagrama importado",
    metadata: legacy.metadata ?? {},
    nodes: legacy.nodes.map((raw) => ({
      id: String(raw.id),
      type: raw.type,
      position: { x: Number(raw.x ?? raw.position?.x ?? 0), y: Number(raw.y ?? raw.position?.y ?? 0) },
      rotation: Number(raw.rotation ?? 0),
      localName: raw.localName ?? "",
      ports: raw.type === "ElmTerm" ? (raw.connectionPoints ?? raw.ports ?? []) : (raw.ports ?? []),
      properties: Object.fromEntries(Object.entries({
        ...(raw.attributes ?? raw.properties ?? {}),
        sizeX: raw.sizeX ?? raw.attributes?.sizeX ?? raw.properties?.sizeX,
        symbolName: raw.symbolName ?? raw.attributes?.symbolName ?? raw.properties?.symbolName,
      }).filter(([, value]) => value !== undefined)),
    })),
    edges: legacy.edges.map((raw, index) => ({
      id: String(raw.id ?? `legacy-edge-${index}`),
      source: {
        nodeId: String(raw.fromNodeId ?? raw.fromNode?.id ?? raw.source?.nodeId),
        portId: portId(raw.fromPoint ?? raw.source, "1"),
      },
      target: {
        nodeId: String(raw.toNodeId ?? raw.toNode?.id ?? raw.target?.nodeId),
        portId: portId(raw.toPoint ?? raw.target, "1"),
      },
      routing: (raw.controlPoints?.length ?? raw.vertices?.length ?? 0) > 0 ? "manual" : "orthogonal",
      vertices: raw.controlPoints ?? raw.vertices ?? [],
      properties: raw.properties ?? {},
    })),
  };
}
