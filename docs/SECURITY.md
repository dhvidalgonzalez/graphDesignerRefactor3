# Seguridad y autorización

## Reglas de Amplify Data

### Propietario

Puede crear, leer, actualizar y eliminar el proyecto y sus hojas. También administra invitaciones y configuración.

### Editor

Puede leer el proyecto y crear, leer, actualizar o eliminar hojas. No puede actualizar directamente el registro `Project`, porque allí se encuentran los arreglos de autorización.

El cambio de hoja activa y el recálculo de `diagramCount` pasan por `project-diagram-sync`, que:

1. valida la identidad Cognito;
2. confirma rol propietario o editor;
3. consulta las hojas reales del proyecto;
4. valida la hoja activa solicitada;
5. actualiza únicamente `activeDiagramId` y `diagramCount`.

### Lector

Sólo puede leer proyecto y hojas. El `EditorStore` también bloquea mutaciones, pero la autorización cloud sigue siendo la barrera real.

### Perfil y workspace

Sólo su dueño puede acceder.

### Invitación

- el propietario administra el registro;
- el destinatario puede **leerlo**, usando el claim `email`;
- el destinatario no puede cambiar desde el cliente el rol, proyecto, vencimiento o estado;
- la aceptación definitiva pasa por una función backend.

## Acceso a S3

No se concede acceso general del navegador a `projects/*`.

La única identidad IAM con acceso al prefijo de documentos es `diagram-file-access`. Antes de firmar una URL, la función verifica:

1. sesión Cognito;
2. existencia del proyecto;
3. coincidencia con owner/editor/viewer;
4. pertenencia de la hoja al proyecto;
5. operación permitida para el rol.

Las URLs expiran en cinco minutos. Los lectores sólo reciben descarga; propietarios y editores pueden cargar o eliminar.

## Aceptación de invitaciones

La función `project-invitation` valida:

- estado pendiente;
- fecha de expiración;
- coincidencia de correo;
- proyecto existente;
- que el rol sea exclusivamente `EDITOR` o `VIEWER`;
- que el usuario no sea ya el propietario.

Después propaga la identidad a:

- `Project`;
- todas las hojas `Diagram`;
- `ProjectMember`;
- `ProjectInvitation`.

La función evita incrementar nuevamente `memberCount` cuando la persona ya posee una membresía activa.

## Límites antes de producción

- La propagación de permisos entre proyecto y hojas no es una transacción única de DynamoDB; se debe agregar reconciliación/auditoría para producción.
- Falta una operación backend para revocar usuarios y cambiar roles de forma integral.
- Falta control de concurrencia para impedir que dos editores sobrescriban la misma versión de S3.
- Falta historial/versionado de objetos, auditoría, rate limiting y correo transaccional.
- Conviene habilitar MFA y políticas de retención antes de manejar información sensible.

## Modelos de análisis de fase 1

`AnalysisStudy`, `UsagePeriod` y `UsageLedgerEntry` se exponen al frontend sólo con lectura dinámica para las identidades autorizadas. No existe una mutación cliente que permita crear estudios, reservar unidades o escribir movimientos del ledger.

La fase 2 deberá conceder escritura mediante `allow.resource(...)` únicamente a la Lambda orquestadora y al worker. La orquestadora recibirá `diagramId`, resolverá la clave S3 desde DynamoDB y validará identidad, proyecto, versión, plan e idempotencia antes de crear el snapshot.
