# Cambios — análisis eléctricos fase 1

## Documento y dominio

- Esquema de diagrama actualizado a V3.
- Migración automática V1/V2 → V3, con inferencia de procedencia para parámetros heredados.
- Modelo eléctrico lógico con componentes, terminales y nodos de conexión.
- Trazabilidad de procedencia y confirmación por parámetro.
- Casos de operación y overrides.
- Configuración del solver preparada.
- Validación de topología y parámetros.
- Generación local del contrato semántico y snapshot de prueba.

## Interfaz

- Botón **Análisis** en el encabezado del editor.
- Panel de preparación, casos, solver y modelo.
- Ficha eléctrica ampliada con procedencia y estado.
- Descarga de `analysis-request-preview.json` y `analysis-input-preview.json`.

## Amplify Data

- Enums de análisis, ejecución, proveedor, estado y operación de consumo.
- Modelos `AnalysisStudy`, `UsagePeriod` y `UsageLedgerEntry`.
- Índices para historial por workspace/diagrama y trazabilidad idempotente.
- Lectura dinámica; escrituras reservadas para la fase serverless.

## Planes

- Entitlements de análisis agregados a FREE y BASIC.
- FREE permanece sin análisis.
- BASIC queda preparado para 20 unidades mensuales cuando se habilite fase 2.

## No implementado todavía

- Orquestador Lambda.
- Worker Docker de flujo de carga.
- Reserva/consumo efectivo.
- Resultados S3 e historial real.
- Overlay de resultados en el canvas.
