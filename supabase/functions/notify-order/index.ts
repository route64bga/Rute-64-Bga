// =====================================================================
// ROUTE 64 · Función "notify-order"
// Envía correos al cliente (y a la tienda en pedidos nuevos) cuando el
// pedido se crea, cambia de estado o se registra la guía de envío.
// La base de datos la llama automáticamente; no se usa desde la página.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   GMAIL_USER          correo de Gmail que envía (ej. route64bga@gmail.com)
//   GMAIL_APP_PASSWORD  contraseña de aplicación de 16 letras de ese Gmail
//   SITE_URL            dirección de la tienda (ej. https://route64bga.github.io/Rute-64-Bga/)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.14';

type Item = { name: string; qty: number; price: number };
type Order = {
  id: string; reference: string; access_token: string; status: string; created_at: string;
  customer_name: string; customer_email: string; customer_phone: string; city: string; address: string; notes: string;
  items: Item[]; subtotal: number; shipping: number; total: number; payment_method: string;
  carrier: string; tracking_number: string; tracking_url: string; email_log: unknown[];
};

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO').replace(/,/g, '.');
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const METHOD: Record<string, string> = {
  wompi: 'Pago en línea (Wompi)',
  transferencia: 'Transferencia / Nequi',
  whatsapp: 'Acordado por WhatsApp',
};

function content(kind: string, o: Order, s: Record<string, string>) {
  const store = s.store_name || 'Route 64';
  const first = esc((o.customer_name || '').split(' ')[0]);
  switch (kind) {
    case 'creado':
      return {
        subject: `Recibimos tu pedido ${o.reference}`,
        title: 'Pedido recibido',
        intro: o.payment_method === 'wompi'
          ? `Hola ${first}, registramos tu pedido. Cuando el pago sea aprobado te enviaremos la confirmación.`
          : o.payment_method === 'transferencia'
            ? `Hola ${first}, registramos tu pedido. Para continuar, realiza el pago con los datos indicados abajo y envía el comprobante por WhatsApp con la referencia del pedido.`
            : `Hola ${first}, registramos tu pedido. Te contactaremos por WhatsApp para confirmar la disponibilidad, el envío y el pago.`,
        extra: o.payment_method === 'transferencia' && s.payment_instructions
          ? `<p style="margin:16px 0 0;padding:14px;background:#f4f4f5;border-radius:8px"><b>Datos para el pago</b><br>${esc(s.payment_instructions).replace(/\n/g, '<br>')}<br><br>Valor: <b>${money(o.total)}</b> · Referencia: <b>${esc(o.reference)}</b></p>`
          : '',
      };
    case 'pagado':
      return { subject: `Pago confirmado · pedido ${o.reference}`, title: 'Pago confirmado', intro: `Hola ${first}, confirmamos el pago de tu pedido. Lo estamos preparando y te avisaremos cuando sea enviado.`, extra: '' };
    case 'enviado':
    case 'guia':
      return {
        subject: kind === 'guia' ? `Actualización de envío · pedido ${o.reference}` : `Tu pedido ${o.reference} fue enviado`,
        title: kind === 'guia' ? 'Datos de envío actualizados' : 'Pedido enviado',
        intro: `Hola ${first}, tu pedido va en camino a ${esc(o.city)}.`,
        extra: o.tracking_number || o.carrier
          ? `<p style="margin:16px 0 0;padding:14px;background:#f4f4f5;border-radius:8px">
               ${o.carrier ? `Transportadora: <b>${esc(o.carrier)}</b><br>` : ''}
               ${o.tracking_number ? `Número de guía: <b>${esc(o.tracking_number)}</b>` : ''}
               ${/^https?:\/\//.test(o.tracking_url || '') ? `<br><a href="${esc(o.tracking_url)}" style="color:#e30613">Rastrear en la transportadora</a>` : ''}
             </p>`
          : '',
      };
    case 'entregado':
      return { subject: `Pedido ${o.reference} entregado`, title: 'Pedido entregado', intro: `Hola ${first}, tu pedido figura como entregado. Gracias por comprar en ${store}.`, extra: '' };
    case 'cancelado':
      return { subject: `Pedido ${o.reference} cancelado`, title: 'Pedido cancelado', intro: `Hola ${first}, tu pedido fue cancelado. Si tienes preguntas, escríbenos por WhatsApp.`, extra: '' };
    default:
      return null;
  }
}

function layout(o: Order, s: Record<string, string>, c: { title: string; intro: string; extra: string }, link: string) {
  const store = esc(s.store_name || 'Route 64');
  const rows = (o.items || []).map((i) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${i.qty} × ${esc(i.name)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${money(i.qty * i.price)}</td></tr>`).join('');
  const wa = (s.whatsapp || '').replace(/\D/g, '');
  const waNum = wa.length === 10 ? '57' + wa : wa;
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0a0a0b;padding:20px 24px;border-bottom:4px solid #e30613">
      <span style="color:#ffffff;font-size:22px;font-weight:800;font-style:italic;letter-spacing:.5px">${store.toUpperCase()}</span>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:22px">${esc(c.title)}</h1>
      <p style="margin:0;color:#3f3f46;line-height:1.5">${c.intro}</p>
      ${c.extra}
      <p style="margin:20px 0 6px;color:#71717a;font-size:13px">Referencia del pedido</p>
      <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:1px">${esc(o.reference)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;font-size:14px">
        ${rows}
        <tr><td style="padding:6px 0;color:#71717a">Envío</td><td style="padding:6px 0;text-align:right;color:#71717a">${o.shipping ? money(o.shipping) : 'Por confirmar / gratis'}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;text-align:right;font-weight:700">${money(o.total)}</td></tr>
      </table>
      <p style="margin:6px 0 0;color:#71717a;font-size:13px">Método de pago: ${esc(METHOD[o.payment_method] || o.payment_method)}</p>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${esc(link)}" style="display:inline-block;background:#e30613;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:6px">Ver el estado de mi pedido</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#fafafa;color:#71717a;font-size:12px;line-height:1.5">
      ${store}${s.city ? ' · ' + esc(s.city) : ''}${waNum ? ` · WhatsApp: <a href="https://wa.me/${waNum}" style="color:#71717a">${esc(s.whatsapp)}</a>` : ''}<br>
      Recibes este correo porque realizaste una compra en nuestra tienda.
    </td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: priv } = await sb.from('private_settings').select('notify_secret').eq('id', 1).single();
  if (!priv?.notify_secret || req.headers.get('x-notify-secret') !== priv.notify_secret) {
    return json({ error: 'No autorizado' }, 403);
  }

  const { order_id, kind } = await req.json().catch(() => ({}));
  const { data: o } = await sb.from('orders').select('*').eq('id', order_id).single<Order>();
  if (!o) return json({ error: 'Pedido no encontrado' }, 404);
  const { data: s } = await sb.from('settings').select('*').eq('id', 1).single();

  const user = Deno.env.get('GMAIL_USER');
  const pass = (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s/g, '');
  if (!user || !pass) return json({ error: 'Faltan GMAIL_USER o GMAIL_APP_PASSWORD' }, 500);

  const site = (Deno.env.get('SITE_URL') || 'https://route64bga.github.io/Rute-64-Bga/').replace(/\/?$/, '/');
  const link = `${site}#/pedido/${o.reference}?t=${o.access_token}`;
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  const from = `"${(s?.store_name || 'Route 64').replace(/"/g, '')}" <${user}>`;
  const log: Record<string, unknown>[] = [];
  const at = new Date().toISOString();

  // Correo al cliente
  const c = content(kind, o, s || {});
  if (c && o.customer_email) {
    try {
      await transporter.sendMail({ from, to: o.customer_email, replyTo: s?.email || user, subject: c.subject, html: layout(o, s || {}, c, link) });
      log.push({ at, kind, to: o.customer_email, ok: true });
    } catch (e) {
      log.push({ at, kind, to: o.customer_email, ok: false, error: String((e as Error).message || e).slice(0, 200) });
    }
  }

  // Aviso a la tienda cuando entra un pedido nuevo
  const storeEmail = s?.email || user;
  if (kind === 'creado' && storeEmail) {
    const lines = (o.items || []).map((i) => `${i.qty} × ${i.name} — ${money(i.qty * i.price)}`).join('\n');
    try {
      await transporter.sendMail({
        from, to: storeEmail,
        subject: `Nuevo pedido ${o.reference} · ${money(o.total)}`,
        text: `Nuevo pedido en la tienda.\n\nReferencia: ${o.reference}\nCliente: ${o.customer_name}\nCelular: ${o.customer_phone}\nCorreo: ${o.customer_email || '—'}\nCiudad: ${o.city}\nDirección: ${o.address}\nNotas: ${o.notes || '—'}\nPago: ${METHOD[o.payment_method] || o.payment_method}\n\n${lines}\nEnvío: ${money(o.shipping)}\nTotal: ${money(o.total)}\n\nPanel: ${site}admin.html`,
      });
      log.push({ at, kind: 'aviso-tienda', to: storeEmail, ok: true });
    } catch (e) {
      log.push({ at, kind: 'aviso-tienda', to: storeEmail, ok: false, error: String((e as Error).message || e).slice(0, 200) });
    }
  }

  if (log.length) {
    await sb.from('orders').update({ email_log: [...(o.email_log || []), ...log].slice(-30) }).eq('id', o.id);
  }
  return json({ ok: true, sent: log });
});
