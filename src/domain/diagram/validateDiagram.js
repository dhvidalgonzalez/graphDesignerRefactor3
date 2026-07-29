import { SYMBOL_CATALOG, getNodePort } from "../catalog/symbolCatalog.js";
import { getVoltageLevels } from "../electrical/voltageLevels.js";

export function validateDiagram(diagram) {
  const errors = [];
  if (!diagram || typeof diagram !== "object") errors.push("El archivo no contiene un objeto de diagrama.");
  if (!diagram?.nodes || typeof diagram.nodes !== "object") errors.push("Falta la colección de componentes.");
  if (!diagram?.edges || typeof diagram.edges !== "object") errors.push("Falta la colección de trazados.");
  if (Number(diagram?.schemaVersion) >= 3) {
    if (!diagram?.electricalModel || typeof diagram.electricalModel !== "object") errors.push("Falta el modelo eléctrico lógico.");
    if (!Array.isArray(diagram?.operatingCases) || !diagram.operatingCases.length) errors.push("Falta al menos un caso de operación.");
    if (!diagram?.analysisConfiguration || typeof diagram.analysisConfiguration !== "object") errors.push("Falta la configuración de análisis.");
  }
  if (errors.length) return errors;

  const voltageIds = new Set(getVoltageLevels(diagram.metadata).map((level) => level.id));
  Object.values(diagram.nodes).forEach((node) => {
    if (!node.id) errors.push("Existe un componente sin identificador.");
    if (!SYMBOL_CATALOG[node.type]) errors.push(`El componente ${node.id} usa un tipo desconocido: ${node.type}.`);
    if (!Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) errors.push(`El componente ${node.id} no tiene una posición válida.`);
    Object.entries(node.properties ?? {}).forEach(([key, value]) => {
      if (key.startsWith("voltageLevelId") && value && !voltageIds.has(value)) errors.push(`El componente ${node.id} referencia un nivel de voltaje inexistente.`);
    });
  });

  const defaultCases = (diagram.operatingCases ?? []).filter((item) => item?.isDefault);
  if ((diagram.operatingCases ?? []).length && defaultCases.length !== 1) {
    errors.push("Debe existir exactamente un caso de operación predeterminado.");
  }

  Object.values(diagram.edges).forEach((edge) => {
    const sourceNode = diagram.nodes[edge.source?.nodeId];
    const targetNode = diagram.nodes[edge.target?.nodeId];
    if (!sourceNode) errors.push(`El trazado ${edge.id} referencia un componente de origen inexistente.`);
    if (!targetNode) errors.push(`El trazado ${edge.id} referencia un componente de destino inexistente.`);
    if (sourceNode && !getNodePort(sourceNode, edge.source.portId)) errors.push(`El trazado ${edge.id} referencia un puerto de origen inexistente.`);
    if (targetNode && !getNodePort(targetNode, edge.target.portId)) errors.push(`El trazado ${edge.id} referencia un puerto de destino inexistente.`);
    if (!["path", "line"].includes(edge.kind)) errors.push(`El trazado ${edge.id} tiene un tipo inválido.`);
    if (!["orthogonal", "free"].includes(edge.routing)) errors.push(`El trazado ${edge.id} tiene un modo de dibujo inválido.`);
  });
  const model = diagram.electricalModel;
  if (model) {
    if (!Array.isArray(model.components)) errors.push("El modelo eléctrico no contiene una lista válida de componentes.");
    if (!Array.isArray(model.terminals)) errors.push("El modelo eléctrico no contiene una lista válida de terminales.");
    if (!Array.isArray(model.connectionNodes)) errors.push("El modelo eléctrico no contiene una lista válida de nodos de conexión.");
  }
  return errors;
}
