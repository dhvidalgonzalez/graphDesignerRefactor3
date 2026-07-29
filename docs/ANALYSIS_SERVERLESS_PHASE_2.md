# Diseño previsto — fase 2 serverless

Este documento no representa funcionalidad activa. Define la continuación compatible con la fase 1.

## Funciones

### `analysis-orchestrator`

Entrada:

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

Responsabilidades:

1. obtener identidad Cognito;
2. resolver proyecto y workspace desde `diagramId`;
3. verificar rol y suscripción;
4. comprobar `storageVersion`;
5. descargar el documento desde la clave resuelta en DynamoDB;
6. migrar y validar el modelo;
7. reservar unidades con operación atómica e idempotente;
8. crear `AnalysisStudy`;
9. escribir `input.json`;
10. seleccionar `ComputeProvider`;
11. invocar o encolar el worker;
12. responder `studyId`.

### `power-flow-worker`

Entrada conceptual:

```json
{ "studyId": "study-123" }
```

Responsabilidades:

1. leer el estudio;
2. descargar el snapshot;
3. marcar `RUNNING`;
4. adaptar el modelo al solver;
5. ejecutar flujo de carga AC balanceado;
6. escribir `result.json` y `diagnostics.json`;
7. actualizar estado;
8. consumir, liberar o devolver unidades de forma idempotente.

## Infraestructura inicial

- Lambda orquestadora Node.js/TypeScript.
- Worker Lambda basado en imagen Docker.
- Imagen ECR con Python, NumPy, SciPy y el solver seleccionado.
- S3 bajo prefijo `power-flow/`.
- permisos IAM mínimos y separados.

## Modelos ya reservados

`amplify/data/resource.ts` contiene los metadatos base:

- `AnalysisStudy`;
- `UsagePeriod`;
- `UsageLedgerEntry`.

Actualmente sólo tienen lectura dinámica para usuarios autorizados. La fase 2 deberá agregar `allow.resource(...)` exclusivamente a las funciones que escriban estos registros.

## Reglas no negociables

- el cliente nunca decide una clave S3;
- el cliente no selecciona directamente Lambda, Batch, Fargate o EMR;
- una solicitud repetida no crea dos estudios ni reserva dos veces;
- el solver no accede a datos fuera del estudio;
- los resultados completos permanecen en S3;
- DynamoDB conserva estados, referencias, índices y consumo.
