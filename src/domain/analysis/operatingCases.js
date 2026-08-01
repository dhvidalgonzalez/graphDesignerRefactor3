import { createId } from "../../utils/id.js";

export function createDefaultOperatingCase(overrides = {}) {
  return {
    id: overrides.id ?? "case-normal",
    name: overrides.name ?? "Operación normal",
    description: overrides.description ?? "Caso base del diagrama.",
    isDefault: overrides.isDefault ?? true,
    overrides: structuredClone(overrides.overrides ?? {}),
  };
}

export function normalizeOperatingCases(cases) {
  const input = Array.isArray(cases) && cases.length ? cases : [createDefaultOperatingCase()];
  const seen = new Set();
  const normalized = input.map((candidate, index) => {
    let id = String(candidate?.id || createId("case"));
    while (seen.has(id)) id = createId("case");
    seen.add(id);
    return {
      id,
      name: String(candidate?.name || `Caso ${index + 1}`),
      description: String(candidate?.description || ""),
      isDefault: Boolean(candidate?.isDefault),
      overrides: candidate?.overrides && typeof candidate.overrides === "object"
        ? structuredClone(candidate.overrides)
        : {},
    };
  });

  const requestedDefault = normalized.findIndex((item) => item.isDefault);
  const defaultIndex = requestedDefault >= 0 ? requestedDefault : 0;
  return normalized.map((item, index) => ({ ...item, isDefault: index === defaultIndex }));
}

export function createOperatingCase(name = "Nuevo caso") {
  return createDefaultOperatingCase({
    id: createId("case"),
    name,
    description: "",
    isDefault: false,
  });
}

export function getOperatingCase(document, caseId) {
  const cases = normalizeOperatingCases(document.operatingCases);
  return cases.find((item) => item.id === caseId) ?? cases.find((item) => item.isDefault) ?? cases[0];
}

export function applyOperatingCaseToComponent(component, operatingCase) {
  const override = operatingCase?.overrides?.[component.id] ?? {};
  const baseInService = component?.operatingState?.inService
    ?? component?.inService
    ?? !Boolean(component.parameters?.outOfService?.value);
  return {
    ...component,
    operatingState: {
      inService: override.inService ?? Boolean(baseInService),
      ...(override.activePowerKw !== undefined ? { activePowerKw: Number(override.activePowerKw) } : {}),
      ...(override.reactivePowerKvar !== undefined ? { reactivePowerKvar: Number(override.reactivePowerKvar) } : {}),
      ...(override.voltageSetpointPu !== undefined ? { voltageSetpointPu: Number(override.voltageSetpointPu) } : {}),
      ...(override.tapPosition !== undefined ? { tapPosition: Number(override.tapPosition) } : {}),
      ...(override.switchClosed !== undefined ? { switchClosed: Boolean(override.switchClosed) } : {}),
    },
  };
}
