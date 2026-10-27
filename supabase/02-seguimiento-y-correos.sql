-- =====================================================================
-- ROUTE 64 · Actualización 02: seguimiento de pedidos y correos
-- Ejecutar completo en Supabase → SQL Editor → New query → Run.
-- Requiere haber ejecutado antes schema.sql. Se puede volver a ejecutar.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- Nuevos datos del pedido
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists access_token    uuid not null default gen_random_uuid();
alter table public.orders add column if not exists carrier         text default '';
alter table public.orders add column if not exists tracking_number text default '';
alter table public.orders add column if not exists tracking_url    text default '';
alter table public.orders add column if not exists paid_at         timestamptz;
alter table public.orders add column if not exists shipped_at      timestamptz;
alter table public.orders add column if not exists delivered_at    timestamptz;
alter table public.orders add column if not exists cancelled_at    timestamptz;
alter table public.orders add column if not exists email_log       jsonb not null default '[]'::jsonb;

-- Datos internos para el envío de correos (solo administradores)
alter table public.private_settings add column if not exists notify_secret text default '';
alter table public.private_settings add column if not exists functions_url text default '';
alter table public.private_settings add column if not exists anon_key      text default '';

update public.private_settings
set notify_secret = case when coalesce(notify_secret, '') = '' then encode(extensions.gen_random_bytes(24), 'hex') else notify_secret end,
    functions_url = 'https://djfoaqiwikcmoneiesgb.supabase.co/functions/v1',
    anon_key      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZm9hcWl3aWtjbW9uZWllc2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMDU4MjksImV4cCI6MjEwODY4MTgyOX0.nxV6fgkel0gQN75uBHpqDpdvo-1mzTGoTBqa0nzlIKU'
where id = 1;

-- ---------------------------------------------------------------------
-- Fecha de cada cambio de estado
-- ---------------------------------------------------------------------
create or replace function public.set_order_dates()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pagado'    then new.paid_at      := coalesce(new.paid_at, now()); end if;
    if new.status = 'enviado'   then new.shipped_at   := coalesce(new.shipped_at, now());
                                     new.paid_at      := coalesce(new.paid_at, now()); end if;
    if new.status = 'entregado' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
    if new.status = 'cancelado' then new.cancelled_at := now(); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_dates on public.orders;
create trigger orders_dates before update on public.orders
for each row execute function public.set_order_dates();

-- ---------------------------------------------------------------------
-- Crear pedido: ahora devuelve también el código de acceso del cliente
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
  v_token    uuid;
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
          left(lower(trim(coalesce(p_customer->>'email', ''))), 160),
          left(trim(p_customer->>'phone'), 40),
          left(coalesce(p_customer->>'document', ''), 40),
          left(coalesce(p_customer->>'address', ''), 300),
          left(coalesce(p_customer->>'city', ''), 120),
          left(coalesce(p_customer->>'notes', ''), 1000),
          v_items, v_subtotal, v_shipping, v_total, p_payment_method)
  returning access_token into v_token;

  if p_payment_method = 'wompi' then
    v_sig := encode(extensions.digest(v_ref || (v_total::bigint * 100)::text || 'COP' || v_secret, 'sha256'), 'hex');
  end if;

  return jsonb_build_object(
    'reference', v_ref, 'token', v_token, 'items', v_items, 'subtotal', v_subtotal, 'shipping', v_shipping,
    'total', v_total, 'amount_in_cents', v_total::bigint * 100,
    'signature', v_sig, 'public_key', v_set.wompi_public_key);
end;
$$;

revoke all on function public.create_order(jsonb, jsonb, text) from public;
grant execute on function public.create_order(jsonb, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Consulta del pedido por el cliente: referencia + código de acceso
-- (enlace del correo) o referencia + celular.
-- ---------------------------------------------------------------------
create or replace function public.track_order(p_reference text, p_token text default null, p_phone text default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'reference', o.reference, 'token', o.access_token, 'status', o.status, 'created_at', o.created_at,
    'customer_name', o.customer_name, 'city', o.city, 'address', o.address,
    'items', o.items, 'subtotal', o.subtotal, 'shipping', o.shipping, 'total', o.total,
    'payment_method', o.payment_method,
    'carrier', o.carrier, 'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url,
    'paid_at', o.paid_at, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at)
  from public.orders o
  where upper(o.reference) = upper(trim(p_reference))
    and (
      (coalesce(p_token, '') <> '' and o.access_token::text = trim(p_token))
      or (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
          and right(regexp_replace(o.customer_phone, '\D', '', 'g'), 7)
            = right(regexp_replace(p_phone, '\D', '', 'g'), 7))
    )
  limit 1;
$$;
grant execute on function public.track_order(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Aviso automático: llama a la función de correo "notify-order" cuando
-- se crea el pedido, cambia de estado o se registra la guía.
-- Si la función no existe todavía, el pedido se guarda igual.
-- ---------------------------------------------------------------------
create or replace function public.notify_order_email()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_kind text;
  p      public.private_settings%rowtype;
begin
  if tg_op = 'INSERT' then
    v_kind := 'creado';
  elsif new.status is distinct from old.status then
    v_kind := new.status;
  elsif new.status = 'enviado' and (
        new.tracking_number is distinct from old.tracking_number
     or new.carrier is distinct from old.carrier
     or new.tracking_url is distinct from old.tracking_url) then
    v_kind := 'guia';
  else
    return new;
  end if;

  select * into p from public.private_settings where id = 1;
  if coalesce(p.functions_url, '') = '' then
    return new;
  end if;

  begin
    perform net.http_post(
      url     := p.functions_url || '/notify-order',
      body    := jsonb_build_object('order_id', new.id, 'kind', v_kind),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p.anon_key,
        'x-notify-secret', p.notify_secret)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify after insert or update on public.orders
for each row execute function public.notify_order_email();
