# Auditoria RAGUILEX - Fase 5

## Resumen ejecutivo

Estado: estable con observaciones.

La auditoria corrigio problemas de seguridad y operacion detectados durante la revision, especialmente fuga de costos hacia vendedores por API, falta de alta rapida dedicada, auditoria con acciones poco explicitas y rutas directas donde RBAC debia responder 403.

## Matriz de auditoria

| Modulo | Estado | Error | Severidad | Correccion |
|---|---|---|---|---|
| Login | FUNCIONA | Login fallido no quedaba auditado | P2 | Se registra `LOGIN_FAILED` |
| RBAC backend | FUNCIONA | Vendedor podia recibir costos en API | P0 | Sanitizado de `purchaseCost` y `purchaseCostSnapshot` para SELLER |
| Productos | FUNCIONA | PATCH/DELETE directos no daban 403 a SELLER | P1 | Rutas protegidas por rol |
| Alta rapida | FUNCIONA | No existia modulo dedicado de 5 campos | P1 | Se agrego `/quick-entry` y `POST /products/quick-entry` |
| Fotos | FUNCIONA | Validacion basica ya existia, se probo PNG real | P1 | Upload acepto PNG valido y mantiene validacion MIME/firma |
| QR | FUNCIONA | QR podia exponer costo a SELLER | P0 | Sanitizado en resolucion QR |
| Ventas | FUNCIONA | Respuestas de venta podian exponer costo historico al SELLER | P0 | Sanitizado en listados, detalle, venta e idempotencia |
| Doble venta | FUNCIONA | Sin error actual | P0 | Validado: segundo intento responde 409 |
| Idempotencia | FUNCIONA | Sin error actual | P0 | Validado: mismo idempotency key devuelve misma venta |
| Caja | FUNCIONA | Sin error actual | P1 | Validado: esperado Bs 950, diferencia -10 exige observacion |
| Reservas | FUNCIONA | Producto reservado bloquea venta normal | P1 | Validado: venta normal responde 409 |
| Devoluciones | FUNCIONA | Sin error actual | P1 | Validado: crea RETURN y conserva venta |
| Anulaciones | FUNCIONA | Sin error actual | P1 | Validado: marca `CANCELLED` |
| Reportes | FUNCIONA | Riesgo de divergencia | P1 | Comparado contra SQL: 16 ventas y Bs 5630 coinciden |
| Migraciones | FUNCIONA | Primer intento fallo por variable mal inyectada | P2 | Reprobado con base nueva: 3 migraciones aplicadas desde cero |
| Backup/restore | FUNCIONA | Restore no estaba probado en Fase 4 | P1 | Restaurado backup en DB TEST; conteos recuperados |
| Dependencias | FUNCIONA PARCIALMENTE | `npm audit` mantiene vulnerabilidades que requieren `--force` | P2 | Se aplico `npm audit fix` seguro; queda pendiente upgrade controlado |
| Importacion Excel | FUNCIONA PARCIALMENTE | Archivo real tiene 0 filas validas por datos invalidos | P2 | Analisis confirmado; no importa filas con errores criticos |
| Responsive/mobile real | FUNCIONA PARCIALMENTE | No se valido con dispositivo fisico en esta auditoria | P2 | Pendiente prueba manual real |

## Evidencia de pruebas

- `npm.cmd test`: 3/3 pruebas OK.
- `npm.cmd run build`: OK.
- `npx prisma migrate status`: base actual al dia.
- Migracion en base nueva: 3 migraciones aplicadas desde cero.
- Restore en base TEST: usuarios 4, productos 18, ventas 11, movimientos 37, settings 5.
- Integridad: 0 fotos huerfanas, 0 sale_items sin venta, 0 movimientos sin producto, 0 ventas sin vendedor, 0 reservas sin producto.
- Reportes vs SQL: ventas completadas 16 y total Bs 5630 en ambos.

## Prueba API integral

- Login invalido: 401.
- Alta rapida: genero `TN-00319`.
- Foto PNG real: upload 200.
- Vendedor no ve costo en producto: OK.
- Vendedor no ve costo en QR: OK.
- Vendedor no ve costo historico en ventas: OK.
- SELLER `POST /products`: 403.
- SELLER `PUT /products/:id`: 403.
- SELLER `PATCH /products/:id`: 403.
- SELLER `DELETE /products/:id`: 403.
- SELLER settings/users: 403.
- ADMIN settings: 403.
- ADMIN crear SUPER_ADMIN: 403.
- Idempotencia: misma venta devuelta.
- Doble venta: segundo intento 409.
- Caja: esperado Bs 950; cierre sin observacion 400; cierre con observacion diferencia -10.
- Reserva: venta normal bloqueada 409.
- Devolucion: registrada.
- Anulacion: `CANCELLED`.
- Alertas: 5 tipos disponibles.

## Seguridad

Controles confirmados:

- JWT obligatorio en rutas privadas.
- RBAC aplicado en backend para acciones criticas.
- Costos y utilidad no se exponen a SELLER.
- Uploads limitados a JPEG, PNG y WEBP con validacion por firma.
- Login tiene rate limiting.
- Health interno requiere SUPER_ADMIN.

Pendientes:

- Resolver vulnerabilidades restantes sin `--force` ciego.
- Validar HTTPS/camara en dominio real.
- Revisar CSRF si se migra a cookies; hoy se usa Bearer token.

## Decision

B - ESTABLE CON OBSERVACIONES.

Puede continuar a Fase 6, pero no debe declararse produccion final hasta completar pruebas mobile reales, HTTPS/dominio, restore operativo con procedimiento firmado y plan de upgrades de dependencias.
