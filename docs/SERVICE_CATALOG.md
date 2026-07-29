# Catálogo de servicios

El frontend utiliza un único cliente de Amplify Data y lo expone mediante servicios pequeños. Las vistas y contextos no llaman directamente a `generateClient`.

## Sesión y perfil

```text
services/auth/session                 sesión Cognito normalizada
services/profile/get                  obtiene UserProfile
services/profile/ensure               garantiza perfil + workspace personal
services/workspace/getPersonal        obtiene el espacio personal
services/workspace/update             actualiza contadores del espacio
```

## Proyectos

```text
services/project/list                 proyectos autorizados para la sesión
services/project/get                  detalle de un proyecto
services/project/create               crea metadatos del proyecto
services/project/update               nombre y descripción; sólo propietario
services/project/delete               elimina el registro del proyecto
services/project/syncDiagrams         sincroniza hoja activa y contador mediante Lambda
```

`syncDiagrams` no permite editar los arreglos de autorización desde el navegador. La función valida que la sesión sea propietaria o editora y calcula nuevamente el contador a partir de las hojas existentes.

## Hojas y documentos

```text
services/diagram/list                 hojas por proyecto y posición
services/diagram/create               crea metadatos de una hoja
services/diagram/update               nombre, posición y metadatos S3
services/diagram/delete               elimina metadatos
services/diagram/document/load        obtiene URL GET firmada y descarga JSON
services/diagram/document/save        obtiene URL PUT firmada y sube JSON
services/diagram/document/remove      elimina el objeto S3 mediante Lambda
```

## Colaboración

```text
services/member/list                  participantes visibles
services/member/create                membresía inicial del propietario
services/member/delete                eliminación usada por administración/limpieza
services/invitation/list              invitaciones del proyecto o del correo actual
services/invitation/create            crea invitación pendiente
services/invitation/accept            aceptación validada por Lambda
services/invitation/delete            revoca/elimina una invitación
```

## Fachadas

- `src/services/index.js`: catálogo general de servicios.
- `AmplifyProjectRepository`: compone varias operaciones y adapta los registros cloud al contrato de la UI.
- `WorkspaceContext`: coordina estados y navegación; no conoce consultas GraphQL.
- `SessionContext`: encapsula la sesión y el aprovisionamiento del usuario.
