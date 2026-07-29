# Mapeo desde el proyecto anterior

| Implementación anterior | Nueva ubicación |
|---|---|
| `classes/Graph.js`, `Node.js`, `Edge.js` | `domain/diagram` + `EditorStore` |
| `NodeTypes/*.jsx` | `domain/catalog/symbols/*.jsx` |
| `Graph.addNode` y su `switch` | `domain/catalog/symbolCatalog.js` |
| efectos que recalculaban endpoints | `getPortWorldPosition` |
| propagación manual de colores/voltajes | `domain/electrical/topology.js` |
| colores por valor numérico disperso | `metadata.voltageLevels` |
| callbacks repetidos del menú | herramientas y comandos del store |
| `ElmLne` como punto central | edge `kind: "line"` entre dos endpoints |
| líneas y conexiones indistinguibles | `kind: "path"` y `kind: "line"` |
| copia de editor para invitado y usuario | un único editor con modo de sólo lectura |
| guardado local acoplado a la UI | `AmplifyProjectRepository` + servicios Data/S3 |

## Conversión heredada de diagramas

El importador del editor continúa normalizando:

- `x`, `y` → `position`;
- `attributes` → `properties`;
- `fromNodeId`, `toNodeId` → endpoints;
- `fromPoint.id`, `toPoint.id` → `portId`;
- `controlPoints` → `vertices`;
- voltajes numéricos → IDs del catálogo del proyecto;
- `routing: "manual"` → `routing: "free"`;
- puertos personalizados de barras → puertos dinámicos persistentes.

### Antiguo `ElmLne`

Cuando un `ElmLne` tiene dos aristas incidentes, se eliminan el nodo auxiliar y ambas aristas y se crea una línea real entre los dos componentes exteriores. La posición del antiguo nodo se conserva como vértice del trazado.

Cuando tiene un grado distinto de dos, se transforma en `ElmTerm` con variante `PointTerm`, para conservar ramificaciones que no pueden convertirse de forma segura en una única línea.

## Datos locales de V4

La V5 no sube automáticamente proyectos encontrados en `localStorage`, porque primero debe conocerse la cuenta Cognito propietaria y el destino cloud. La migración segura actual es:

1. exportar la hoja o proyecto desde la versión local;
2. iniciar sesión en V5;
3. crear el proyecto destino;
4. importar el JSON en la hoja correspondiente;
5. esperar la confirmación de guardado S3.

El repositorio local antiguo se conserva solamente como soporte de pruebas y referencia de migración. Una importación masiva puede añadirse después como asistente explícito, nunca silencioso.
