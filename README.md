# RAGUILEX Inventario - Fase 4

Sistema web responsive para inventario unitario de tenis/calzado de segunda mano. Cada par fisico se maneja como producto individual con codigo interno unico, estado, trazabilidad, preparacion para QR, fotografias, ventas y auditoria.

## Entregables incluidos

- Diagnostico del Excel original: `outputs/raguilex_phase1/diagnostico_raguilex_fase1.md`
- Tabla de limpieza: `outputs/raguilex_phase1/cleaning_report.csv`
- Excel limpio para importacion: `outputs/raguilex_phase1/INVENTARIO_RAGUILEX_limpio_para_importacion.xlsx`
- Datos normalizados en CSV: `outputs/raguilex_phase1/inventory_clean.csv`
- Resumen tecnico JSON: `outputs/raguilex_phase1/inventory_analysis.json`
- Modelo SQL propuesto: `docs/raguilex_modelo_datos_propuesto.sql`
- Diagrama ER: `docs/raguilex_er_diagram.md`
- Migracion PostgreSQL: `apps/api/prisma/migrations/20260901000000_initial/migration.sql`
- Seed inicial: `apps/api/prisma/seed.ts`
- Backend modular Fastify + Prisma: `apps/api`
- Frontend mobile-first React + Vite: `apps/web`
- Paquete compartido: `packages/shared`
- Control de caja, reservas, devoluciones y anulaciones: Fase 4
- Documentacion operativa: `docs/manual_operativo.md`
- Backup y restauracion: `docs/backup_restore.md`
- Despliegue Render + Vercel: `docs/deploy_render_vercel.md`

## Requisitos

- Node.js 22 o superior.
- Docker Desktop para levantar PostgreSQL local.
- npm.

## Puertos

- Frontend: `http://localhost:3002`
- Backend API: `http://localhost:4001`
- PostgreSQL: `localhost:5433`

## Configuracion

1. Copia `.env.example` como `.env`.
2. Cambia como minimo:
   - `JWT_SECRET`
   - `SUPER_ADMIN_PASSWORD`
   - `SUPER_ADMIN_USERNAME` si deseas otro usuario inicial.
   - `ADMIN_PASSWORD` y `SELLER_PASSWORD` si deseas habilitar accesos de prueba adicionales.

El seed omite cualquier usuario cuyo password conserve el valor placeholder.

## Credenciales de desarrollo

El proyecto puede sembrar tres usuarios iniciales:

- `superadmin` con rol `SUPER_ADMIN`
- `admin` con rol `ADMIN`
- `vendedor` con rol `SELLER`

Las contrasenas reales viven en tu archivo local `.env`. En `.env.example` solo quedan placeholders para no versionar secretos.

## Instalacion

```powershell
npm.cmd install
npm.cmd run prisma:generate
```

## Base de datos local

```powershell
docker compose up -d postgres
npm.cmd run prisma:migrate
npm.cmd run seed
```

La migracion crea catalogos, usuarios, productos, imagenes, ventas, movimientos, auditoria, staging de importacion y la funcion segura `next_internal_code()` para continuar despues de `TN-00300`.

## Ejecutar localmente

```powershell
npm.cmd run dev
```

Tambien se pueden ejecutar por separado:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
```

## Pruebas y verificacion

```powershell
npm.cmd run build
npm.cmd run test
npm.cmd --workspace @raguilex/api run import:analyze -- "C:\Users\ZBook\Downloads\INVENTARIO RAGUILEX.xlsx"
```

## Despliegue en Vercel

El archivo `vercel.json` publica el frontend de `apps/web`.

Variables necesarias en Vercel:

- `VITE_API_URL`: URL publica del backend API, por ejemplo `https://api.tudominio.com`.

El backend Fastify/Prisma y PostgreSQL deben desplegarse aparte o migrarse a un runtime compatible antes de usar el sistema completo en produccion.

Para desplegar la API en Render y conectar PostgreSQL, revisa `docs/deploy_render_vercel.md`.

## Resultado de importacion del Excel inicial

- Registros encontrados: 300.
- Filas candidatas a producto: 35.
- Filas solo con codigo reservado: 265.
- Codigos internos duplicados: 0.
- Codigo original/UPC duplicado: `UPC0083412740890` en filas 22 y 39.
- Registros validos para importacion directa: 0.
- Filas con advertencia directa del importador: 2.
- Motivo: las 35 filas candidatas tienen errores criticos, principalmente estado de inventario invalido y precios de venta faltantes.
- Siguiente codigo para altas nuevas: `TN-00301`.

Por defecto el importador no crea productos con errores criticos y usa `internal_code` como control idempotente.

## Modulos API preparados

- `AUTH`: login, JWT, sesion actual y rate limiting en login.
- `AUTH /change-password`: cambio de contrasena desde perfil.
- `PRODUCTS`: busqueda, alta, detalle y generacion de codigo.
- `IMPORT`: analizar, normalizar, guardar staging e importar filas validas.
- `SALES`: venta transaccional con bloqueo por estado, idempotencia y anulacion sin DELETE.
- `CASH`: apertura, movimientos, resumen por metodo de pago y cierre definitivo.
- `RESERVATIONS`: reserva, vencimiento controlado, liberacion y conversion a venta.
- `RETURNS`: devolucion desde venta existente con movimiento compensatorio.
- `INVENTORY`: movimientos y ajustes autorizados.
- `QR`: resolver token QR a producto.
- `REPORTS`: resumen de inventario, ventas, utilidad, rotacion, estancados y alertas.
- `USERS`: alta/listado con RBAC.
- `SETTINGS`: catalogos base y configuracion global solo para `SUPER_ADMIN`.
- `AUDIT`: eventos criticos para super admin.

## Flujo de venta preparado

El backend actualiza `AVAILABLE -> SOLD`, crea `sales`, `sale_items`, `inventory_movements` y conserva `purchase_cost_snapshot` en una sola transaccion. Si otro usuario vende o modifica el mismo producto antes, la operacion responde con conflicto y no duplica la venta.

## Roles

- `SELLER`: dashboard operativo, escaner, ventas, reservas habilitadas y perfil. No administra inventario, productos, usuarios, reportes gerenciales ni configuracion.
- `ADMIN`: productos, inventario, QR, ventas, caja, reservas, devoluciones, reportes, importacion, vendedores, movimientos, costos y utilidad. No accede a configuracion global.
- `SUPER_ADMIN`: acceso completo, configuracion, auditoria, backups, health interno y parametros globales.

## Caja

La ruta web `/cash` permite abrir una caja unica, registrar ingresos/egresos autorizados y cerrar con snapshot. El efectivo esperado se calcula como:

```text
monto inicial + ventas en efectivo + ingresos en efectivo - egresos en efectivo
```

Los pagos por QR/transferencia no incrementan el efectivo fisico esperado.

## Reservas, devoluciones y anulaciones

- Una reserva cambia `AVAILABLE -> RESERVED` y bloquea venta normal.
- La conversion de reserva a venta conserva la relacion `reservation + sale`.
- Una devolucion siempre parte de una venta existente; no borra la venta.
- Una anulacion marca la venta como `CANCELLED`, solicita motivo y crea movimientos compensatorios.

## Backup

Crear backup manual:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_raguilex.ps1
```

El respaldo incluye PostgreSQL y fotografias. La restauracion esta documentada en `docs/backup_restore.md`.

## Deploy base

1. Instalar dependencias con `npm.cmd install`.
2. Configurar `.env` con secretos reales y origen web.
3. Ejecutar `npm.cmd run prisma:generate`.
4. Ejecutar migraciones con `npm.cmd run prisma:migrate`.
5. Crear usuarios iniciales con `npm.cmd run seed`.
6. Importar inventario real cuando el Excel este corregido.
7. Configurar almacenamiento de fotografias.
8. Usar HTTPS en produccion.
9. Ejecutar `http://localhost:4001/health` y health interno con super admin.
10. Realizar prueba basica de login, producto, venta, caja, reserva y devolucion.
