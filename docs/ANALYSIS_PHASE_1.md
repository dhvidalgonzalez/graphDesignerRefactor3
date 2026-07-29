# Módulo de análisis eléctricos — fase 1

## Objetivo

Preparar un documento reproducible y validable para que una Lambda orquestadora pueda solicitar estudios por referencia en la siguiente fase.

## Documento V3

```js
{
  schemaVersion: 3,
  id,
  name,
  metadata,
  nodes,
  edges,
  electricalModel,
  operatingCases,
  analysisConfiguration,
  updatedAt
}
```

### `electricalModel`

Es una proyección normalizada del dibujo. Se deriva automáticamente y no debe editarse directamente desde componentes React.

### `operatingCases`

Siempre existe al menos un caso, por defecto:

```js
{
  id: "case-normal",
  name: "Operación normal",
  isDefault: true,
  overrides: {}
}
```

Los overrides usan el ID estable del componente lógico:

```js
{
  "load-1": {
    inService: true,
    activePowerKw: 25000,
    reactivePowerKvar: 8000
  }
}
```

### `analysisConfiguration`

```js
{
  defaultAnalysisType: "POWER_FLOW",
  defaultExecutionPreference: "AUTO",
  solverOptions: {
    algorithm: "NEWTON_RAPHSON",
    tolerance: 0.000001,
    maximumIterations: 20,
    initializeFromPreviousResult: false,
    calculateVoltageAngles: true,
    enforceReactiveLimits: true
  },
  validationOptions: {
    allowAssumedParameters: true,
    requireThermalLimits: false
  }
}
```

## Solicitud semántica

La vista previa respeta el contrato que utilizará la Lambda:

```json
{
  "diagramId": "diagram-123",
  "operatingCaseId": "case-normal",
  "analysisType": "POWER_FLOW",
  "executionPreference": "AUTO",
  "expectedDiagramVersion": 18,
  "clientRequestId": "request-uuid"
}
```

El frontend no envía un `storageKey` ni el documento completo.

## Snapshot de prueba

El panel permite descargar un `analysis-input-preview.json` con:

- versión del diagrama;
- caso de operación aplicado;
- opciones de solver;
- validación;
- modelo eléctrico lógico.

Es sólo una vista previa local. La fase 2 deberá generar el snapshot definitivo desde el backend después de validar permisos, versión, plan y consumo.

## Estado de preparación

```text
NOT_READY
READY_WITH_ASSUMPTIONS
READY
```

La validación local orienta al usuario, pero no reemplaza la validación autoritativa del backend.

## Migración

- V1 se convierte primero a V2 y luego a V3.
- V2 recibe casos, configuración, trazabilidad y modelo lógico.
- V3 se normaliza y resincroniza.
- Las entidades visuales y sus IDs se conservan cuando son válidos.

## Archivos principales

```text
src/domain/electrical/parameterValue.js
src/domain/electrical/electricalModel.js
src/domain/analysis/analysisConfiguration.js
src/domain/analysis/operatingCases.js
src/domain/analysis/analysisReadiness.js
src/domain/analysis/createAnalysisInput.js
src/components/analysis/AnalysisPanel.jsx
src/domain/diagram/migrateV2.js
```
