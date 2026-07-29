# Modelo de aplicación del proyecto

La UI conserva una forma agregada cómoda para el editor, aunque los datos cloud estén normalizados.

```js
{
  id,
  workspaceId,
  name,
  description,
  owner: { id, displayName, email },
  members: [
    { id, email, displayName, role, status }
  ],
  diagrams: [
    {
      id,
      name,
      position,
      storageKey,
      storageVersion,
      document: null | DiagramDocument
    }
  ],
  activeDiagramId,
  role: "owner" | "editor" | "viewer",
  canEdit,
  canManage
}
```

## Por qué existe esta forma agregada

- evita pasar registros DynamoDB separados por toda la UI;
- mantiene estable el contrato del editor V4;
- permite que `document` sea `null` en hojas no abiertas;
- centraliza la traducción de enums y roles;
- facilita una futura caché o modo offline.

## Hojas

Sólo la hoja abierta contiene `document`. Las vistas previas del resumen usan metadatos mientras no se descarga S3.

## Roles

```text
owner  → canEdit=true, canManage=true
editor → canEdit=true, canManage=false
viewer → canEdit=false, canManage=false
```
