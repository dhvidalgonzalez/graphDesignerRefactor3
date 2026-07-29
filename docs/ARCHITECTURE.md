# Arquitectura Amplify V5

## 1. Principio central

El editor gráfico no conoce Amplify. Continúa consumiendo un objeto de proyecto con hojas y un `DiagramDocument` activo.

```text
React views
    ↓
WorkspaceContext / SessionContext
    ↓
AmplifyProjectRepository
    ↓
Servicios por operación
    ├── Amplify Data client
    └── fetch a URL firmada de S3
```

Esto permite reemplazar infraestructura sin reescribir nodos, puertos, conexiones ni geometría.

## 2. Contextos

### SessionContext

Responsabilidades:

- obtener la sesión Cognito;
- normalizar `sub`, username, email y nombre;
- obtener o crear `UserProfile`;
- obtener o crear el `Workspace` personal;
- exponer `signOut` y `refreshSession`.

No administra proyectos.

### WorkspaceContext

Responsabilidades:

- navegación de workspace/proyecto/editor;
- estados de carga y error;
- CRUD de proyectos y hojas;
- invitaciones;
- coordinación del guardado;
- adaptación de roles a `canEdit` y `canManage`.

No llama directamente a `generateClient`.

### EditorContext

Responsabilidades:

- documento gráfico activo;
- interacción, selección y viewport;
- comandos y undo/redo;
- estado de persistencia visible.

No conoce DynamoDB ni S3.

## 3. Repositorio cloud

`AmplifyProjectRepository` es el límite entre la aplicación y la infraestructura.

```text
list()
get()
create()
updateProject()
createDiagram()
selectDiagram()
renameDiagram()
duplicateDiagram()
deleteDiagram()
moveDiagram()
saveDiagramDocument()
syncProjectDiagrams()
invite()
acceptInvitation()
deleteProject()
```

El repositorio reconstruye la forma de datos que ya usa la UI V4:

```js
{
  id,
  name,
  description,
  owner,
  members,
  diagrams,
  activeDiagramId,
  role,
  canEdit,
  canManage
}
```

## 4. Servicios

Cada operación se encuentra en una carpeta independiente con `index.js`:

```text
services/project/create/index.js
services/project/get/index.js
services/project/list/index.js
services/project/update/index.js
services/project/delete/index.js
services/project/syncDiagrams/index.js
```

El mismo patrón se aplica a diagramas, documentos, perfiles, espacios, membresías e invitaciones. `src/services/index.js` actúa como catálogo general. Las mutaciones sensibles que requieren validar permisos o coordinar recursos se resuelven mediante funciones backend, no desde las vistas.

## 5. Flujo de carga

### Dashboard

1. Cognito autentica.
2. SessionContext garantiza perfil y workspace.
3. WorkspaceContext lista proyectos autorizados.
4. Sólo se cargan metadatos.

### Resumen de proyecto

1. Se obtiene `Project`.
2. Se listan `Diagram`, miembros e invitaciones permitidas.
3. No se descarga ningún JSON de S3.

### Editor

1. Se selecciona una hoja.
2. La función valida el acceso.
3. Se genera una URL GET firmada por cinco minutos.
4. El frontend descarga y migra el JSON.
5. Se monta un único `EditorStore`.

## 6. Flujo de guardado

```text
Cambio gráfico
  ├── 250 ms → borrador local
  └── 1,8 s  → URL PUT firmada → S3
                           ↓
                    update Diagram
                    version/checksum/bytes/date
```

Si la subida falla, el borrador local permanece. Al abrir la hoja, se compara la fecha del borrador con `lastSavedAt` y se recupera el más reciente.

## 7. Renderizado por hoja

Sólo la hoja activa tiene:

- `EditorStore`;
- `EditorProvider`;
- Stage de Konva;
- documento S3 descargado.

Las demás hojas permanecen como metadatos livianos.

## Extensión de análisis — fase 1

La arquitectura conserva la separación original y agrega una capa de dominio pura:

```text
React / Konva
    ↓ acciones del editor
DiagramDocument V3
    ↓ proyección determinista
ElectricalModel
    ↓ validación + caso de operación
AnalysisInput preview
```

Los módulos de `src/domain/analysis` y `src/domain/electrical` no ejecutan AWS ni ecuaciones. La futura infraestructura serverless consumirá este contrato sin acoplar el canvas al solver.

Los modelos `AnalysisStudy`, `UsagePeriod` y `UsageLedgerEntry` son metadatos pequeños. Los snapshots y resultados seguirán el patrón documental S3 ya utilizado por los diagramas.
