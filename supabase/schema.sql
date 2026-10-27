-- =====================================================================
-- ROUTE 64 · Base de datos de la tienda
-- Ejecutar completo en Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Configuración general de la tienda (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                   int primary key default 1 check (id = 1),
  store_name           text default 'Route 64',
  tagline              text default 'Colecciona. Disfruta. Vive tu pasión.',
  announcement         text default 'Envíos a toda Colombia',
  about                text default 'Tienda de autos a escala Hot Wheels y figuras coleccionables de vehículos comerciales.',
  whatsapp             text default '',
  phone                text default '',
  email                text default '',
  instagram            text default '',
  facebook             text default '',
  tiktok               text default '',
  address              text default '',
  city                 text default 'Bucaramanga',
  hours                text default 'Lunes a sábado, 9:00 a. m. – 7:00 p. m.',
  shipping_cost        int  default 0 check (shipping_cost >= 0),
  free_shipping_from   int  default 0 check (free_shipping_from >= 0),
  shipping_note        text default 'El costo de envío se confirma por WhatsApp según la ciudad de destino.',
  payment_instructions text default 'Realiza la transferencia y envía el comprobante por WhatsApp indicando la referencia del pedido.',
  wompi_public_key     text default '',
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Datos privados (solo administradores)
create table if not exists public.private_settings (
  id                     int primary key default 1 check (id = 1),
  wompi_integrity_secret text default ''
);
insert into public.private_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Secciones del catálogo
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text default '',
  image_url   text default '',
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Productos (precios en pesos colombianos, sin decimales)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid references public.categories(id) on delete set null,
  name             text not null,
  description      text default '',
  brand            text default '',
  scale            text default '1:64',
  price            int  not null check (price >= 0),
  compare_at_price int  check (compare_at_price is null or compare_at_price >= 0),
  stock            int  not null default 1 check (stock >= 0),
  images           text[] not null default '{}',
  featured         boolean not null default false,
  active           boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);

-- ---------------------------------------------------------------------
-- Anuncios / promociones del inicio
-- ---------------------------------------------------------------------
create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text default '',
  badge       text default '',
  image_url   text default '',
  button_text text default 'Ver catálogo',
  button_link text default '#/catalogo',
  starts_at   timestamptz,
  ends_at     timestamptz,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  customer_name  text not null,
  customer_email text default '',
  customer_phone text not null,
  document_id    text default '',
  address        text default '',
  city           text default '',
  notes          text default '',
  items          jsonb not null,
  subtotal       int not null,
  shipping       int not null default 0,
  total          int not null,
  payment_method text not null,
  status         text not null default 'pendiente'
                 check (status in ('pendiente','pagado','enviado','entregado','cancelado')),
  admin_notes    text default '',
  created_at     timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders(created_at desc);

-- ---------------------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------------------
alter table public.admins           enable row level security;
alter table public.settings         enable row level security;
alter table public.private_settings enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.banners          enable row level security;
alter table public.orders           enable row level security;

drop policy if exists "admins_read"     on public.admins;
create policy "admins_read" on public.admins for select using (public.is_admin());

drop policy if exists "settings_read"   on public.settings;
drop policy if exists "settings_write"  on public.settings;
create policy "settings_read"  on public.settings for select using (true);
create policy "settings_write" on public.settings for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "private_admin"   on public.private_settings;
create policy "private_admin" on public.private_settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "categories_read"  on public.categories;
drop policy if exists "categories_admin" on public.categories;
create policy "categories_read"  on public.categories for select using (active or public.is_admin());
create policy "categories_admin" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products_read"  on public.products;
drop policy if exists "products_admin" on public.products;
create policy "products_read"  on public.products for select using (active or public.is_admin());
create policy "products_admin" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "banners_read"  on public.banners;
drop policy if exists "banners_admin" on public.banners;
create policy "banners_read" on public.banners for select using (
  public.is_admin() or (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()))
);
create policy "banners_admin" on public.banners for all using (public.is_admin()) with check (public.is_admin());

-- Los pedidos solo los ve el administrador; los clientes los crean con create_order()
drop policy if exists "orders_admin" on public.orders;
create policy "orders_admin" on public.orders for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Crear pedido (compra como invitado). Calcula precios desde la base de
-- datos para que no se puedan alterar desde el navegador.
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_customer jsonb, p_items jsonb, p_payment_method text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_item     jsonb;
  v_prod     public.products%rowtype;
  v_qty      int;
  v_items    jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_shipping int := 0;
  v_total    int;
  v_ref      text;
  v_set      public.settings%rowtype;
  v_secret   text;
  v_sig      text := null;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'El carrito está vacío o no es válido';
  end if;
  if coalesce(trim(p_customer->>'name'), '') = '' or coalesce(trim(p_customer->>'phone'), '') = '' then
    raise exception 'Nombre y teléfono son obligatorios';
  end if;
  if p_payment_method not in ('wompi', 'transferencia', 'whatsapp') then
    raise exception 'Método de pago no válido';
  end if;

  select * into v_set from public.settings where id = 1;

  if p_payment_method = 'wompi' then
    select wompi_integrity_secret into v_secret from public.private_settings where id = 1;
    if coalesce(v_secret, '') = '' or coalesce(v_set.wompi_public_key, '') = '' then
      raise exception 'El pago en línea no está configurado';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));
    select * into v_prod from public.products where id = (v_item->>'id')::uuid and active;
    if not found then
      raise exception 'Un producto del carrito ya no está disponible';
    end if;
    if v_prod.stock < v_qty then
      raise exception 'No hay unidades suficientes de %', v_prod.name;
    end if;
    v_items := v_items || jsonb_build_object(
      'id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price,
      'qty', v_qty, 'image', coalesce(v_prod.images[1], ''));
    v_subtotal := v_subtotal + v_prod.price * v_qty;
  end loop;

  v_shipping := case
    when coalesce(v_set.free_shipping_from, 0) > 0 and v_subtotal >= v_set.free_shipping_from then 0
    else coalesce(v_set.shipping_cost, 0) end;
  v_total := v_subtotal + v_shipping;

  v_ref := 'R64-' || to_char(now() at time zone 'America/Bogota', 'YYMMDD') || '-'
           || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.orders (reference, customer_name, customer_email, customer_phone, document_id,
                             address, city, notes, items, subtotal, shipping, total, payment_method)
  values (v_ref,
          left(trim(p_customer->>'name'), 120),
          left(coalesce(p_customer->>'email', ''), 160),
          left(trim(p_customer->>'phone'), 40),
          left(coalesce(p_customer->>'document', ''), 40),
          left(coalesce(p_customer->>'address', ''), 300),
          left(coalesce(p_customer->>'city', ''), 120),
          left(coalesce(p_customer->>'notes', ''), 1000),
          v_items, v_subtotal, v_shipping, v_total, p_payment_method);

  if p_payment_method = 'wompi' then
    v_sig := encode(extensions.digest(v_ref || (v_total::bigint * 100)::text || 'COP' || v_secret, 'sha256'), 'hex');
  end if;

  return jsonb_build_object(
    'reference', v_ref, 'items', v_items, 'subtotal', v_subtotal, 'shipping', v_shipping,
    'total', v_total, 'amount_in_cents', v_total::bigint * 100,
    'signature', v_sig, 'public_key', v_set.wompi_public_key);
end;
$$;

revoke all on function public.create_order(jsonb, jsonb, text) from public;
grant execute on function public.create_order(jsonb, jsonb, text) to anon, authenticated;

-- Consulta del estado de un pedido por su referencia (para el cliente)
create or replace function public.order_status(p_reference text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('reference', reference, 'status', status, 'total', total, 'created_at', created_at)
  from public.orders where reference = p_reference;
$$;
grant execute on function public.order_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Inventario: descuenta unidades cuando el pedido se marca como pagado
-- y las devuelve si un pedido pagado se cancela.
-- ---------------------------------------------------------------------
create or replace function public.apply_order_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  it   jsonb;
  paid text[] := array['pagado', 'enviado', 'entregado'];
begin
  if new.status = any(paid) and not (old.status = any(paid)) then
    for it in select * from jsonb_array_elements(new.items) loop
      update public.products set stock = greatest(0, stock - (it->>'qty')::int) where id = (it->>'id')::uuid;
    end loop;
  elsif new.status = 'cancelado' and old.status = any(paid) then
    for it in select * from jsonb_array_elements(new.items) loop
      update public.products set stock = stock + (it->>'qty')::int where id = (it->>'id')::uuid;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stock on public.orders;
create trigger orders_stock after update of status on public.orders
for each row execute function public.apply_order_stock();

-- ---------------------------------------------------------------------
-- Almacenamiento de fotos (bucket público "imagenes")
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('imagenes', 'imagenes', true)
on conflict (id) do update set public = true;

drop policy if exists "imagenes_read"   on storage.objects;
drop policy if exists "imagenes_insert" on storage.objects;
drop policy if exists "imagenes_update" on storage.objects;
drop policy if exists "imagenes_delete" on storage.objects;
create policy "imagenes_read"   on storage.objects for select using (bucket_id = 'imagenes');
create policy "imagenes_insert" on storage.objects for insert with check (bucket_id = 'imagenes' and public.is_admin());
create policy "imagenes_update" on storage.objects for update using (bucket_id = 'imagenes' and public.is_admin());
create policy "imagenes_delete" on storage.objects for delete using (bucket_id = 'imagenes' and public.is_admin());

-- ---------------------------------------------------------------------
-- Secciones iniciales (se pueden editar o borrar desde el panel)
-- ---------------------------------------------------------------------
insert into public.categories (name, slug, description, sort_order) values
  ('Hot Wheels',              'hot-wheels',   'Mainline, Super Treasure Hunt y ediciones especiales.', 1),
  ('Premium y Car Culture',   'premium',      'Series premium con llantas de caucho y detalles metálicos.', 2),
  ('Vehículos comerciales',   'comerciales',  'Camiones, furgones y vehículos de marcas comerciales.', 3),
  ('Accesorios y exhibición', 'accesorios',   'Vitrinas, protectores y accesorios para coleccionistas.', 4)
on conflict (slug) do nothing;

-- =====================================================================
-- ÚLTIMO PASO (después de crear el usuario administrador en
-- Authentication → Users → Add user): reemplazar el correo y ejecutar.
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'correo-del-admin@ejemplo.com'
--   on conflict do nothing;
-- =====================================================================
