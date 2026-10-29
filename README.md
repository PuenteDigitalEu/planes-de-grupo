# Planes de Grupo

Calendario compartido para grupos de amigos. Cada plan del calendario tiene su ficha, donde se apuntan los asistentes, se reparte lo que hace falta (comida, regalos, tareas) y, si hace falta, se gestiona un bote de dinero. Todo se hace desde el móvil, sin instalar nada: basta con un enlace de alta que se puede mandar por WhatsApp.

Es gratis y de código abierto. Funciona con Google Apps Script y Google Calendar, así que cada grupo lo instala en su propia cuenta de Google y sus datos quedan en su Drive.

## Qué hace

- **Alta por enlace.** Cada amigo pone su nombre, su correo de Google y el código del grupo, y se le añade como editor del calendario compartido.
- **Ficha de cada plan.** Cada evento recibe su página con:
  - **¿Quién va?** Voy / Quizá / No voy.
  - **¿Qué hace falta?** Lista con cuatro tipos (comida y bebida, regalo, tarea, otro). Cualquiera se apunta con "Yo", y se puede indicar cuántas personas pueden llevar cada cosa.
  - **Bote (opcional):** total, cuota por persona, quién pone cuánto y quién ha pagado.
  - **Plan sorpresa:** se puede ocultar el plan a una persona concreta.
- **Resumen en el evento.** La app escribe en la descripción del evento quién va y qué falta.
- **Lista de planes** con los próximos eventos.

## Qué necesitas

- Una cuenta de Google (Gmail o cualquier correo que sirva para iniciar sesión).
- Un calendario de Google que será el del grupo.
- Unos 20 minutos la primera vez.

## Instalación paso a paso

### 1. Crea el calendario del grupo

1. Entra en Google Calendar (calendar.google.com).
2. En la columna izquierda, pulsa el **+** junto a "Otros calendarios" y elige **Crear calendario nuevo**.
3. Ponle nombre, por ejemplo "Planes del grupo".
4. Entra en su configuración (los tres puntos del calendario > **Configuración y uso compartido**).
5. Baja hasta **Integrar el calendario** y copia el **ID del calendario**. Termina en `@group.calendar.google.com`. Guárdalo, lo necesitarás en el paso 4.

### 2. Crea el proyecto de Apps Script

1. Entra en script.google.com con la misma cuenta y pulsa **Proyecto nuevo**.
2. Ponle un nombre, por ejemplo "Planes de Grupo".
3. En el archivo `Código.gs` que aparece por defecto, borra todo y pega el contenido de **Codigo.gs** de este repositorio.
4. Crea los archivos que faltan con el botón **+** junto a "Archivos":
   - **Archivo > HTML** llamado `Index`, y pega el contenido de **Index.html**.
   - **Archivo > HTML** llamado `Ficha`, y pega el contenido de **Ficha.html**.
   - **Archivo > HTML** llamado `Planes`, y pega el contenido de **Planes.html**.
   - **Archivo > Secuencia de comandos** llamado `Config`, y pega el contenido de **Config.gs**. Así `Config.gs` queda como archivo aparte.
   - **+ > Script** llamado `SorteoLogica`, y pega el contenido de **Sorteo.gs**.
   - **+ > HTML** llamado `Sorteo`, y pega el contenido de **Sorteo.html**.

   Nota: en el editor los nombres no llevan extensión. Deben coincidir exactamente: `Index`, `Ficha`, `Planes` y `Config`.

5. Pulsa **Guardar** (Ctrl+S).

### 3. Activa el servicio de Google Calendar

1. En el menú izquierdo, pulsa **Servicios** (el símbolo +).
2. Busca **Google Calendar API**, elige la versión **v3** y pulsa **Añadir**.
3. Ve a **Configuración del proyecto** (el engranaje) y pon la zona horaria de tu país: **Europe/Madrid** en España, **Europe/London** en Reino Unido.

### 4. Rellena la configuración

Abre el archivo `Config` y cambia solo lo que va entre comillas:

- **CALENDAR_ID:** el ID del calendario del paso 1.
- **NOMBRE_GRUPO:** el nombre que verá el grupo, por ejemplo "Los del pueblo".
- **CODIGO_GRUPO:** una palabra que solo sepáis en el grupo. Sirve para que no se apunte quien reciba el enlace reenviado.
- **ORGANIZADOR:** tu nombre, para que aparezcas en las fichas.
- **IDIOMA:** `'es-ES'` para España, `'en-GB'` para Reino Unido. Cambia las fechas y los números.
- **MONEDA:** `'EUR'` o `'GBP'`.
- **SIMBOLO_MONEDA:** `'€'` o `'£'`.
- **ZONA_HORARIA:** `'Europe/Madrid'` o `'Europe/London'`. Debe coincidir con la del paso 3.
- **URL_APP:** déjalo vacío por ahora (lo rellenarás en el paso 6).

Guarda el archivo.

### 5. Comprueba la configuración

1. En la barra superior, elige la función **comprobarConfiguracion** y pulsa **Ejecutar**.
2. La primera vez te pedirá permisos: acepta, y si aparece "Google no ha verificado esta aplicación", pulsa **Configuración avanzada > Ir a (nombre del proyecto)**. Es normal, porque es tu propia app.
3. Mira el registro de ejecución (**Ejecuciones**). Debe poner "Calendario OK", y la hoja de datos se habrá creado automáticamente en tu Drive.

### 6. Publica la app

1. Pulsa **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Ejecutar como: **Yo**.
4. Quién tiene acceso: **Cualquier usuario**.
5. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
6. Pégala en `URL_APP` del archivo `Config` y guarda.
7. Vuelve a **Implementar > Gestionar implementaciones**, pulsa el lápiz y elige **Versión: Nueva versión**. Después, **Implementar**. Usa siempre "Nueva versión", no "Nueva implementación", para que el enlace no cambie.

### 7. Activa la creación automática de fichas

1. Elige la función **activarAutomatico** y pulsa **Ejecutar**.
2. Esto crea un activador que cada 15 minutos revisa el calendario y crea la ficha de los planes nuevos.

### 8. Comparte el enlace con el grupo

Manda por WhatsApp la URL `/exec` del paso 6 y el código del grupo (por separado, si quieres). Cada uno hace el alta como se explica en la app.

## Amigo invisible

Desde **Ver los planes del grupo**, pulsa **🎁 Amigo invisible (para el organizador)**. Solo el organizador puede crear y sortear.

1. **Crear el sorteo:** ponle un título, un tope de gasto (opcional) y marca quién participa. Hacen falta al menos 3 personas, y cada una debe estar dada de alta con su correo.
2. **Sortear y enviar correos:** la app reparte al azar y manda a cada participante un correo con su enlace privado. Nadie se regala a sí mismo; no hay parejas excluidas.
3. **Cada participante** abre su enlace y pulsa **Ver a quién me toca**. Se le muestra solo su resultado y el tope de gasto.
4. **Rehacer:** mientras nadie haya visto su resultado, el organizador puede rehacer el sorteo. Los enlaces anteriores dejan de valer.

**Privacidad, en claro:**
- El organizador no ve quién regala a quién: el resultado va cifrado en la hoja y la clave es el enlace que llega al correo de cada uno.
- Quien tenga tu enlace privado verá tu resultado. No lo compartas.
- El tope de gasto es orientativo: la app no compra ni controla lo que se gasta.

## Cómo crear un plan

Cualquiera del grupo crea un evento en el calendario del grupo (no en el suyo personal). En unos minutos aparece su ficha con el enlace para apuntarse.

Para un plan sorpresa, pon 🤫 o la palabra "sorpresa" en el título o la descripción: el evento no mostrará quién va ni qué se lleva, y en la ficha eliges a quién se oculta.

## Límites que conviene saber

- **No hay contraseñas.** Cada uno elige su nombre. Sirve entre amigos, pero no impide que alguien se haga pasar por otro.
- **Lo que se ve en el calendario lo ve todo el grupo**: título, fecha y lugar, incluso en un plan sorpresa.
- **Los eventos que se repiten no tienen ficha.**
- **Límites de Google.** Apps Script tiene cuotas diarias. Para un grupo de hasta unas 60 personas sobra, pero no es un servicio pensado para miles de usuarios.
- **Cualquiera del grupo puede crear, cambiar o borrar eventos del calendario**, porque todos son editores.
- **En iPhone**, cada persona debe activar el calendario en calendar.google.com/calendar/syncselect para que aparezca.

## Actualizar la app

1. Sustituye el contenido del archivo que cambie (Ctrl+A y pegar). Comprueba que el archivo termina en `</html>` o en la última llave.
2. Guarda (Ctrl+S).
3. Implementar > Gestionar implementaciones > lápiz > **Nueva versión** > Implementar.
4. Si cambias el resumen de los eventos, ejecuta **sincronizarEventos**.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| "Cargando el plan…" sin avanzar | El archivo HTML se pegó cortado. Revisa que termina bien. |
| Los cambios no se ven | Falta publicar la "Nueva versión", o el móvil muestra la página guardada. Cierra la pestaña y vuelve a abrirla. |
| Errores del servidor | Apps Script > Ejecuciones. |
| "No encuentro el calendario" | Revisa el CALENDAR_ID de `Config`. |

## Licencia

MIT. Puedes usar, copiar y modificar este código, siempre que mantengas el aviso de copyright y la autoría de Rafael Moreno Vicens. Consulta el archivo [LICENSE](LICENSE).
