# Mi calendario — versión 2.0

Aplicación web responsive con HTML, CSS y JavaScript. GitHub Pages aloja la interfaz y Supabase guarda los datos de cada usuario.

## Novedades de la versión 2.0

- Previsión de fecha de finalización de las 500 horas, calculada con 6 horas por día laborable (lunes a viernes).
- La previsión excluye fines de semana y fechas que ya tengan otra actividad o libranza registrada. Las prácticas futuras ya registradas se cuentan en el total y no se duplican en la previsión.
- Accesos directos separados para añadir Prácticas, Trabajo y Libranza.
- Las prácticas nuevas proponen 6 horas por defecto; puedes cambiarlas en cada jornada.
- Libranzas manuales con motivo opcional. No suman horas.
- Selección múltiple de fechas y aplicación en bloque de prácticas, trabajo o libranza.
- Acción para seleccionar todos los días laborables del mes visible.
- Si una fecha seleccionada ya tiene un registro, se conserva sin sobrescribir y se informa antes de aplicar el lote.

## Actualizar desde la versión 1.x ya publicada

**No borres el proyecto de Supabase ni la tabla existente.** Esta actualización conserva los registros actuales.

### 1. Actualizar la base de datos para admitir libranzas

1. Abre Supabase → SQL Editor → New query.
2. Ponle el nombre `02 - Habilitar libranzas v2`.
3. Abre `02-actualizar-tipos-v2.sql`, copia el contenido y ejecútalo.
4. Debe aparecer `Success. No rows returned`.

Este paso amplía la restricción de tipos de la tabla para aceptar `leave` (libranza). No elimina ni modifica las jornadas existentes.

### 2. Sustituir los archivos de GitHub

1. Descomprime `mi-calendario-v2.zip` en tu ordenador.
2. Abre el repositorio GitHub `mi-calendario` y entra en la raíz.
3. Para cada archivo existente (`index.html`, `LEEME.md`, `css/style.css`, `js/app.js`, `js/config.js` y `supabase-schema.sql`), abre el archivo, pulsa el lápiz de edición y reemplaza su contenido por el del archivo nuevo correspondiente; guarda con **Commit changes**. También puedes eliminar los archivos antiguos y subir el contenido nuevo completo, manteniendo `index.html` en la raíz.
4. Sube además `02-actualizar-tipos-v2.sql` como documentación del proyecto.
5. No cambies `js/config.js`: ya contiene la URL y la publishable key de tu proyecto Supabase.

GitHub Pages volverá a publicar automáticamente los cambios. La base de datos y las jornadas permanecen en Supabase.

## Uso de las novedades

- **Prácticas:** añade una jornada con 6 horas propuestas por defecto. Puedes cambiar horas y horario.
- **Trabajo:** registra la jornada y sus horas.
- **Libranza:** registra un día libre manualmente, con un motivo opcional (festivo, vacaciones, asuntos propios, etc.). No se carga ningún calendario de festivos automáticamente.
- **Selección múltiple:** activa el modo, pulsa las fechas y elige qué tipo aplicar. `Laborables del mes` selecciona de lunes a viernes del mes que estás viendo. Las fechas que ya tengan registros se dejan intactas; no se sobrescriben.
- **Previsión de fin:** es una estimación orientativa basada en 500 horas objetivo, 6 horas por laborable y las fechas ya ocupadas que estén registradas. Los días futuros sin registro se consideran días de prácticas previstos; si sabes que libras o trabajas, márcalo para ajustar la estimación.

## Copias de seguridad y privacidad

- El botón **Exportar copia de seguridad** descarga los registros visibles de tu cuenta en JSON.
- La aplicación utiliza la publishable key en el navegador. Nunca pongas una `service_role` ni una `secret` key en `js/config.js`.
- Las políticas RLS de Supabase restringen los registros a la cuenta propietaria.
- No ejecutes de nuevo el SQL inicial de creación de tabla para esta actualización. Solo ejecuta la migración `02-actualizar-tipos-v2.sql` una vez.
