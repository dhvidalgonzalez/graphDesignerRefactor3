# Modelo eléctrico lógico V3

## Separación visual y eléctrica

El documento conserva el dibujo y genera un modelo lógico paralelo:

```text
nodes + edges                 electricalModel
--------------------------    ------------------------------
posición y rotación           components
paths y vértices              terminals
símbolos React Konva          connectionNodes
etiquetas                     parámetros normalizados
```

El solver futuro no dependerá de coordenadas, trazados ni componentes React.

## Path ideal

Un edge con `kind: "path"` representa una unión ideal:

- impedancia cero;
- sin pérdidas;
- ambos endpoints pertenecen al mismo `connectionNodeId`;
- su geometría sólo define la representación visual.

Los puertos de una barra `ElmTerm` también pertenecen al mismo nodo lógico.

## Línea física

Un edge con `kind: "line"` se convierte en un componente `LINE`:

- terminal `FROM`;
- terminal `TO`;
- dos nodos eléctricos distintos;
- longitud;
- resistencia y reactancia por kilómetro;
- susceptancia;
- corriente nominal;
- estado de servicio.

La línea no se usa para fusionar islas equipotenciales. La propagación visual de nivel de tensión puede recorrerla para facilitar edición, pero eso no altera su contrato analítico.

## Equipos

Tipos iniciales:

```text
BUS
LOAD
GENERATOR
EXTERNAL_GRID
LINE
TRANSFORMER_2W
TRANSFORMER_3W
SWITCH
SHUNT
```

Cada equipo conserva `sourceEntity`, que permite volver desde un resultado lógico al nodo o edge visual original.

## Terminales

```js
{
  id,
  componentId,
  role,
  connectionNodeId,
  sourceEndpoint: { nodeId, portId }
}
```

Los transformadores y switches mantienen terminales separados. El adaptador del solver decide cómo enlazarlos según sus parámetros y estado.

## Nodos de conexión

```js
{
  id,
  nominalVoltageKv,
  voltageLevelId,
  busComponentId?,
  memberEndpointIds
}
```

Cuando el grupo contiene una única barra, el ID se deriva de esa barra. Para uniones sin barra explícita se genera un ID determinista a partir de sus endpoints.

## Trazabilidad de parámetros

Cada parámetro normalizado tiene la forma:

```js
{
  value,
  source: "DEFAULT" | "USER" | "CATALOG" | "IMPORTED" | "CALCULATED",
  status: "MISSING" | "ASSUMED" | "CONFIRMED",
  updatedAt?
}
```

Un valor por defecto no se presenta como dato técnico confirmado. La ficha eléctrica permite modificar su procedencia y estado.

## Sincronización

`electricalModel` se regenera al:

- crear o cargar un documento;
- migrar una versión anterior;
- confirmar un cambio en `EditorStore`;
- serializar el JSON para S3 o exportación.

Esto evita que el modelo lógico quede desfasado respecto del dibujo.
