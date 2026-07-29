# Validación de la entrega V6 — análisis eléctricos fase 1

## Ejecutado en este entorno

- Transpilación sintáctica individual de **145 archivos JS, JSX y TS** mediante TypeScript, incluyendo el nuevo panel React y el esquema Amplify.
- `node --check` para todos los archivos `.js` de `src/` y `tests/`.
- `node --experimental-strip-types --check` sobre los recursos TypeScript modificados de Amplify.
- Comprobación de imports locales; no se detectaron rutas faltantes. `amplify_outputs.json` se excluye porque lo genera Amplify por entorno.
- Balance CSS: **827 aperturas / 827 cierres**.
- Ejecución de las **23 pruebas** distribuidas en 6 archivos mediante un cargador local compatible con la API de aserciones utilizada por Vitest. Incluye:
  - creación de documento V3;
  - validación estructural;
  - construcción del modelo lógico;
  - separación de terminales de una línea física;
  - solicitud semántica sin `storageKey` ni `workspaceId` confiado por cliente;
  - aplicación de overrides de caso de operación;
  - generación del snapshot de entrada;
  - serialización y reapertura V3;
  - migración V2 → V3 e inferencia de procedencia para parámetros heredados;
  - detección de isla energizada sin Slack.
- Resultado del diagrama de ejemplo:
  - 7 componentes lógicos;
  - 18 terminales;
  - 3 nodos eléctricos;
  - 3 barras de cálculo;
  - 2 ramas;
  - 0 errores bloqueantes;
  - estado `READY_WITH_ASSUMPTIONS`.
- Revisión del diff contra el ZIP original para confirmar que los cambios se concentran en la fase de análisis y no eliminan las funciones existentes de autenticación, pagos, proyectos o editor.

## No ejecutado en este entorno

No fue posible instalar dependencias npm. El registro interno no disponía de algunos paquetes requeridos y el contenedor no pudo resolver `registry.npmjs.org`. Por esa razón no se declara como ejecutado:

```bash
npm run lint
npm run test
npm run build
npm run sandbox
```

El ZIP no incluye `node_modules` ni un `dist` antiguo, para evitar entregar una compilación que no contiene los cambios V6. La ejecución local de las 23 pruebas no sustituye la validación final con el Vitest real después de `npm ci`.

## Checklist al descomprimir

```bash
npm ci
npm run lint
npm run test
npm run build
npm run sandbox
```

Después de levantar el sandbox:

1. abre un diagrama V2 existente y confirma que se guarda como V3;
2. abre **Análisis** y revisa el estado de preparación;
3. cambia procedencia/estado en una ficha eléctrica;
4. crea un caso de operación y agrega un override;
5. descarga la solicitud y el `input.json` de prueba;
6. guarda, recarga y verifica que casos y parámetros persistan en S3.
