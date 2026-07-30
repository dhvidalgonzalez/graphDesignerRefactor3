import { buildElectricalModel, getElectricalModelStatistics } from "../electrical/electricalModel.js";
import { normalizeAnalysisConfiguration } from "./analysisConfiguration.js";


const ASSUMPTION_RELEVANT_FIELDS = new Set([
  "nominalVoltageKv",
  "busType",
  "voltageSetpointPu",
  "activePowerKw",
  "reactivePowerKvar",
  "powerFactor",
  "loadModel",
  "controlMode",
  "ratedPowerMVA",
  "minimumReactivePowerMvar",
  "maximumReactivePowerMvar",
  "lengthKm",
  "ratedCurrentA",
  "resistanceOhmPerKm",
  "reactanceOhmPerKm",
  "susceptanceUsPerKm",
  "primaryNominalVoltageKv",
  "secondaryNominalVoltageKv",
  "impedancePercent",
  "resistancePercent",
  "tapPosition",
  "state",
  "reactivePowerKvar",
]);

function buildIslandIndex(model) {
  const nodeIds = model.connectionNodes.map((node) => node.id);
  const adjacency = new Map(nodeIds.map((id) => [id, new Set()]));
  const terminalsByComponent = model.terminals.reduce((groups, terminal) => {
    groups.set(terminal.componentId, [...(groups.get(terminal.componentId) ?? []), terminal]);
    return groups;
  }, new Map());

  const electricallyLinks = (component) => {
    if (!component.inService) return false;
    if (["LINE", "TRANSFORMER_2W", "TRANSFORMER_3W"].includes(component.kind)) return true;
    if (component.kind === "SWITCH") return component.parameters?.state?.value !== "OPEN";
    return false;
  };

  model.components.filter(electricallyLinks).forEach((component) => {
    const ids = [...new Set((terminalsByComponent.get(component.id) ?? [])
      .map((terminal) => terminal.connectionNodeId)
      .filter(Boolean))];
    ids.forEach((from) => ids.forEach((to) => {
      if (from !== to) adjacency.get(from)?.add(to);
    }));
  });

  const islandByNode = new Map();
  let counter = 0;
  nodeIds.forEach((start) => {
    if (islandByNode.has(start)) return;
    const islandId = `island-${counter += 1}`;
    const pending = [start];
    while (pending.length) {
      const current = pending.pop();
      if (!current || islandByNode.has(current)) continue;
      islandByNode.set(current, islandId);
      adjacency.get(current)?.forEach((next) => pending.push(next));
    }
  });

  return { islandByNode, terminalsByComponent };
}

function issue(code, message, componentId = null, field = null) {
  return {
    code,
    message,
    ...(componentId ? { componentId } : {}),
    ...(field ? { field } : {}),
  };
}

function parameterValue(component, key) {
  return component.parameters?.[key]?.value;
}

function isMissing(component, key) {
  const parameter = component.parameters?.[key];
  return !parameter || parameter.value === null || parameter.value === "" || parameter.status === "MISSING";
}


export function evaluateAnalysisReadiness(document) {
  const model = buildElectricalModel(document);
  const errors = [];
  const warnings = [];
  const componentById = new Map(model.components.map((component) => [component.id, component]));
  const connectionNodeById = new Map(model.connectionNodes.map((node) => [node.id, node]));
  const terminalsByComponent = model.terminals.reduce((groups, terminal) => {
    groups.set(terminal.componentId, [...(groups.get(terminal.componentId) ?? []), terminal]);
    return groups;
  }, new Map());

  const slackComponents = model.components.filter((component) => {
    if (!component.inService) return false;
    if (component.kind === "EXTERNAL_GRID") return true;
    return component.kind === "GENERATOR" && String(parameterValue(component, "controlMode") ?? "").toUpperCase() === "SLACK";
  });

  if (!slackComponents.length) {
    errors.push(issue(
      "NO_SLACK_REFERENCE",
      "No existe una red externa ni un generador configurado como Slack.",
    ));
  }

  const { islandByNode, terminalsByComponent: islandTerminalsByComponent } = buildIslandIndex(model);
  const islandSummary = new Map();
  model.components.filter((component) => component.inService).forEach((component) => {
    const nodeIds = [...new Set((islandTerminalsByComponent.get(component.id) ?? [])
      .map((terminal) => terminal.connectionNodeId)
      .filter(Boolean))];
    nodeIds.forEach((nodeId) => {
      const islandId = islandByNode.get(nodeId);
      if (!islandId) return;
      const current = islandSummary.get(islandId) ?? { components: new Set(), slackIds: new Set(), energized: false };
      current.components.add(component.id);
      current.energized ||= ["LOAD", "GENERATOR", "EXTERNAL_GRID", "SHUNT"].includes(component.kind);
      if (slackComponents.some((slack) => slack.id === component.id)) current.slackIds.add(component.id);
      islandSummary.set(islandId, current);
    });
  });

  islandSummary.forEach((summary, islandId) => {
    if (summary.energized && !summary.slackIds.size) {
      errors.push(issue(
        "ENERGIZED_ISLAND_WITHOUT_REFERENCE",
        `La isla eléctrica ${islandId} contiene equipos en servicio, pero no posee referencia Slack.`,
      ));
    }
    if (summary.slackIds.size > 1) {
      warnings.push(issue(
        "MULTIPLE_SLACK_REFERENCES",
        `La isla eléctrica ${islandId} contiene ${summary.slackIds.size} referencias Slack; el solver deberá verificar su compatibilidad.`,
      ));
    }
  });

  model.connectionNodes.forEach((node) => {
    if (node.voltageConflict) {
      errors.push(issue(
        "CONNECTION_VOLTAGE_CONFLICT",
        `El nodo eléctrico ${node.id} une directamente niveles de tensión incompatibles.`,
        node.busComponentId ?? null,
      ));
    }
  });

  model.terminals.forEach((terminal) => {
    if (!terminal.connectionNodeId) {
      errors.push(issue(
        "INCOMPLETE_TERMINAL",
        `El terminal ${terminal.role} no está conectado a un nodo eléctrico.`,
        terminal.componentId,
      ));
    }
  });

  model.components.forEach((component) => {
    const terminals = terminalsByComponent.get(component.id) ?? [];
    if (!component.inService) return;

    if (component.kind === "LOAD") {
      if (isMissing(component, "activePowerKw")) {
        errors.push(issue("LOAD_ACTIVE_POWER_MISSING", "La carga no tiene potencia activa definida.", component.id, "activePowerMW"));
      }
      if (isMissing(component, "reactivePowerKvar") && isMissing(component, "powerFactor")) {
        errors.push(issue("LOAD_REACTIVE_DATA_MISSING", "La carga necesita potencia reactiva o factor de potencia.", component.id, "reactivePowerMvar"));
      }
      const powerFactor = Number(parameterValue(component, "powerFactor"));
      if (Number.isFinite(powerFactor) && Math.abs(powerFactor) > 0 && Math.abs(powerFactor) < 0.7) {
        warnings.push(issue("UNUSUAL_POWER_FACTOR", "El factor de potencia de la carga es inferior a 0,70.", component.id, "powerFactor"));
      }
    }

    if (component.kind === "LINE") {
      const length = Number(parameterValue(component, "lengthKm"));
      const resistance = Number(parameterValue(component, "resistanceOhmPerKm"));
      const reactance = Number(parameterValue(component, "reactanceOhmPerKm"));
      if (!Number.isFinite(length) || length <= 0) {
        errors.push(issue("INVALID_LINE_LENGTH", "La línea debe tener una longitud mayor que cero.", component.id, "lengthKm"));
      }
      if (!Number.isFinite(resistance) || resistance < 0 || !Number.isFinite(reactance) || reactance <= 0) {
        errors.push(issue("INVALID_LINE_IMPEDANCE", "La línea necesita una resistencia no negativa y una reactancia mayor que cero.", component.id, "reactanceOhmPerKm"));
      }
      if (terminals.length === 2 && terminals[0].connectionNodeId && terminals[0].connectionNodeId === terminals[1].connectionNodeId) {
        errors.push(issue("LINE_SAME_ENDPOINT", "La línea conecta el mismo nodo eléctrico en ambos extremos.", component.id));
      }
      if (terminals.length === 2) {
        const fromVoltage = Number(connectionNodeById.get(terminals[0].connectionNodeId)?.nominalVoltageKv);
        const toVoltage = Number(connectionNodeById.get(terminals[1].connectionNodeId)?.nominalVoltageKv);
        if (Number.isFinite(fromVoltage) && Number.isFinite(toVoltage) && fromVoltage > 0 && toVoltage > 0 && fromVoltage !== toVoltage) {
          errors.push(issue("LINE_VOLTAGE_MISMATCH", "La línea conecta nodos con tensiones nominales diferentes.", component.id, "voltageLevelId"));
        }
      }
      if (isMissing(component, "ratedCurrentA") || Number(parameterValue(component, "ratedCurrentA")) <= 0) {
        warnings.push(issue("LINE_THERMAL_LIMIT_MISSING", "La línea no tiene un límite térmico confirmado.", component.id, "ratedCurrentA"));
      }
    }

    if (component.kind === "TRANSFORMER_2W") {
      const primary = Number(parameterValue(component, "primaryNominalVoltageKv"));
      const secondary = Number(parameterValue(component, "secondaryNominalVoltageKv"));
      if (!Number.isFinite(primary) || primary <= 0 || !Number.isFinite(secondary) || secondary <= 0) {
        errors.push(issue("TRANSFORMER_VOLTAGE_MISSING", "El transformador necesita tensiones nominales válidas en ambos devanados.", component.id));
      }
      if (Number.isFinite(primary) && Number.isFinite(secondary) && primary === secondary) {
        warnings.push(issue("TRANSFORMER_EQUAL_VOLTAGES", "El transformador tiene la misma tensión nominal en ambos devanados.", component.id));
      }
      if (isMissing(component, "ratedPowerMVA") || Number(parameterValue(component, "ratedPowerMVA")) <= 0) {
        errors.push(issue("TRANSFORMER_POWER_MISSING", "El transformador necesita potencia nominal.", component.id, "ratedPowerMVA"));
      }
      if (isMissing(component, "impedancePercent") || Number(parameterValue(component, "impedancePercent")) <= 0) {
        errors.push(issue("TRANSFORMER_IMPEDANCE_MISSING", "El transformador necesita impedancia de cortocircuito.", component.id, "impedancePercent"));
      }
      const primaryTerminal = terminals.find((terminal) => terminal.role === "PRIMARY");
      const secondaryTerminal = terminals.find((terminal) => terminal.role === "SECONDARY");
      const primaryNodeVoltage = Number(connectionNodeById.get(primaryTerminal?.connectionNodeId)?.nominalVoltageKv);
      const secondaryNodeVoltage = Number(connectionNodeById.get(secondaryTerminal?.connectionNodeId)?.nominalVoltageKv);
      if (Number.isFinite(primaryNodeVoltage) && Number.isFinite(primary) && primaryNodeVoltage > 0 && primary > 0 && primaryNodeVoltage !== primary) {
        errors.push(issue("TRANSFORMER_PRIMARY_VOLTAGE_MISMATCH", "La tensión del nodo primario no coincide con la ficha del transformador.", component.id, "voltageLevelId1"));
      }
      if (Number.isFinite(secondaryNodeVoltage) && Number.isFinite(secondary) && secondaryNodeVoltage > 0 && secondary > 0 && secondaryNodeVoltage !== secondary) {
        errors.push(issue("TRANSFORMER_SECONDARY_VOLTAGE_MISMATCH", "La tensión del nodo secundario no coincide con la ficha del transformador.", component.id, "voltageLevelId2"));
      }
    }

    if (component.kind === "TRANSFORMER_3W") {
      errors.push(issue(
        "THREE_WINDING_TRANSFORMER_NOT_SUPPORTED",
        "El solver desplegado todavía no admite transformadores de tres devanados.",
        component.id,
      ));
    }

    if (component.kind === "SHUNT") {
      const controlMode = String(parameterValue(component, "controlMode") ?? "Fijo").toUpperCase();
      if (!["FIJO", "FIXED"].includes(controlMode)) {
        errors.push(issue(
          "SHUNT_CONTROL_MODE_NOT_SUPPORTED",
          "El solver actual sólo admite bancos shunt con control fijo.",
          component.id,
          "controlMode",
        ));
      }
    }

    if (component.kind === "GENERATOR" || component.kind === "EXTERNAL_GRID") {
      const controlMode = String(parameterValue(component, "controlMode") ?? (component.kind === "EXTERNAL_GRID" ? "SLACK" : "PQ")).toUpperCase();
      if (["PV", "SLACK"].includes(controlMode) && isMissing(component, "voltageSetpointPu")) {
        warnings.push(issue("GENERATOR_VOLTAGE_SETPOINT_MISSING", "La fuente no tiene consigna de tensión confirmada.", component.id, "voltageSetpointPu"));
      }
      if (component.kind === "GENERATOR" && controlMode !== "SLACK" && isMissing(component, "activePowerKw")) {
        errors.push(issue("GENERATOR_ACTIVE_POWER_MISSING", "El generador no tiene potencia activa definida para su modo de control.", component.id, "activePowerMW"));
      }
      if (component.kind === "GENERATOR" && controlMode === "PQ" && isMissing(component, "reactivePowerKvar")) {
        errors.push(issue("GENERATOR_REACTIVE_POWER_MISSING", "El generador PQ no tiene potencia reactiva definida.", component.id, "reactivePowerMvar"));
      }
      if (component.kind === "GENERATOR" && ["PV", "SLACK"].includes(controlMode)
        && (isMissing(component, "minimumReactivePowerMvar") || isMissing(component, "maximumReactivePowerMvar"))) {
        warnings.push(issue("REACTIVE_LIMITS_MISSING", "El generador no tiene límites reactivos completos.", component.id));
      }
    }

    if (component.kind === "BUS" && isMissing(component, "nominalVoltageKv")) {
      errors.push(issue("BUS_VOLTAGE_MISSING", "La barra no tiene tensión nominal válida.", component.id, "voltageLevelId"));
    }

    Object.entries(component.parameters ?? {}).forEach(([key, parameter]) => {
      if (ASSUMPTION_RELEVANT_FIELDS.has(key) && parameter?.status === "ASSUMED" && parameter.value !== null) {
        warnings.push(issue(
          "ASSUMED_PARAMETER",
          `El parámetro ${key} utiliza un valor asumido.`,
          component.id,
          key,
        ));
      }
    });
  });

  const connectionNodeIds = new Set(model.connectionNodes.map((node) => node.id));
  model.terminals.forEach((terminal) => {
    if (terminal.connectionNodeId && !connectionNodeIds.has(terminal.connectionNodeId)) {
      errors.push(issue("MISSING_CONNECTION_NODE", "Un terminal referencia un nodo de conexión inexistente.", terminal.componentId));
    }
    if (!componentById.has(terminal.componentId)) {
      errors.push(issue("MISSING_COMPONENT_REFERENCE", "Un terminal referencia un componente inexistente.", terminal.componentId));
    }
  });

  let uniqueWarnings = [...new Map(warnings.map((item) => [`${item.code}:${item.componentId ?? ""}:${item.field ?? ""}`, item])).values()];
  const validationOptions = normalizeAnalysisConfiguration(document.analysisConfiguration).validationOptions;
  if (!validationOptions.allowAssumedParameters) {
    uniqueWarnings.filter((item) => item.code === "ASSUMED_PARAMETER").forEach((item) => {
      errors.push(issue(
        "ASSUMED_PARAMETER_NOT_ALLOWED",
        "La configuración del estudio no permite parámetros asumidos.",
        item.componentId,
        item.field,
      ));
    });
    uniqueWarnings = uniqueWarnings.filter((item) => item.code !== "ASSUMED_PARAMETER");
  }
  if (validationOptions.requireThermalLimits) {
    uniqueWarnings.filter((item) => item.code === "LINE_THERMAL_LIMIT_MISSING").forEach((item) => {
      errors.push(issue(
        "THERMAL_LIMIT_REQUIRED",
        "La configuración exige un límite térmico válido para cada línea.",
        item.componentId,
        item.field,
      ));
    });
    uniqueWarnings = uniqueWarnings.filter((item) => item.code !== "LINE_THERMAL_LIMIT_MISSING");
  }

  const readiness = errors.length
    ? "NOT_READY"
    : uniqueWarnings.length
      ? "READY_WITH_ASSUMPTIONS"
      : "READY";

  return {
    readiness,
    errors,
    warnings: uniqueWarnings,
    statistics: getElectricalModelStatistics({ ...document, electricalModel: model }),
    model,
  };
}

export function evaluateAnalysisReadinessForType(document, analysisType, options = {}) {
  const base = evaluateAnalysisReadiness(document);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const components = base.model.components ?? [];

  if (analysisType === "CONTINGENCY_N_1") {
    const candidates = components.filter((component) => component.inService && ["LINE", "TRANSFORMER_2W"].includes(component.kind));
    const selected = new Set(Array.isArray(options.selectedComponentIds) ? options.selectedComponentIds : []);
    const filtered = selected.size ? candidates.filter((component) => selected.has(component.id)) : candidates;
    if (!filtered.length) {
      errors.push(issue("NO_CONTINGENCY_CANDIDATES", "No existen líneas o transformadores seleccionados para el análisis N-1."));
    }
    if (filtered.length > 50) {
      warnings.push(issue("MANY_CONTINGENCIES", `Se solicitaron ${filtered.length} contingencias; la ejecución puede tardar varios minutos.`));
    }
  }

  if (analysisType === "OPERATING_CASE_SWEEP") {
    const selected = new Set(Array.isArray(options.caseIds) ? options.caseIds : []);
    const cases = Array.isArray(document.operatingCases) ? document.operatingCases : [];
    const count = selected.size || cases.length;
    if (!count) errors.push(issue("NO_OPERATING_CASES", "No existen casos de operación para ejecutar."));
    if (count === 1) warnings.push(issue("SINGLE_OPERATING_CASE", "El barrido contiene un solo caso; no habrá comparación entre escenarios."));
  }

  if (analysisType === "LOADABILITY") {
    const loads = components.filter((component) => component.kind === "LOAD" && component.inService);
    const selected = new Set(Array.isArray(options.selectedComponentIds) ? options.selectedComponentIds : []);
    const filtered = selected.size ? loads.filter((component) => selected.has(component.id)) : loads;
    if (!filtered.length) errors.push(issue("NO_LOADS_SELECTED", "No existe ninguna carga en servicio seleccionada para el barrido de cargabilidad."));
    const start = Number(options.startMultiplier ?? 1);
    const maximum = Number(options.maximumMultiplier ?? 2);
    const step = Number(options.step ?? 0.05);
    if (!Number.isFinite(start) || start <= 0) errors.push(issue("INVALID_START_MULTIPLIER", "El multiplicador inicial debe ser mayor que cero."));
    if (!Number.isFinite(maximum) || maximum < start) errors.push(issue("INVALID_MAXIMUM_MULTIPLIER", "El multiplicador máximo debe ser mayor o igual al inicial."));
    if (!Number.isFinite(step) || step <= 0) errors.push(issue("INVALID_LOADABILITY_STEP", "El incremento del barrido debe ser mayor que cero."));
  }

  if (analysisType === "DC_POWER_FLOW") {
    const reactiveOnlyWarnings = new Set([
      "REACTIVE_LIMITS_MISSING",
      "GENERATOR_VOLTAGE_SETPOINT_MISSING",
      "LOAD_REACTIVE_DATA_MISSING",
    ]);
    return {
      ...base,
      readiness: errors.length ? "NOT_READY" : warnings.filter((item) => !reactiveOnlyWarnings.has(item.code)).length ? "READY_WITH_ASSUMPTIONS" : "READY",
      errors,
      warnings: warnings.filter((item) => !reactiveOnlyWarnings.has(item.code)),
    };
  }

  return {
    ...base,
    readiness: errors.length ? "NOT_READY" : warnings.length ? "READY_WITH_ASSUMPTIONS" : "READY",
    errors,
    warnings,
  };
}
