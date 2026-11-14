# Mi calendario — guía de publicación

Esta aplicación está construida con HTML, CSS y JavaScript. GitHub Pages publica la interfaz y Supabase guarda los datos de forma privada en la nube.

## 1. Crear el proyecto de Supabase

1. Entra en https://supabase.com/ y crea una cuenta (puedes usar el plan gratuito).
2. Crea un proyecto nuevo. Ponle un nombre, crea una contraseña segura para la base de datos y elige una región europea.
3. Cuando el proyecto esté creado, abre **Project Settings → API** (en algunas versiones aparece como **API Keys**).
4. Copia la **Project URL** y la clave pública **anon / publishable**. Nunca uses la `service_role` o `secret key` en una web.

## 2. Crear la tabla

1. En el panel de Supabase abre **SQL Editor**.
2. Pulsa **New query**.
3. Abre el archivo `supabase-schema.sql` de esta carpeta, copia todo su contenido y pégalo en el editor.
4. Pulsa **Run**. Esto crea la tabla y las reglas para que cada usuario solo pueda consultar y modificar sus propios registros.

## 3. Conectar la aplicación

Abre `js/config.js` y sustituye los dos textos de ejemplo:

- `PEGA_AQUI_TU_PROJECT_URL` por la Project URL.
- `PEGA_AQUI_TU_PUBLISHABLE_O_ANON_KEY` por la clave pública anon/publishable.

No pongas nunca una clave `service_role` ni una clave `secret` en este archivo. La clave pública es apta para el navegador porque la seguridad real la aplican las políticas RLS creadas en el SQL.

## 4. Publicar en GitHub Pages

1. Entra en https://github.com/ e inicia sesión o crea una cuenta.
2. Pulsa **New repository**.
3. Pon como nombre `mi-calendario` y selecciona **Public**. No hace falta añadir README, licencia ni `.gitignore`.
4. En el repositorio, pulsa **Add file → Upload files**.
5. Descomprime `mi-calendario.zip` en tu ordenador y arrastra el CONTENIDO de la carpeta (index.html, css, js, supabase-schema.sql y LEEME.md) a GitHub. El archivo `index.html` debe quedar en la raíz del repositorio.
6. Pulsa **Commit changes**.
7. Ve a **Settings → Pages**.
8. En **Build and deployment**, selecciona **Deploy from a branch**. Elige `main` y `/ (root)` y pulsa **Save**.
9. Espera unos minutos. GitHub mostrará la dirección pública de tu aplicación, con formato `https://TU-USUARIO.github.io/mi-calendario/`.

## 5. Primer acceso

1. Abre la dirección de GitHub Pages.
2. Selecciona **Crear cuenta**, introduce tu correo y una contraseña.
3. Si Supabase pide confirmación por correo, abre el mensaje y confirma la cuenta. Después inicia sesión.
4. Abre la misma dirección en el móvil e inicia sesión con la misma cuenta. Los registros se sincronizan a través de Supabase.

## Notas importantes

- La web necesita conexión a Internet para iniciar sesión y sincronizar los datos.
- Los datos se guardan en Supabase; GitHub Pages solo aloja los archivos de la aplicación.
- El botón **Exportar copia de seguridad** descarga tus registros en formato JSON.
- Para instalarla en el móvil, abre la web en el navegador y usa la opción **Añadir a pantalla de inicio**.
- Si cambias el código, vuelve a subir los archivos modificados a GitHub. Los datos de Supabase no se borran al actualizar la web.
- El proyecto no contiene claves privadas. La clave anon/publishable del navegador no es un secreto; las políticas RLS limitan el acceso a los datos de cada cuenta.
