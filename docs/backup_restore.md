# Backup y restauracion RAGUILEX

## Que se respalda

- Base de datos PostgreSQL completa mediante `pg_dump`.
- Fotografias almacenadas fuera de PostgreSQL en `apps/api/uploads`.
- Manifiesto `manifest.json` con fecha, contenedor y contenido incluido.

## Backup manual

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_raguilex.ps1
```

El script crea una carpeta en `backups/raguilex-YYYYMMDD-HHMMSS`.

## Politica recomendada

- Diario: conservar 7 backups.
- Semanal: conservar 4 backups.
- Mensual: conservar 3 backups.
- Copiar los backups a almacenamiento externo o nube privada. No dejar la unica copia en el mismo equipo o servidor.

## Restauracion local

1. Detener API y web para evitar escrituras durante la restauracion.
2. Crear una base vacia o usar un contenedor PostgreSQL nuevo.
3. Restaurar el dump:

```powershell
Get-Content backups\raguilex-YYYYMMDD-HHMMSS\database.sql | docker exec -i raguilex-postgres psql -U raguilex -d raguilex_inventory
```

4. Restaurar fotos:

```powershell
Copy-Item -LiteralPath backups\raguilex-YYYYMMDD-HHMMSS\uploads -Destination apps\api\uploads -Recurse -Force
```

5. Ejecutar verificacion:

```powershell
npm.cmd run prisma:generate
npm.cmd run build
npm.cmd test
```

6. Iniciar servicios y validar `http://localhost:4001/health`.

## Nota de produccion

Un backup no debe considerarse suficiente hasta probar una restauracion completa en ambiente separado. Produccion debe usar HTTPS y una ubicacion de respaldo externa al servidor principal.
