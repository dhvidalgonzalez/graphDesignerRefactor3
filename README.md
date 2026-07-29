# GestionDiagrams — Análisis eléctricos, fase 1

Aplicación React + Vite + React Konva para gestionar proyectos eléctricos y editar diagramas unifilares sobre **AWS Amplify Gen 2**. Esta entrega amplía el proyecto existente sin reemplazar su arquitectura de autenticación, pagos, proyectos ni almacenamiento.

La fase 1 prepara el dato técnico que utilizará el futuro backend de cálculo:

```text
Editor gráfico
    ↓
Documento de diagrama V3
    ├── visualModel: nodes + edges
    ├── electricalModel: components + terminals + connectionNodes
    ├── operatingCases
    └── analysisConfiguration
    ↓
Validación de preparación
    ↓
Vista previa de solicitud semántica e input.json
```

## Alcance implementado

- Conservación del editor gráfico, Cognito, proyectos, invitaciones, S3 y pagos existentes.
- Migración automática de documentos V1/V2 al esquema **V3**.
- Trazabilidad por parámetro: `DEFAULT`, `USER`, `CATALOG`, `IMPORTED`, `CALCULATED`.
- Estado por parámetro: `MISSING`, `ASSUMED`, `CONFIRMED`.
- Modelo eléctrico lógico desacoplado de Konva:
  - componentes;
  - terminales;
  - nodos de conexión;
  - IDs estables vinculados a los elementos gráficos.
- Diferenciación entre:
  - `path`: conexión ideal, sin impedancia y dentro del mismo nodo eléctrico;
  - `line`: componente físico con dos terminales, R, X, longitud y límite térmico;
  - `switch`: componente explícito cuyo estado se procesará como abierto o cerrado.
- Parámetros iniciales para barras, cargas, generadores, red externa, líneas, transformadores, interruptores y shunts.
- Casos de operación sin duplicar el diagrama.
- Overrides por componente: servicio, P, Q, consigna de tensión, tap y estado de interruptor.
- Configuración preparatoria del solver: algoritmo, tolerancia, iteraciones y reglas de validación.
- Validación previa sin consumo de unidades:
  - Slack inexistente;
  - isla energizada sin referencia;
  - terminales incompletos;
  - líneas inválidas;
  - transformadores incompletos;
  - cargas y generadores sin datos suficientes;
  - parámetros asumidos;
  - límites térmicos y reactivos faltantes.
- Panel **Análisis** integrado en el editor:
  - preparación;
  - casos de operación;
  - configuración del solver;
  - inspección del modelo lógico;
  - descarga de una solicitud y un `input.json` de prueba.
- Modelos Amplify Data preparados para la fase serverless:
  - `AnalysisStudy`;
  - `UsagePeriod`;
  - `UsageLedgerEntry`.
- Entitlements iniciales de análisis en los planes existentes.

## Deliberadamente pendiente

Esta entrega **no ejecuta todavía un flujo de carga**. No incluye:

- Lambda orquestadora;
- worker/solver en imagen Docker;
- reserva o consumo real de unidades;
- escritura de `input.json`, `result.json` o `diagnostics.json` en S3;
- historial real de estudios;
- montaje de resultados sobre el canvas.

Esas piezas corresponden a la fase 2 y fase 3. La interfaz actual sólo prepara, valida y exporta el contrato que consumirán.

## Persistencia

DynamoDB mantiene metadatos consultables:

```text
UserProfile
Workspace
Project
Diagram
ProjectMember
ProjectInvitation
Subscription / Billing
AnalysisStudy
UsagePeriod
UsageLedgerEntry
```

S3 mantiene el documento completo del diagrama:

```text
projects/<projectId>/diagrams/<diagramId>/document.json
```

La fase 2 agregará:

```text
power-flow/<workspaceId>/<diagramId>/studies/<studyId>/input.json
power-flow/<workspaceId>/<diagramId>/studies/<studyId>/result.json
power-flow/<workspaceId>/<diagramId>/studies/<studyId>/diagnostics.json
```

## Inicio local

```bash
npm ci
npm run dev
```

Para levantar Amplify Gen 2:

```bash
npm run sandbox
```

## Validación

```bash
npm run lint
npm run test
npm run build
```

Consulta `VALIDATION.md` para conocer qué comprobaciones pudieron ejecutarse en el entorno de entrega.

## Documentación

- `docs/ANALYSIS_PHASE_1.md`
- `docs/ANALYSIS_SERVERLESS_PHASE_2.md`
- `docs/ELECTRICAL_MODEL.md`
- `docs/DATA_MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/PROJECT_MODEL.md`
- `docs/SERVICE_CATALOG.md`
