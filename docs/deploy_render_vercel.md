# Despliegue RAGUILEX en Render + Vercel

## Arquitectura

- Frontend: React/Vite en Vercel.
- Backend API: Fastify/Prisma en Render.
- Base de datos: PostgreSQL administrado en Render.
- Persistencia: los datos viven en PostgreSQL. Las fotos subidas usan `UPLOAD_DIR`; en Render free el filesystem no es persistente, por lo que para produccion real conviene migrar imagenes a almacenamiento externo.

## Backend en Render

Repositorio: `https://github.com/cristianrosso/raguilex`

Servicio sugerido:

- Tipo: Web Service.
- Nombre: `inventario-api`.
- Root directory: raiz del repositorio.
- Build command: `npm install && npm run build:api:render`
- Start command: `npm run start:api:render`
- Health check path: `/health`

El script de inicio ejecuta:

```powershell
npm --workspace @raguilex/api run prisma:deploy
npm run seed
npm --workspace @raguilex/api run start
```

`prisma:deploy` aplica migraciones existentes sin crear nuevas migraciones. `seed` crea/actualiza catalogos base y usuarios iniciales solo si sus passwords reales existen en variables de entorno.

## Variables de entorno de Render

No colocar secretos en variables `VITE_`.

Obligatorias:

- `NODE_ENV=production`
- `DATABASE_URL`: Internal Database URL de PostgreSQL en Render.
- `JWT_SECRET`: secreto largo, minimo 16 caracteres.
- `WEB_ORIGIN=https://raguilex.vercel.app`
- `WEB_ORIGINS=https://raguilex.vercel.app,https://raguilex-nhxci5bdi-djcris.vercel.app`
- `SUPER_ADMIN_USERNAME=superadmin`
- `SUPER_ADMIN_PASSWORD`: contrasena real del super admin.

Opcionales para accesos de prueba:

- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD`: contrasena real del admin.
- `SELLER_USERNAME=vendedor`
- `SELLER_PASSWORD`: contrasena real del vendedor.

Render define `PORT` automaticamente. El backend ya lo respeta y usa `API_PORT=4001` solo para local.

## CORS

El backend acepta solicitudes solo desde:

- `WEB_ORIGIN`
- cada dominio listado en `WEB_ORIGINS`, separado por comas.

Para agregar otro dominio Vercel o dominio propio, anadirlo a `WEB_ORIGINS` y redeplegar Render.

## Frontend en Vercel

Variable requerida en Vercel:

- `VITE_API_URL=https://inventario-api.onrender.com`

Esta variable no contiene secretos; solo indica al navegador donde esta la API.

Despues de cambiar `VITE_API_URL`, redeplegar Vercel para que Vite compile el nuevo valor dentro del frontend.

## Verificacion

1. API publica:

```powershell
Invoke-RestMethod https://inventario-api.onrender.com/health
```

Debe responder:

```json
{"ok":true,"service":"raguilex-api"}
```

2. Login:

- Abrir `https://raguilex.vercel.app`.
- Entrar con usuario sembrado y contrasena definida en Render.

3. Persistencia:

- Crear un producto desde Alta rapida.
- Cerrar sesion y volver a entrar.
- Confirmar que el producto sigue en Productos/Inventario.

4. Ventas:

- Vender un producto disponible.
- Confirmar que cambia a `SOLD`.
- Revisar Dashboard/Reportes para ver el cambio.

## Estado actual observado

El 2026-10-13, `https://inventario-api.onrender.com/health` respondio `404`. Eso indica que Render aun no esta ejecutando esta API o falta aplicar la configuracion anterior.
