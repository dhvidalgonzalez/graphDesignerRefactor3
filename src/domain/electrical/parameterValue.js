export const PARAMETER_SOURCES = Object.freeze([
  "DEFAULT",
  "USER",
  "CATALOG",
  "IMPORTED",
  "CALCULATED",
]);

export const PARAMETER_STATUSES = Object.freeze([
  "MISSING",
  "ASSUMED",
  "CONFIRMED",
]);

export function isDefinedParameterValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export function createParameterMetadata({
  source = "DEFAULT",
  status,
  updatedAt,
} = {}, value = null) {
  const normalizedSource = PARAMETER_SOURCES.includes(source) ? source : "IMPORTED";
  const normalizedStatus = PARAMETER_STATUSES.includes(status)
    ? status
    : isDefinedParameterValue(value)
      ? normalizedSource === "DEFAULT" ? "ASSUMED" : "CONFIRMED"
      : "MISSING";

  return {
    source: normalizedSource,
    status: normalizedStatus,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function createParameterValue(value, metadata = {}) {
  return {
    value: isDefinedParameterValue(value) ? value : null,
    ...createParameterMetadata(metadata, value),
  };
}

export function normalizeParameterMetadata(metadata, value, fallbackSource = "IMPORTED") {
  return createParameterMetadata({
    source: metadata?.source ?? fallbackSource,
    status: metadata?.status,
    updatedAt: metadata?.updatedAt,
  }, value);
}

export function markParameterAsUserValue(entity, key, value) {
  entity.parameterMetadata = {
    ...(entity.parameterMetadata ?? {}),
    [key]: createParameterMetadata({
      source: "USER",
      status: isDefinedParameterValue(value) ? "CONFIRMED" : "MISSING",
      updatedAt: new Date().toISOString(),
    }, value),
  };
}

export function patchParameterMetadata(entity, key, patch = {}) {
  const value = entity.properties?.[key];
  const current = normalizeParameterMetadata(entity.parameterMetadata?.[key], value);
  entity.parameterMetadata = {
    ...(entity.parameterMetadata ?? {}),
    [key]: createParameterMetadata({
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }, value),
  };
}

export function getParameterMetadata(entity, key, fallbackSource = "IMPORTED") {
  return normalizeParameterMetadata(entity?.parameterMetadata?.[key], entity?.properties?.[key], fallbackSource);
}
