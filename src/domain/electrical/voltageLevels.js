const DEFAULT_LEVELS = [
  { id: "vl-220", value: 220, unit: "kV", color: "#dc2626", label: "220 kV" },
  { id: "vl-110", value: 110, unit: "kV", color: "#ea580c", label: "110 kV" },
  { id: "vl-66", value: 66, unit: "kV", color: "#7c3aed", label: "66 kV" },
  { id: "vl-33", value: 33, unit: "kV", color: "#2563eb", label: "33 kV" },
  { id: "vl-23", value: 23, unit: "kV", color: "#0891b2", label: "23 kV" },
  { id: "vl-13-8", value: 13.8, unit: "kV", color: "#059669", label: "13,8 kV" },
  { id: "vl-0-4", value: 0.4, unit: "kV", color: "#111827", label: "0,4 kV" },
];

export const DEFAULT_VOLTAGE_LEVELS = Object.freeze(DEFAULT_LEVELS.map((level) => Object.freeze({ ...level })));

export function normalizeVoltageValue(value) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function createVoltageLevelId(value) {
  const normalized = normalizeVoltageValue(value);
  const token = normalized === null
    ? String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    : String(normalized).replace(".", "-").replace("-", "m");
  return `vl-${token || Date.now()}`;
}

export function formatVoltageValue(value, unit = "kV") {
  const normalized = normalizeVoltageValue(value);
  if (normalized === null) return `— ${unit}`;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 }).format(normalized)} ${unit}`;
}

export function createVoltageLevel({ id = null, value, unit = "kV", color = "#111827", label = "" }) {
  const normalized = normalizeVoltageValue(value);
  if (normalized === null || normalized < 0) throw new Error("El nivel de voltaje debe ser un número mayor o igual a cero.");
  return {
    id: id || createVoltageLevelId(normalized),
    value: normalized,
    unit,
    color,
    label: label?.trim() || formatVoltageValue(normalized, unit),
  };
}

export function normalizeVoltageLevels(levels) {
  const source = Array.isArray(levels) && levels.length ? levels : DEFAULT_VOLTAGE_LEVELS;
  const seenIds = new Set();
  const seenValues = new Set();
  return source.reduce((result, raw) => {
    const level = createVoltageLevel(raw);
    const valueKey = `${level.value}:${level.unit}`;
    if (seenIds.has(level.id) || seenValues.has(valueKey)) return result;
    seenIds.add(level.id);
    seenValues.add(valueKey);
    result.push(level);
    return result;
  }, []);
}

export function getVoltageLevels(metadata) {
  return normalizeVoltageLevels(metadata?.voltageLevels);
}

export function getVoltageLevel(metadata, levelId) {
  return getVoltageLevels(metadata).find((level) => level.id === levelId) ?? null;
}

export function findVoltageLevelByValue(metadata, value, unit = "kV") {
  const normalized = normalizeVoltageValue(value);
  if (normalized === null) return null;
  return getVoltageLevels(metadata).find((level) => level.value === normalized && level.unit === unit) ?? null;
}

export function ensureVoltageLevel(document, input) {
  const candidate = typeof input === "object" ? input : { value: input };
  const existing = candidate.id
    ? getVoltageLevel(document.metadata, candidate.id)
    : findVoltageLevelByValue(document.metadata, candidate.value, candidate.unit ?? "kV");
  if (existing) return existing;

  const level = createVoltageLevel(candidate);
  document.metadata.voltageLevels = [...getVoltageLevels(document.metadata), level];
  if (!document.metadata.activeVoltageLevelId) document.metadata.activeVoltageLevelId = level.id;
  return level;
}

export function updateVoltageLevel(document, levelId, patch) {
  const levels = getVoltageLevels(document.metadata);
  const index = levels.findIndex((level) => level.id === levelId);
  if (index < 0) throw new Error("No se encontró el nivel de voltaje.");
  const updated = createVoltageLevel({ ...levels[index], ...patch, id: levelId });
  const duplicate = levels.some((level, levelIndex) => levelIndex !== index && level.value === updated.value && level.unit === updated.unit);
  if (duplicate) throw new Error("Ya existe un nivel de voltaje con ese valor.");
  levels[index] = updated;
  document.metadata.voltageLevels = levels;
  return updated;
}

export function removeVoltageLevel(document, levelId) {
  const levels = getVoltageLevels(document.metadata);
  if (levels.length <= 1) throw new Error("El proyecto debe conservar al menos un nivel de voltaje.");
  document.metadata.voltageLevels = levels.filter((level) => level.id !== levelId);
  if (document.metadata.activeVoltageLevelId === levelId) {
    document.metadata.activeVoltageLevelId = document.metadata.voltageLevels[0]?.id ?? null;
  }
}

export function getVoltageColor(metadata, levelId, outOfService = false) {
  if (outOfService) return "#9ca3af";
  return getVoltageLevel(metadata, levelId)?.color ?? "#111827";
}

export function getActiveVoltageLevelId(metadata) {
  const levels = getVoltageLevels(metadata);
  return levels.some((level) => level.id === metadata?.activeVoltageLevelId)
    ? metadata.activeVoltageLevelId
    : levels[0]?.id ?? null;
}

export function voltageLevelsFromLegacyColors(voltageColors = {}) {
  const levels = Object.entries(voltageColors).map(([value, color]) => createVoltageLevel({ value, color }));
  return normalizeVoltageLevels(levels);
}
