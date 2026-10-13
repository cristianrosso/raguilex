# Importacion Excel RAGUILEX - Fase 1

## Flujo

1. Subir o indicar ruta de `INVENTARIO RAGUILEX.xlsx`.
2. Analizar hojas, encabezados, registros, duplicados y formatos.
3. Normalizar valores seguros.
4. Validar campos criticos.
5. Mostrar vista previa.
6. Importar solo filas sin errores criticos.

## Reglas aplicadas

- Conservar `TN-00001` a `TN-00300` exactamente.
- Continuar altas nuevas desde `TN-00301`.
- No reutilizar codigos vendidos o retirados.
- Convertir costos y precios a decimal BOB cuando el valor sea confiable.
- Mantener marcas dudosas separadas.
- No confundir condicion con estado de inventario.
- Guardar fila original y payload normalizado en staging.
- Omitir por defecto productos cuyo `internal_code` ya exista.

## Resultado del archivo inicial

| Metrica | Resultado |
|---|---:|
| Registros encontrados | 300 |
| Filas candidatas a producto | 35 |
| Filas solo con codigo reservado | 265 |
| Registros validos para importacion directa | 0 |
| Registros con errores criticos | 35 |
| Filas con advertencia directa | 2 |
| Codigos internos duplicados | 0 |
| Codigos originales duplicados | 1 |

## Bloqueos detectados

- `Estado` contiene valores que parecen condicion, como `10` y `excelente`.
- `Precio venta (Bs)` falta en la mayoria de filas candidatas.
- `Costo compra (Bs)` contiene al menos un valor no numerico: `25O.00 Bs`.
- `UPC0083412740890` aparece duplicado en las filas Excel 22 y 39.

## Archivos generados

- `outputs/raguilex_phase1/INVENTARIO_RAGUILEX_limpio_para_importacion.xlsx`
- `outputs/raguilex_phase1/cleaning_report.csv`
- `outputs/raguilex_phase1/inventory_clean.csv`
- `outputs/raguilex_phase1/inventory_analysis.json`
- `outputs/raguilex_phase1/diagnostico_raguilex_fase1.md`
