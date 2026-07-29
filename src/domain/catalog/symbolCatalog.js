import ElmCoupSymbol from "./symbols/ElmCoupSymbol.jsx";
import ElmGenstatSymbol from "./symbols/ElmGenstatSymbol.jsx";
import ElmLodSymbol from "./symbols/ElmLodSymbol.jsx";
import ElmShntSymbol from "./symbols/ElmShntSymbol.jsx";
import ElmSymSymbol from "./symbols/ElmSymSymbol.jsx";
import ElmTermSymbol from "./symbols/ElmTermSymbol.jsx";
import ElmTr2Symbol from "./symbols/ElmTr2Symbol.jsx";
import ElmTr3Symbol from "./symbols/ElmTr3Symbol.jsx";
import {
  AnnotationCircleSymbol,
  AnnotationRectangleSymbol,
  AnnotationSquareSymbol,
  AnnotationTextSymbol,
} from "./symbols/AnnotationSymbols.jsx";
import { rotatePoint } from "../geometry/point.js";
import { COMMON_ELECTRICAL_FIELDS } from "../electrical/electricalFields.js";
import { getVoltageColor as resolveVoltageColor } from "../electrical/voltageLevels.js";

const COMMON_FIELDS = [
  { key: "name", label: "Nombre", type: "text" },
  { key: "outOfService", label: "Fuera de servicio", type: "checkbox" },
];

const VOLTAGE_FIELD = { key: "voltageLevelId", label: "Nivel de voltaje", type: "voltage" };
const staticPorts = (ports) => () => ports;
const staticBounds = (bounds) => () => bounds;

const DEFAULT_ADVANCED = {
  description: "",
  assetCode: "",
  manufacturer: "",
  model: "",
  commissioningYear: "",
};

const equipmentDefinition = ({
  type,
  displayName,
  shortLabel,
  category,
  component,
  name,
  ports,
  bounds,
  labelPlacement,
  fields = [],
  electricalFields = [],
  defaultProperties = {},
  defaultElectricalProperties = {},
}) => ({
  type,
  displayName,
  shortLabel,
  category,
  component,
  insertable: true,
  voltageBoundary: false,
  voltagePropertiesByPort: null,
  defaultProperties: {
    name,
    voltageLevelId: null,
    outOfService: false,
    ...DEFAULT_ADVANCED,
    ...defaultElectricalProperties,
    ...defaultProperties,
  },
  fields: [...COMMON_FIELDS, VOLTAGE_FIELD, ...fields],
  electricalFields: [
    ...COMMON_ELECTRICAL_FIELDS,
    { key: "voltageLevelId", label: "Nivel de voltaje nominal", type: "voltage", section: "Datos nominales" },
    ...electricalFields,
    { key: "outOfService", label: "Fuera de servicio", type: "checkbox", section: "Estado" },
  ],
  getPorts: staticPorts(ports),
  getBounds: staticBounds(bounds),
  labelPlacement,
});

export const SYMBOL_CATALOG = {
  ElmTr2: {
    type: "ElmTr2",
    displayName: "Transformador de 2 devanados",
    shortLabel: "TR2",
    category: "Transformación",
    component: ElmTr2Symbol,
    insertable: true,
    voltageBoundary: true,
    voltagePropertiesByPort: { "1": "voltageLevelId1", "2": "voltageLevelId2" },
    defaultProperties: {
      name: "TR2",
      voltageLevelId1: null,
      voltageLevelId2: null,
      outOfService: false,
      ...DEFAULT_ADVANCED,
      ratedPowerMVA: 50,
      vectorGroup: "YNd11",
      impedancePercent: 12,
      resistancePercent: 0.5,
      noLoadLossKw: 0,
      magnetizingCurrentPercent: 0,
      tapPosition: 0,
      tapMin: -8,
      tapMax: 8,
      tapStepPercent: 1.25,
      cooling: "ONAN",
    },
    fields: [
      ...COMMON_FIELDS,
      { key: "voltageLevelId1", label: "Voltaje primario", type: "voltage" },
      { key: "voltageLevelId2", label: "Voltaje secundario", type: "voltage" },
    ],
    electricalFields: [
      ...COMMON_ELECTRICAL_FIELDS,
      { key: "voltageLevelId1", label: "Nivel devanado 1", type: "voltage", section: "Devanados" },
      { key: "voltageLevelId2", label: "Nivel devanado 2", type: "voltage", section: "Devanados" },
      { key: "ratedPowerMVA", label: "Potencia nominal", type: "number", min: 0, step: 0.1, unit: "MVA", section: "Datos nominales" },
      { key: "vectorGroup", label: "Grupo vectorial", type: "text", section: "Datos nominales" },
      { key: "impedancePercent", label: "Impedancia de cortocircuito", type: "number", min: 0, step: 0.01, unit: "%", section: "Parámetros eléctricos" },
      { key: "resistancePercent", label: "Resistencia de cortocircuito", type: "number", min: 0, step: 0.001, unit: "%", section: "Parámetros eléctricos" },
      { key: "noLoadLossKw", label: "Pérdidas en vacío", type: "number", min: 0, step: 0.01, unit: "kW", section: "Parámetros eléctricos" },
      { key: "magnetizingCurrentPercent", label: "Corriente de magnetización", type: "number", min: 0, step: 0.001, unit: "%", section: "Parámetros eléctricos" },
      { key: "tapPosition", label: "Posición del tap", type: "number", step: 1, section: "Regulación" },
      { key: "tapMin", label: "Tap mínimo", type: "number", step: 1, section: "Regulación" },
      { key: "tapMax", label: "Tap máximo", type: "number", step: 1, section: "Regulación" },
      { key: "tapStepPercent", label: "Paso por tap", type: "number", min: 0, step: 0.001, unit: "%", section: "Regulación" },
      { key: "cooling", label: "Refrigeración", type: "select", options: ["ONAN", "ONAF", "OFAF", "ODAF"], section: "Datos nominales" },
      { key: "outOfService", label: "Fuera de servicio", type: "checkbox", section: "Estado" },
    ],
    getPorts: staticPorts([
      { id: "1", name: "Primario", x: 0, y: -5 },
      { id: "2", name: "Secundario", x: 0, y: 5 },
    ]),
    getBounds: staticBounds({ x: -7, y: -8, width: 28, height: 16 }),
    labelPlacement: { x: 7, y: -3, width: 22, align: "left" },
  },

  ElmTr3: {
    type: "ElmTr3",
    displayName: "Transformador de 3 devanados",
    shortLabel: "TR3",
    category: "Transformación",
    component: ElmTr3Symbol,
    insertable: true,
    voltageBoundary: true,
    voltagePropertiesByPort: { "1": "voltageLevelId1", "2": "voltageLevelId2", "3": "voltageLevelId3" },
    defaultProperties: {
      name: "TR3",
      voltageLevelId1: null,
      voltageLevelId2: null,
      voltageLevelId3: null,
      outOfService: false,
      ...DEFAULT_ADVANCED,
      ratedPowerMVA: 80,
      vectorGroup: "YNyn0d11",
      impedance12Percent: 12,
      impedance13Percent: 18,
      impedance23Percent: 8,
      tapPosition: 0,
    },
    fields: [
      ...COMMON_FIELDS,
      { key: "voltageLevelId1", label: "Voltaje devanado 1", type: "voltage" },
      { key: "voltageLevelId2", label: "Voltaje devanado 2", type: "voltage" },
      { key: "voltageLevelId3", label: "Voltaje devanado 3", type: "voltage" },
    ],
    electricalFields: [
      ...COMMON_ELECTRICAL_FIELDS,
      { key: "voltageLevelId1", label: "Nivel devanado 1", type: "voltage", section: "Devanados" },
      { key: "voltageLevelId2", label: "Nivel devanado 2", type: "voltage", section: "Devanados" },
      { key: "voltageLevelId3", label: "Nivel devanado 3", type: "voltage", section: "Devanados" },
      { key: "ratedPowerMVA", label: "Potencia nominal", type: "number", min: 0, step: 0.1, unit: "MVA", section: "Datos nominales" },
      { key: "vectorGroup", label: "Grupo vectorial", type: "text", section: "Datos nominales" },
      { key: "impedance12Percent", label: "Impedancia 1–2", type: "number", min: 0, step: 0.01, unit: "%", section: "Parámetros eléctricos" },
      { key: "impedance13Percent", label: "Impedancia 1–3", type: "number", min: 0, step: 0.01, unit: "%", section: "Parámetros eléctricos" },
      { key: "impedance23Percent", label: "Impedancia 2–3", type: "number", min: 0, step: 0.01, unit: "%", section: "Parámetros eléctricos" },
      { key: "tapPosition", label: "Posición del tap", type: "number", step: 1, section: "Regulación" },
      { key: "outOfService", label: "Fuera de servicio", type: "checkbox", section: "Estado" },
    ],
    getPorts: staticPorts([
      { id: "1", name: "Devanado 1", x: 0, y: -5 },
      { id: "2", name: "Devanado 2", x: -2, y: 5 },
      { id: "3", name: "Devanado 3", x: 2, y: 5 },
    ]),
    getBounds: staticBounds({ x: -8, y: -8, width: 32, height: 18 }),
    labelPlacement: { x: 7, y: -3, width: 24, align: "left" },
  },

  ElmTerm: {
    ...equipmentDefinition({
      type: "ElmTerm",
      displayName: "Terminal / barra",
      shortLabel: "TERM",
      category: "Conexión",
      component: ElmTermSymbol,
      name: "Barra",
      ports: [],
      bounds: { x: -17, y: -6, width: 34, height: 12 },
      labelPlacement: { x: -15, y: -8, width: 30, align: "center" },
      fields: [
        { key: "sizeX", label: "Escala horizontal", type: "number", min: 0.25, step: 0.25 },
        { key: "symbolName", label: "Variante", type: "select", options: ["PointTerm", "LineTerm", "TermStrip", "ShortTermStrip"] },
      ],
      defaultProperties: { sizeX: 1, symbolName: "TermStrip" },
      defaultElectricalProperties: { shortCircuitCurrentKA: 25, grounding: "Solidamente aterrizada", substation: "", area: "", busType: "PQ", voltageSetpointPu: 1, minimumVoltagePu: 0.95, maximumVoltagePu: 1.05 },
      electricalFields: [
        { key: "busType", label: "Tipo de barra", type: "select", options: [{ value: "PQ", label: "PQ" }, { value: "PV", label: "PV" }, { value: "SLACK", label: "Slack / referencia" }], section: "Flujo de carga" },
        { key: "voltageSetpointPu", label: "Consigna de tensión", type: "number", min: 0.5, max: 1.5, step: 0.001, unit: "p.u.", section: "Flujo de carga" },
        { key: "minimumVoltagePu", label: "Tensión mínima admisible", type: "number", min: 0.5, max: 1.5, step: 0.001, unit: "p.u.", section: "Límites" },
        { key: "maximumVoltagePu", label: "Tensión máxima admisible", type: "number", min: 0.5, max: 1.5, step: 0.001, unit: "p.u.", section: "Límites" },
        { key: "shortCircuitCurrentKA", label: "Corriente de cortocircuito", type: "number", min: 0, step: 0.1, unit: "kA", section: "Datos nominales" },
        { key: "grounding", label: "Puesta a tierra", type: "select", options: ["Solidamente aterrizada", "Impedancia", "Aislada", "Compensada"], section: "Configuración" },
        { key: "substation", label: "Subestación", type: "text", section: "Ubicación" },
        { key: "area", label: "Área / zona", type: "text", section: "Ubicación" },
      ],
    }),
    getPorts(node) {
      const customPorts = node.ports ?? [];
      const symbolName = node.properties.symbolName ?? "TermStrip";
      const sizeX = Number(node.properties.sizeX ?? 1);
      const basePorts = symbolName === "PointTerm" || symbolName === "LineTerm"
        ? [{ id: "1", name: "Terminal", x: 0, y: 0 }]
        : (() => {
            const logicalWidth = 10 * sizeX;
            return [
              { id: "1", name: "Derecha", x: logicalWidth / 2, y: 0 },
              { id: "2", name: "Izquierda", x: -logicalWidth / 2, y: 0 },
            ];
          })();
      return [...basePorts, ...customPorts.filter((port) => !basePorts.some((base) => String(base.id) === String(port.id)))];
    },
    getBounds(node) {
      const width = 30 * Number(node.properties.sizeX ?? 1);
      return { x: -width / 2 - 2, y: -6, width: width + 4, height: 12 };
    },
    dynamicPort: {
      project(node, point) {
        const width = 30 * Number(node.properties.sizeX ?? 1);
        return { x: Math.max(-width / 2, Math.min(width / 2, point.x)), y: 0 };
      },
      reuseDistance: 1.5,
    },
  },

  ElmCoup: equipmentDefinition({
    type: "ElmCoup",
    displayName: "Acoplador / interruptor",
    shortLabel: "COUP",
    category: "Conexión",
    component: ElmCoupSymbol,
    name: "Acoplador",
    ports: [
      { id: "1", name: "Superior", x: 0, y: -5 },
      { id: "2", name: "Inferior", x: 0, y: 5 },
    ],
    bounds: { x: -5, y: -8, width: 10, height: 16 },
    labelPlacement: { x: 5, y: -3, width: 22, align: "left" },
    defaultElectricalProperties: { switchingState: "Cerrado", ratedCurrentA: 1250, interruptingCurrentKA: 25, breakerType: "Interruptor" },
    electricalFields: [
      { key: "switchingState", label: "Estado de maniobra", type: "select", options: ["Cerrado", "Abierto"], section: "Estado" },
      { key: "breakerType", label: "Tipo", type: "select", options: ["Interruptor", "Seccionador", "Acoplador"], section: "Datos nominales" },
      { key: "ratedCurrentA", label: "Corriente nominal", type: "number", min: 0, step: 1, unit: "A", section: "Datos nominales" },
      { key: "interruptingCurrentKA", label: "Poder de corte", type: "number", min: 0, step: 0.1, unit: "kA", section: "Datos nominales" },
    ],
  }),

  ElmLod: equipmentDefinition({
    type: "ElmLod",
    displayName: "Carga",
    shortLabel: "LOAD",
    category: "Equipos",
    component: ElmLodSymbol,
    name: "Carga",
    ports: [{ id: "1", name: "Conexión", x: 0, y: -13 }],
    bounds: { x: -7, y: -16, width: 14, height: 23 },
    labelPlacement: { x: 6, y: 1, width: 20, align: "left" },
    defaultElectricalProperties: { activePowerMW: 10, reactivePowerMvar: 3, powerFactor: 0.96, loadModel: "PQ constante" },
    electricalFields: [
      { key: "activePowerMW", label: "Potencia activa", type: "number", step: 0.001, unit: "MW", section: "Demanda" },
      { key: "reactivePowerMvar", label: "Potencia reactiva", type: "number", step: 0.001, unit: "MVAr", section: "Demanda" },
      { key: "powerFactor", label: "Factor de potencia", type: "number", min: -1, max: 1, step: 0.001, section: "Demanda" },
      { key: "loadModel", label: "Modelo", type: "select", options: ["PQ constante", "Z constante", "I constante", "ZIP"], section: "Modelo eléctrico" },
    ],
  }),

  ElmSym: equipmentDefinition({
    type: "ElmSym",
    displayName: "Máquina síncrona",
    shortLabel: "SYM",
    category: "Máquinas",
    component: ElmSymSymbol,
    name: "Generador",
    ports: [{ id: "1", name: "Conexión", x: 0, y: -13 }],
    bounds: { x: -6, y: -16, width: 12, height: 23 },
    labelPlacement: { x: 6, y: 0, width: 22, align: "left" },
    defaultElectricalProperties: { sourceType: "GENERATOR", controlMode: "PV", ratedPowerMVA: 50, activePowerMW: 40, reactivePowerMvar: 5, voltageSetpointPu: 1, minimumReactivePowerMvar: -25, maximumReactivePowerMvar: 25, xdPerUnit: 1.8, inertiaSeconds: 4 },
    electricalFields: [
      { key: "sourceType", label: "Tipo de fuente", type: "select", options: [{ value: "GENERATOR", label: "Generador" }, { value: "EXTERNAL_GRID", label: "Red externa" }], section: "Flujo de carga" },
      { key: "controlMode", label: "Modo de control", type: "select", options: [{ value: "PQ", label: "PQ" }, { value: "PV", label: "PV" }, { value: "SLACK", label: "Slack / referencia" }], section: "Flujo de carga" },
      { key: "voltageSetpointPu", label: "Consigna de tensión", type: "number", min: 0.5, max: 1.5, step: 0.001, unit: "p.u.", section: "Flujo de carga" },
      { key: "minimumReactivePowerMvar", label: "Límite reactivo mínimo", type: "number", step: 0.001, unit: "MVAr", section: "Límites" },
      { key: "maximumReactivePowerMvar", label: "Límite reactivo máximo", type: "number", step: 0.001, unit: "MVAr", section: "Límites" },
      { key: "ratedPowerMVA", label: "Potencia nominal", type: "number", min: 0, step: 0.1, unit: "MVA", section: "Datos nominales" },
      { key: "activePowerMW", label: "Potencia activa", type: "number", step: 0.001, unit: "MW", section: "Despacho" },
      { key: "reactivePowerMvar", label: "Potencia reactiva", type: "number", step: 0.001, unit: "MVAr", section: "Despacho" },
      { key: "xdPerUnit", label: "Reactancia síncrona Xd", type: "number", min: 0, step: 0.001, unit: "p.u.", section: "Parámetros eléctricos" },
      { key: "inertiaSeconds", label: "Constante de inercia H", type: "number", min: 0, step: 0.01, unit: "s", section: "Parámetros eléctricos" },
    ],
  }),

  ElmShnt: equipmentDefinition({
    type: "ElmShnt",
    displayName: "Compensador shunt",
    shortLabel: "SHNT",
    category: "Compensación",
    component: ElmShntSymbol,
    name: "Shunt",
    ports: [{ id: "1", name: "Conexión", x: 0, y: -13 }],
    bounds: { x: -6, y: -16, width: 12, height: 23 },
    labelPlacement: { x: 6, y: 0, width: 22, align: "left" },
    defaultElectricalProperties: { reactivePowerMvar: 10, steps: 1, controlMode: "Fijo" },
    electricalFields: [
      { key: "reactivePowerMvar", label: "Potencia reactiva", type: "number", step: 0.001, unit: "MVAr", section: "Datos nominales" },
      { key: "steps", label: "Número de pasos", type: "number", min: 1, step: 1, section: "Datos nominales" },
      { key: "controlMode", label: "Modo de control", type: "select", options: ["Fijo", "Voltaje", "Reactivo", "Factor de potencia"], section: "Control" },
    ],
  }),

  ElmGenstat: equipmentDefinition({
    type: "ElmGenstat",
    displayName: "Generador estático",
    shortLabel: "GEN",
    category: "Máquinas",
    component: ElmGenstatSymbol,
    name: "GenStat",
    ports: [{ id: "1", name: "Conexión", x: 0, y: -13 }],
    bounds: { x: -6, y: -16, width: 12, height: 25 },
    labelPlacement: { x: 6, y: 0, width: 22, align: "left" },
    defaultElectricalProperties: { sourceType: "GENERATOR", ratedPowerMVA: 20, activePowerMW: 15, reactivePowerMvar: 0, voltageSetpointPu: 1, minimumReactivePowerMvar: -10, maximumReactivePowerMvar: 10, technology: "Fotovoltaica", controlMode: "PQ" },
    electricalFields: [
      { key: "sourceType", label: "Tipo de fuente", type: "select", options: [{ value: "GENERATOR", label: "Generador" }, { value: "EXTERNAL_GRID", label: "Red externa" }], section: "Flujo de carga" },
      { key: "voltageSetpointPu", label: "Consigna de tensión", type: "number", min: 0.5, max: 1.5, step: 0.001, unit: "p.u.", section: "Flujo de carga" },
      { key: "minimumReactivePowerMvar", label: "Límite reactivo mínimo", type: "number", step: 0.001, unit: "MVAr", section: "Límites" },
      { key: "maximumReactivePowerMvar", label: "Límite reactivo máximo", type: "number", step: 0.001, unit: "MVAr", section: "Límites" },
      { key: "ratedPowerMVA", label: "Potencia nominal", type: "number", min: 0, step: 0.1, unit: "MVA", section: "Datos nominales" },
      { key: "activePowerMW", label: "Potencia activa", type: "number", step: 0.001, unit: "MW", section: "Despacho" },
      { key: "reactivePowerMvar", label: "Potencia reactiva", type: "number", step: 0.001, unit: "MVAr", section: "Despacho" },
      { key: "technology", label: "Tecnología", type: "select", options: ["Fotovoltaica", "Eólica", "Batería", "Convertidor", "Otro"], section: "Modelo eléctrico" },
      { key: "controlMode", label: "Modo de control", type: "select", options: ["PQ", "PV", "Voltaje", "Factor de potencia"], section: "Control" },
    ],
  }),

  GraphicRectangle: {
    type: "GraphicRectangle",
    displayName: "Rectángulo",
    shortLabel: "RECT",
    category: "Anotaciones",
    component: AnnotationRectangleSymbol,
    insertable: true,
    electrical: false,
    showDefaultLabel: false,
    voltageBoundary: false,
    voltagePropertiesByPort: null,
    defaultProperties: {
      name: "Rectángulo",
      width: 24,
      height: 14,
      fillColor: "#dbeafe",
      strokeColor: "#2563eb",
      strokeWidth: 0.8,
      opacity: 0.35,
      cornerRadius: 0,
    },
    fields: [
      { key: "name", label: "Nombre", type: "text" },
      { key: "width", label: "Ancho", type: "number", min: 2, step: 1 },
      { key: "height", label: "Alto", type: "number", min: 2, step: 1 },
      { key: "fillColor", label: "Color de relleno", type: "color" },
      { key: "strokeColor", label: "Color de borde", type: "color" },
      { key: "strokeWidth", label: "Grosor del borde", type: "number", min: 0.1, step: 0.1 },
      { key: "opacity", label: "Opacidad", type: "number", min: 0.05, max: 1, step: 0.05 },
      { key: "cornerRadius", label: "Radio de esquina", type: "number", min: 0, step: 0.5 },
    ],
    electricalFields: [],
    getPorts: staticPorts([]),
    getBounds(node) {
      const width = Math.max(2, Number(node.properties.width ?? 24));
      const height = Math.max(2, Number(node.properties.height ?? 14));
      return { x: -width / 2, y: -height / 2, width, height };
    },
    labelPlacement: { x: 0, y: 0, width: 0, align: "left" },
  },

  GraphicSquare: {
    type: "GraphicSquare",
    displayName: "Cuadrado",
    shortLabel: "SQR",
    category: "Anotaciones",
    component: AnnotationSquareSymbol,
    insertable: true,
    electrical: false,
    showDefaultLabel: false,
    voltageBoundary: false,
    voltagePropertiesByPort: null,
    defaultProperties: {
      name: "Cuadrado",
      size: 16,
      fillColor: "#dcfce7",
      strokeColor: "#15803d",
      strokeWidth: 0.8,
      opacity: 0.35,
      cornerRadius: 0,
    },
    fields: [
      { key: "name", label: "Nombre", type: "text" },
      { key: "size", label: "Tamaño", type: "number", min: 2, step: 1 },
      { key: "fillColor", label: "Color de relleno", type: "color" },
      { key: "strokeColor", label: "Color de borde", type: "color" },
      { key: "strokeWidth", label: "Grosor del borde", type: "number", min: 0.1, step: 0.1 },
      { key: "opacity", label: "Opacidad", type: "number", min: 0.05, max: 1, step: 0.05 },
      { key: "cornerRadius", label: "Radio de esquina", type: "number", min: 0, step: 0.5 },
    ],
    electricalFields: [],
    getPorts: staticPorts([]),
    getBounds(node) {
      const size = Math.max(2, Number(node.properties.size ?? 16));
      return { x: -size / 2, y: -size / 2, width: size, height: size };
    },
    labelPlacement: { x: 0, y: 0, width: 0, align: "left" },
  },

  GraphicCircle: {
    type: "GraphicCircle",
    displayName: "Círculo",
    shortLabel: "CIRC",
    category: "Anotaciones",
    component: AnnotationCircleSymbol,
    insertable: true,
    electrical: false,
    showDefaultLabel: false,
    voltageBoundary: false,
    voltagePropertiesByPort: null,
    defaultProperties: {
      name: "Círculo",
      radius: 8,
      fillColor: "#fef3c7",
      strokeColor: "#b45309",
      strokeWidth: 0.8,
      opacity: 0.35,
    },
    fields: [
      { key: "name", label: "Nombre", type: "text" },
      { key: "radius", label: "Radio", type: "number", min: 1, step: 1 },
      { key: "fillColor", label: "Color de relleno", type: "color" },
      { key: "strokeColor", label: "Color de borde", type: "color" },
      { key: "strokeWidth", label: "Grosor del borde", type: "number", min: 0.1, step: 0.1 },
      { key: "opacity", label: "Opacidad", type: "number", min: 0.05, max: 1, step: 0.05 },
    ],
    electricalFields: [],
    getPorts: staticPorts([]),
    getBounds(node) {
      const radius = Math.max(1, Number(node.properties.radius ?? 8));
      return { x: -radius, y: -radius, width: radius * 2, height: radius * 2 };
    },
    labelPlacement: { x: 0, y: 0, width: 0, align: "left" },
  },

  GraphicText: {
    type: "GraphicText",
    displayName: "Texto",
    shortLabel: "TXT",
    category: "Anotaciones",
    component: AnnotationTextSymbol,
    insertable: true,
    electrical: false,
    showDefaultLabel: false,
    voltageBoundary: false,
    voltagePropertiesByPort: null,
    defaultProperties: {
      name: "Texto",
      text: "Texto",
      width: 40,
      fontSize: 5,
      fontFamily: "Arial",
      color: "#0f172a",
      align: "left",
      bold: false,
      padding: 0,
    },
    fields: [
      { key: "name", label: "Nombre", type: "text" },
      { key: "text", label: "Contenido", type: "textarea" },
      { key: "width", label: "Ancho del bloque", type: "number", min: 5, step: 1 },
      { key: "fontSize", label: "Tamaño del texto", type: "number", min: 1.5, step: 0.5 },
      { key: "fontFamily", label: "Tipografía", type: "select", options: ["Arial", "Helvetica", "Georgia", "Courier New"] },
      { key: "color", label: "Color", type: "color" },
      { key: "align", label: "Alineación", type: "select", options: ["left", "center", "right"] },
      { key: "bold", label: "Negrita", type: "checkbox" },
    ],
    electricalFields: [],
    getPorts: staticPorts([]),
    getBounds(node) {
      const width = Math.max(5, Number(node.properties.width ?? 40));
      const fontSize = Math.max(1.5, Number(node.properties.fontSize ?? 5));
      const lines = String(node.properties.text ?? "Texto").split("\n").length;
      const height = Math.max(fontSize * 1.35, lines * fontSize * 1.25);
      return { x: -width / 2, y: -fontSize * 0.65, width, height };
    },
    labelPlacement: { x: 0, y: 0, width: 0, align: "left" },
  },

};

export const SYMBOL_TYPES = Object.keys(SYMBOL_CATALOG);

export function getSymbolDefinition(type) {
  const definition = SYMBOL_CATALOG[type];
  if (!definition) throw new Error(`Tipo de símbolo no soportado: ${type}`);
  return definition;
}

export function getInsertableSymbols() {
  return Object.values(SYMBOL_CATALOG).filter((definition) => definition.insertable !== false);
}

export function getNodePorts(node) {
  return getSymbolDefinition(node.type).getPorts(node);
}

export function getNodeBounds(node) {
  return getSymbolDefinition(node.type).getBounds(node);
}

export function getNodePort(node, portId) {
  return getNodePorts(node).find((port) => String(port.id) === String(portId)) ?? null;
}

export function getPortWorldPosition(node, portId) {
  const port = getNodePort(node, portId);
  if (!port) throw new Error(`Puerto ${portId} no encontrado en ${node.type} (${node.id})`);
  const rotated = rotatePoint(port, node.rotation ?? 0);
  return { x: node.position.x + rotated.x, y: node.position.y + rotated.y };
}

export function isVoltageBoundary(node) {
  return Boolean(getSymbolDefinition(node.type).voltageBoundary);
}

export function getVoltagePropertyForPort(node, portId) {
  const definition = getSymbolDefinition(node.type);
  return definition.voltagePropertiesByPort?.[String(portId)] ?? "voltageLevelId";
}

export function getNodePortVoltageLevelId(node, portId) {
  return node.properties[getVoltagePropertyForPort(node, portId)] ?? null;
}

export function setNodePortVoltageLevelId(node, portId, levelId) {
  node.properties[getVoltagePropertyForPort(node, portId)] = levelId;
}

export function getNodeDisplayVoltageLevelIds(node) {
  const definition = getSymbolDefinition(node.type);
  const keys = definition.voltagePropertiesByPort
    ? [...new Set(Object.values(definition.voltagePropertiesByPort))]
    : ["voltageLevelId"];
  return keys.map((key) => node.properties[key]).filter(Boolean);
}

export function getVoltageColor(metadata, voltageLevelId, outOfService = false) {
  return resolveVoltageColor(metadata, voltageLevelId, outOfService);
}

export function listSymbolsByCategory() {
  return getInsertableSymbols().reduce((groups, definition) => {
    const next = { ...groups };
    next[definition.category] = [...(next[definition.category] ?? []), definition];
    return next;
  }, {});
}
