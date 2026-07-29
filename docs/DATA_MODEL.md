# Modelo de datos

## UserProfile

Perfil de aplicación asociado a Cognito.

Campos principales:

- `id`: Cognito `sub`;
- `profileOwner`: identidad `sub::username`;
- `email`;
- `firstName`, `lastName`, `displayName`;
- `personalWorkspaceId`.

## Workspace

Contenedor de proyectos.

- `PERSONAL`: creado automáticamente para cada cuenta;
- `TEAM`: reservado para organizaciones o equipos futuros.

Campos:

- propietario;
- nombre y descripción;
- cantidad de proyectos y miembros;
- relación con proyectos.

## Project

Metadatos del proyecto y listas dinámicas de autorización.

- `ownerIdentities[]`;
- `editorIdentities[]`;
- `viewerIdentities[]`;
- `activeDiagramId`;
- contadores;
- `accessVersion`.

Los arrays incluyen la identidad Cognito compatible con owner authorization. Sólo el propietario y las funciones backend pueden mutar directamente el registro del proyecto; los editores lo leen y operan sobre hojas.

## Diagram

Una hoja dentro del proyecto.

No contiene el documento gráfico.

```text
id
projectId
name
position
storageKey
storageVersion
documentBytes
documentChecksum
lastSavedAt
owner/editor/viewer identities
```

Índice secundario:

```text
projectId + position
```

## ProjectMember

Registro legible de una participación aceptada.

- perfil;
- correo y nombre;
- rol;
- estado;
- identidades para administración y lectura.

## ProjectInvitation

Invitación previa a la membresía.

- proyecto y nombre de proyecto;
- correo destinatario;
- rol propuesto;
- estado;
- invitador;
- vencimiento;
- identidad del propietario;
- correo como claim de destinatario.

Índices:

```text
email + createdAt
projectId + createdAt
```

## Documento S3

Ruta canónica:

```text
projects/<projectId>/diagrams/<diagramId>/document.json
```

El JSON conserva el esquema del editor y puede migrarse independientemente del esquema DynamoDB.

## Documento de diagrama V3

El JSON en S3 agrega tres secciones sin trasladar el documento pesado a DynamoDB:

```text
electricalModel
operatingCases
analysisConfiguration
```

`electricalModel` contiene componentes, terminales y nodos de conexión derivados del modelo visual. Los parámetros incluyen valor, procedencia y estado de confirmación.

## AnalysisStudy

Metadatos de una ejecución futura:

```text
workspaceId / projectId / diagramId
operatingCaseId
analysisType
executionPreference / executionTier / computeProvider
status
clientRequestId
inputDiagramVersion
inputStorageKey / resultStorageKey / diagnosticsStorageKey
engineName / engineVersion
recursos solicitados e identificador del proveedor
reservedUnits / consumedUnits
solicitante y marcas de tiempo
fallo resumido
```

Índices por workspace, diagrama y `clientRequestId`.

## UsagePeriod

Resumen mensual por workspace:

```text
periodKey
periodStart / periodEnd
planCode
includedAnalysisUnits
reservedAnalysisUnits
consumedAnalysisUnits
refundedAnalysisUnits
contadores de resultados
```

## UsageLedgerEntry

Ledger append-only para reserva y consumo:

```text
RESERVE
CONSUME
RELEASE
REFUND
ADJUSTMENT
```

Incluye `idempotencyKey`, unidades, estudio, periodo y motivo. La mutación efectiva queda pendiente de la Lambda de fase 2.
