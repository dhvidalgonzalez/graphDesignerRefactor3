export const COMMON_ELECTRICAL_FIELDS = [
  { key: "description", label: "Descripción técnica", type: "textarea", section: "Identificación" },
  { key: "assetCode", label: "Código del activo", type: "text", section: "Identificación" },
  { key: "manufacturer", label: "Fabricante", type: "text", section: "Identificación" },
  { key: "model", label: "Modelo", type: "text", section: "Identificación" },
  { key: "commissioningYear", label: "Año de puesta en servicio", type: "number", min: 1900, max: 2200, step: 1, section: "Identificación" },
];

export const LINE_ELECTRICAL_FIELDS = [
  { key: "name", label: "Nombre", type: "text", section: "Identificación" },
  { key: "voltageLevelId", label: "Nivel de voltaje nominal", type: "voltage", section: "Datos nominales" },
  { key: "lengthKm", label: "Longitud", type: "number", min: 0, step: 0.001, unit: "km", section: "Datos nominales" },
  { key: "circuitCount", label: "Número de circuitos", type: "number", min: 1, step: 1, section: "Datos nominales" },
  { key: "conductor", label: "Conductor", type: "text", section: "Datos nominales" },
  { key: "ratedCurrentA", label: "Corriente nominal", type: "number", min: 0, step: 1, unit: "A", section: "Datos nominales" },
  { key: "resistanceOhmPerKm", label: "Resistencia R1", type: "number", min: 0, step: 0.0001, unit: "Ω/km", section: "Parámetros eléctricos" },
  { key: "reactanceOhmPerKm", label: "Reactancia X1", type: "number", min: 0, step: 0.0001, unit: "Ω/km", section: "Parámetros eléctricos" },
  { key: "susceptanceUsPerKm", label: "Susceptancia B1", type: "number", min: 0, step: 0.001, unit: "µS/km", section: "Parámetros eléctricos" },
  { key: "outOfService", label: "Fuera de servicio", type: "checkbox", section: "Estado" },
];
