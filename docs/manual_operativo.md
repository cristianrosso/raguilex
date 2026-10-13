# Manual operativo RAGUILEX

## Vendedor

- Iniciar sesion con su usuario.
- Usar `Escanear` o `Ventas > Nueva venta` para buscar productos.
- Confirmar ventas solo con conexion. El sistema no registra ventas offline.
- Consultar sus ventas desde `Ventas`.
- Puede crear reservas si la configuracion comercial lo permite.

## Admin

- Crear y editar productos desde `Productos`.
- Subir fotografias JPEG, PNG o WEBP desde la ficha del producto.
- Generar QR desde la ficha del producto.
- Revisar inventario, movimientos, reportes y utilidad.
- Abrir caja al inicio del turno, registrar ingresos/egresos autorizados y cerrar caja con efectivo contado.
- Gestionar reservas, liberar vencidas y registrar devoluciones desde ventas existentes.
- Crear vendedores desde `Usuarios`.
- No puede entrar a configuracion global.

## Super admin

- Tiene acceso completo a usuarios, auditoria, ajustes globales, health interno y parametros.
- Puede crear admins y vendedores.
- Debe revisar auditoria para acciones criticas: ventas, anulaciones, devoluciones, caja, importacion, usuarios y configuracion.
- Debe ejecutar y probar backups periodicamente siguiendo `docs/backup_restore.md`.
