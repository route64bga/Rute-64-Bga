# Route 64 · Tienda en línea

Tienda de autos Hot Wheels y coleccionables a escala. Página estática alojada en GitHub Pages; los datos, las fotos y los pedidos se guardan en Supabase.

- **Tienda:** `index.html`. Incluye inicio con anuncios, catálogo por secciones, carrito, compra como invitado, contacto y redes sociales.
- **Panel de administración:** `admin.html`. Requiere inicio de sesión y permite gestionar pedidos, productos con fotos, secciones, anuncios y la configuración de la tienda.

Mientras `config.js` no tenga los datos de Supabase, la página funciona en **modo demostración** con productos de ejemplo.

---

## Puesta en marcha

### 1. Crear la base de datos
1. Entrar a Supabase, abrir el proyecto y luego **SQL Editor → New query**.
2. Pegar todo el contenido de `supabase/schema.sql` y pulsar **Run**.

Este paso crea las tablas, la seguridad, el almacenamiento de fotos y las secciones iniciales.

### 2. Crear el usuario administrador
1. Ir a **Authentication → Users → Add user → Create new user**. Escribir el correo y la contraseña del administrador y marcar **Auto Confirm User**.
2. En **SQL Editor**, ejecutar la siguiente consulta cambiando el correo:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'correo-del-admin@ejemplo.com'
   on conflict do nothing;
   ```
3. En **Authentication → URL Configuration**, poner como *Site URL* la dirección de la página (paso 4). Así funciona el enlace de "¿Olvidaste tu contraseña?".

### 3. Conectar la página con Supabase
En Supabase, ir a **Project Settings → API** y copiar en `config.js`:
- `SUPABASE_URL`: el *Project URL*.
- `SUPABASE_ANON_KEY`: la clave pública *anon* o *publishable*.

> No usar nunca la clave `service_role` ni la `secret` en este archivo.

### 4. Publicar con GitHub Pages
En GitHub, ir a **Settings → Pages**:
- **Source:** Deploy from a branch.
- **Branch:** `main`, carpeta `/ (root)`.

La página queda publicada en `https://route64bga.github.io/Rute-64-Bga/` y el panel en `https://route64bga.github.io/Rute-64-Bga/admin.html`.

### 5. Pago en línea con Wompi (opcional)
1. Crear una cuenta de comercio en Wompi.
2. En el panel de Wompi, ir a **Desarrolladores** y copiar la **llave pública** y el **secreto de integridad**.
3. Pegar ambos datos en el panel de administración, en **Configuración → Pagos**.

Mientras no se configure Wompi, los clientes pueden pagar por transferencia o Nequi, o acordar el pago por WhatsApp.

### 6. Seguimiento de pedidos y correos automáticos
1. En **SQL Editor**, ejecutar todo el archivo `supabase/02-seguimiento-y-correos.sql`.
2. En la cuenta de Gmail que envía los correos (route64bga@gmail.com):
   - Activar la **verificación en dos pasos**.
   - Crear una **contraseña de aplicación** en https://myaccount.google.com/apppasswords.
3. En Supabase, ir a **Edge Functions → Deploy a new function → Via Editor**:
   - Nombre: `notify-order`.
   - Pegar el contenido de `supabase/functions/notify-order/index.ts` y pulsar **Deploy**.
4. En **Edge Functions → Secrets**, agregar:
   - `GMAIL_USER`: el correo de Gmail.
   - `GMAIL_APP_PASSWORD`: la contraseña de aplicación de 16 letras.
   - `SITE_URL`: `https://route64bga.github.io/Rute-64-Bga/`

Con esto, el cliente recibe un correo cuando su pedido se registra, se paga, se envía (con la guía), se entrega o se cancela. La tienda recibe un aviso por cada pedido nuevo. El cliente puede consultar su pedido en la sección **Mi pedido** de la tienda, con la referencia y su celular, o desde el enlace del correo.

---

## Funcionamiento de los pedidos
- El cliente compra sin registrarse. El total se calcula en la base de datos con los precios vigentes, por lo que no se puede alterar desde el navegador.
- Todo pedido nuevo queda en estado **Pendiente**.
- Cuando el administrador lo marca como **Pagado**, las unidades se descuentan del inventario. Si un pedido pagado se cancela, las unidades se devuelven.
- Los pagos con Wompi se verifican en el panel de Wompi y se marcan como pagados desde el panel de la tienda.

## Estructura
```
index.html            Tienda
admin.html            Panel de administración
config.js             Conexión con Supabase
assets/css/styles.css Estilos
assets/js/core.js     Conexión, utilidades y datos de demostración
assets/js/app.js      Lógica de la tienda
assets/js/admin.js    Lógica del panel
assets/img/           Logo e íconos
supabase/schema.sql   Base de datos
supabase/02-seguimiento-y-correos.sql  Seguimiento y correos
supabase/functions/notify-order/       Función que envía los correos
```
