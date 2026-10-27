// =====================================================================
// ROUTE 64 · Núcleo compartido (tienda y panel)
// Conexión con Supabase, utilidades, íconos y datos de demostración.
// =====================================================================

const cfg = window.R64_CONFIG || {};
export const DEMO = !(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export const BUCKET = 'imagenes';

let _client = null;
export async function sb() {
  if (DEMO) return null;
  if (!_client) {
    const { createClient } = await import(SUPABASE_CDN);
    _client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: 'r64-auth' },
    });
  }
  return _client;
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const money = (n) => fmt.format(Number(n) || 0).replace(/\s/g, ' ');

export const slugify = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Solo permite enlaces http(s), rutas internas (#/...), mailto, tel y wa.me
export function safeUrl(u) {
  const v = String(u || '').trim();
  if (!v) return '';
  if (/^(https?:|mailto:|tel:)/i.test(v) || v.startsWith('#') || v.startsWith('/') || /^data:image\//i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return 'https://' + v;
  return '';
}

export function waNumber(num) {
  const d = String(num || '').replace(/\D/g, '');
  return d.length === 10 ? '57' + d : d;
}
export const waLink = (num, text = '') => {
  const n = waNumber(num);
  return n ? `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';
};
const handle = (v) => String(v || '').trim().replace(/^@/, '');
export const socialLink = {
  instagram: (v) => (!v ? '' : /^https?:/.test(v) ? v : `https://instagram.com/${handle(v)}`),
  facebook: (v) => (!v ? '' : /^https?:/.test(v) ? v : `https://facebook.com/${handle(v)}`),
  tiktok: (v) => (!v ? '' : /^https?:/.test(v) ? v : `https://www.tiktok.com/@${handle(v)}`),
};

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

export function toast(msg, type = '') {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.remove(), 3200);
}

// Imagen de reemplazo cuando un producto no tiene foto
const PALETTE = ['#e30613', '#c9ccd1', '#1e6bd6', '#f2b705', '#16a34a', '#7c3aed', '#f97316', '#0ea5e9'];
export function placeholder(seed = '', label = '') {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = PALETTE[h % PALETTE.length];
  const txt = esc(String(label).slice(0, 22).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#26262c"/><stop offset="1" stop-color="#0c0c0f"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".55"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<g opacity=".08" stroke="#fff" stroke-width="6">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<line x1="${-100 + i * 90}" y1="400" x2="${60 + i * 90}" y2="0"/>`).join('')}</g>
<ellipse cx="200" cy="262" rx="150" ry="14" fill="#000" opacity=".6"/>
<path d="M52 236c4-22 22-32 52-38l46-30c18-12 38-16 66-16h34c26 0 46 8 64 24l20 18c20 4 34 12 36 30l2 14c0 6-4 10-10 10H60c-6 0-10-6-8-12z" fill="url(#b)"/>
<path d="M162 176l26-18c10-6 20-8 32-8h20c14 0 26 4 36 12l14 14z" fill="#0d0d10" opacity=".85"/>
<circle cx="122" cy="250" r="28" fill="#0b0b0d"/><circle cx="122" cy="250" r="14" fill="#9aa0a6"/>
<circle cx="292" cy="250" r="28" fill="#0b0b0d"/><circle cx="292" cy="250" r="14" fill="#9aa0a6"/>
<text x="200" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-style="italic" font-size="20" fill="#8a8a94">${txt}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export const productImage = (p, i = 0) => (p.images && p.images[i]) || placeholder(p.id, p.brand || 'Route 64');

// ---------------------------------------------------------------------
// Íconos (SVG en línea)
// ---------------------------------------------------------------------
const P = {
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 8H6.2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  megaphone: '<path d="M3 10v4h4l8 5V5L7 10z"/><path d="M19 9a4 4 0 0 1 0 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  store: '<path d="M3 9 5 4h14l2 5M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m12 8 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z"/>',
  scan: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8M7.5 12l1-2.5h4l1 2.5v1.5h-6z"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M12 14.5V21M3.4 9.2l6.2 2M14.4 12.8l6.2 2M6.5 19.3l4-5.3M13.5 10l4-5.3M6.5 4.7l4 5.3M13.5 14l4 5.3"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.3-1.3-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8z"/>',
  tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 3 2.5 5 6 5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  pin: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  bank: '<path d="m3 9 9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------------------------------------------------------------------
// Datos de demostración (se usan mientras Supabase no esté configurado)
// ---------------------------------------------------------------------
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));
const C = { hw: 'c-hw', pr: 'c-pr', co: 'c-co', ac: 'c-ac' };
export const DEMO_DATA = {
  settings: {
    id: 1, store_name: 'Route 64', tagline: 'Colecciona. Disfruta. Vive tu pasión.',
    announcement: 'Envíos a toda Colombia · Modo demostración',
    about: 'Tienda de autos a escala Hot Wheels y figuras coleccionables de vehículos comerciales. Cada pieza se revisa antes del envío y se despacha en empaque protegido.',
    whatsapp: '3001234567', phone: '3001234567', email: 'contacto@route64.co',
    instagram: 'route64bga', facebook: '', tiktok: '',
    address: 'Bucaramanga, Santander', city: 'Bucaramanga', hours: 'Lunes a sábado, 9:00 a. m. – 7:00 p. m.',
    shipping_cost: 12000, free_shipping_from: 150000,
    shipping_note: 'Envío nacional con transportadora. Entrega de 2 a 5 días hábiles.',
    payment_instructions: 'Nequi / Bancolombia: 300 123 4567 a nombre de Route 64. Envía el comprobante por WhatsApp con la referencia del pedido.',
    wompi_public_key: '',
  },
  categories: [
    { id: C.hw, name: 'Hot Wheels', slug: 'hot-wheels', description: 'Mainline, Super Treasure Hunt y ediciones especiales.', image_url: '', sort_order: 1, active: true },
    { id: C.pr, name: 'Premium y Car Culture', slug: 'premium', description: 'Series premium con llantas de caucho y detalles metálicos.', image_url: '', sort_order: 2, active: true },
    { id: C.co, name: 'Vehículos comerciales', slug: 'comerciales', description: 'Camiones, furgones y vehículos de marcas comerciales.', image_url: '', sort_order: 3, active: true },
    { id: C.ac, name: 'Accesorios y exhibición', slug: 'accesorios', description: 'Vitrinas, protectores y accesorios para coleccionistas.', image_url: '', sort_order: 4, active: true },
  ],
  products: [
    { id: 'p1', category_id: C.pr, name: 'Toyota Supra MK4 – Car Culture', brand: 'Hot Wheels', scale: '1:64', price: 38000, compare_at_price: 45000, stock: 4, images: [], featured: true, active: true, sort_order: 0, description: 'Edición premium con llantas Real Riders y chasis metálico.' },
    { id: 'p2', category_id: C.hw, name: 'Nissan Skyline GT-R R34', brand: 'Hot Wheels', scale: '1:64', price: 12000, compare_at_price: null, stock: 10, images: [], featured: true, active: true, sort_order: 0, description: 'Línea principal. Blíster en buen estado.' },
    { id: 'p3', category_id: C.hw, name: 'Super Treasure Hunt ’67 Camaro', brand: 'Hot Wheels', scale: '1:64', price: 85000, compare_at_price: null, stock: 1, images: [], featured: true, active: true, sort_order: 0, description: 'Pintura Spectraflame y llantas de caucho. Unidad única.' },
    { id: 'p4', category_id: C.co, name: 'Camión de reparto Coca-Cola', brand: 'Matchbox', scale: '1:64', price: 28000, compare_at_price: 32000, stock: 3, images: [], featured: false, active: true, sort_order: 0, description: 'Vehículo comercial con gráficos oficiales.' },
    { id: 'p5', category_id: C.co, name: 'Furgón DHL Express', brand: 'Majorette', scale: '1:64', price: 24000, compare_at_price: null, stock: 0, images: [], featured: false, active: true, sort_order: 0, description: 'Furgón de carga con puertas traseras abatibles.' },
    { id: 'p6', category_id: C.pr, name: 'Porsche 911 GT3 RS – Boulevard', brand: 'Hot Wheels', scale: '1:64', price: 42000, compare_at_price: null, stock: 2, images: [], featured: true, active: true, sort_order: 0, description: 'Serie Boulevard, detalles tampografiados.' },
    { id: 'p7', category_id: C.ac, name: 'Vitrina acrílica para 20 autos', brand: 'Route 64', scale: '—', price: 95000, compare_at_price: 110000, stock: 5, images: [], featured: false, active: true, sort_order: 0, description: 'Vitrina de pared con 20 compartimentos y protección UV.' },
    { id: 'p8', category_id: C.hw, name: 'Honda Civic Type R', brand: 'Hot Wheels', scale: '1:64', price: 12000, compare_at_price: null, stock: 8, images: [], featured: false, active: true, sort_order: 0, description: 'Línea principal 2026.' },
  ],
  banners: [
    { id: 'b1', title: 'Temporada Car Culture', subtitle: 'Nuevas series premium disponibles. Unidades limitadas por referencia.', badge: 'Nuevo ingreso', image_url: '', button_text: 'Ver premium', button_link: '#/catalogo/premium', sort_order: 1, active: true },
    { id: 'b2', title: 'Hasta 15 % de descuento', subtitle: 'Precios especiales en referencias seleccionadas mientras haya existencias.', badge: 'Promoción', image_url: '', button_text: 'Ver ofertas', button_link: '#/catalogo/ofertas', sort_order: 2, active: true },
  ],
  orders: [],
  private: { id: 1, wompi_integrity_secret: '' },
};
const demoDB = DEMO ? JSON.parse(JSON.stringify(DEMO_DATA)) : null;

// ---------------------------------------------------------------------
// API de la tienda
// ---------------------------------------------------------------------
const bannerLive = (b, now = Date.now()) =>
  b.active && (!b.starts_at || Date.parse(b.starts_at) <= now) && (!b.ends_at || Date.parse(b.ends_at) >= now);

export async function loadStore() {
  if (DEMO) {
    return {
      settings: { ...demoDB.settings },
      categories: demoDB.categories.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order),
      products: demoDB.products.filter((p) => p.active),
      banners: demoDB.banners.filter((b) => bannerLive(b)).sort((a, b) => a.sort_order - b.sort_order),
    };
  }
  const c = await sb();
  const [s, cats, prods, bans] = await Promise.all([
    c.from('settings').select('*').eq('id', 1).maybeSingle(),
    c.from('categories').select('*').eq('active', true).order('sort_order').order('name'),
    c.from('products').select('*').eq('active', true).order('sort_order').order('created_at', { ascending: false }),
    c.from('banners').select('*').eq('active', true).order('sort_order'),
  ]);
  for (const r of [s, cats, prods, bans]) if (r.error) throw r.error;
  return {
    settings: s.data || {},
    categories: cats.data || [],
    products: prods.data || [],
    banners: (bans.data || []).filter((b) => bannerLive(b)),
  };
}

export async function createOrder(customer, items, method) {
  if (DEMO) {
    const s = demoDB.settings;
    let subtotal = 0;
    const lines = items.map((it) => {
      const p = demoDB.products.find((x) => x.id === it.id);
      if (!p || !p.active) throw new Error('Un producto del carrito ya no está disponible');
      if (p.stock < it.qty) throw new Error(`No hay unidades suficientes de ${p.name}`);
      subtotal += p.price * it.qty;
      return { id: p.id, name: p.name, price: p.price, qty: it.qty, image: p.images[0] || '' };
    });
    if (method === 'wompi') throw new Error('El pago en línea no está configurado');
    const shipping = s.free_shipping_from > 0 && subtotal >= s.free_shipping_from ? 0 : s.shipping_cost;
    const reference = 'R64-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const order = {
      id: uid(), reference, access_token: uid(), carrier: '', tracking_number: '', tracking_url: '', email_log: [], customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone,
      document_id: customer.document, address: customer.address, city: customer.city, notes: customer.notes,
      items: lines, subtotal, shipping, total: subtotal + shipping, payment_method: method, status: 'pendiente',
      admin_notes: '', created_at: new Date().toISOString(),
    };
    demoDB.orders.unshift(order);
    return { reference, token: order.access_token, items: lines, subtotal, shipping, total: order.total, amount_in_cents: order.total * 100, signature: null, public_key: '' };
  }
  const c = await sb();
  const { data, error } = await c.rpc('create_order', { p_customer: customer, p_items: items, p_payment_method: method });
  if (error) throw new Error(error.message);
  return data;
}

// Consulta del pedido por el cliente: con el código del enlace (token) o con el celular
export async function trackOrder(reference, { token = '', phone = '' } = {}) {
  const ref = String(reference || '').trim();
  if (DEMO) {
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const o = demoDB.orders.find((x) => x.reference.toUpperCase() === ref.toUpperCase()
      && ((token && x.access_token === token) || (digits(phone).length >= 7 && digits(x.customer_phone).slice(-7) === digits(phone).slice(-7))));
    return o ? { ...o, token: o.access_token } : null;
  }
  const c = await sb();
  const { data, error } = await c.rpc('track_order', { p_reference: ref, p_token: token || null, p_phone: phone || null });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------
// API del panel de administración
// ---------------------------------------------------------------------
let demoSession = null;
export const auth = {
  async session() {
    if (DEMO) return demoSession;
    const c = await sb();
    const { data } = await c.auth.getSession();
    return data.session;
  },
  async signIn(email, password) {
    if (DEMO) { demoSession = { user: { email } }; return demoSession; }
    const c = await sb();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message);
    return data.session;
  },
  async signOut() {
    if (DEMO) { demoSession = null; return; }
    const c = await sb();
    await c.auth.signOut();
  },
  async isAdmin() {
    if (DEMO) return true;
    const c = await sb();
    const { data, error } = await c.rpc('is_admin');
    return !error && data === true;
  },
  async resetPassword(email) {
    if (DEMO) return;
    const c = await sb();
    const redirectTo = location.href.split('#')[0];
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
  },
  async updatePassword(password) {
    if (DEMO) return;
    const c = await sb();
    const { error } = await c.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
  async onChange(cb) {
    if (DEMO) return;
    const c = await sb();
    c.auth.onAuthStateChange((event, session) => cb(event, session));
  },
};

const TABLE_ORDER = {
  products: [['sort_order', true], ['created_at', false]],
  categories: [['sort_order', true], ['name', true]],
  banners: [['sort_order', true], ['created_at', false]],
  orders: [['created_at', false]],
};

export const db = {
  async list(table) {
    if (DEMO) return JSON.parse(JSON.stringify(demoDB[table] || []));
    const c = await sb();
    let q = c.from(table).select('*');
    for (const [col, asc] of TABLE_ORDER[table] || []) q = q.order(col, { ascending: asc });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },
  async save(table, row) {
    if (DEMO) {
      const list = demoDB[table];
      if (row.id) {
        const i = list.findIndex((x) => x.id === row.id);
        if (i >= 0) { list[i] = { ...list[i], ...row }; return list[i]; }
      }
      const n = { ...row, id: row.id || uid(), created_at: new Date().toISOString() };
      list.unshift(n);
      return n;
    }
    const c = await sb();
    const payload = { ...row };
    delete payload.created_at;
    const q = payload.id
      ? c.from(table).update(payload).eq('id', payload.id).select().single()
      : c.from(table).insert(payload).select().single();
    const { data, error } = await q;
    if (error) throw new Error(friendlyError(error));
    return data;
  },
  async remove(table, id) {
    if (DEMO) { demoDB[table] = demoDB[table].filter((x) => x.id !== id); return; }
    const c = await sb();
    const { error } = await c.from(table).delete().eq('id', id);
    if (error) throw new Error(friendlyError(error));
  },
  async getSettings() {
    if (DEMO) return { ...demoDB.settings };
    const c = await sb();
    const { data, error } = await c.from('settings').select('*').eq('id', 1).single();
    if (error) throw new Error(error.message);
    return data;
  },
  async saveSettings(row) {
    if (DEMO) { Object.assign(demoDB.settings, row); return; }
    const c = await sb();
    const { error } = await c.from('settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) throw new Error(friendlyError(error));
  },
  async getPrivate() {
    if (DEMO) return { ...demoDB.private };
    const c = await sb();
    const { data } = await c.from('private_settings').select('*').eq('id', 1).maybeSingle();
    return data || { wompi_integrity_secret: '' };
  },
  async savePrivate(row) {
    if (DEMO) { Object.assign(demoDB.private, row); return; }
    const c = await sb();
    const { error } = await c.from('private_settings').update(row).eq('id', 1);
    if (error) throw new Error(friendlyError(error));
  },
  // Comprime la foto en el navegador y la sube al almacenamiento
  async upload(file, folder = 'productos') {
    const blob = await compressImage(file);
    if (DEMO) return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    const c = await sb();
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await c.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error('No se pudo subir la foto: ' + error.message);
    return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },
};

function friendlyError(e) {
  const m = e.message || String(e);
  if (/duplicate key.*slug/i.test(m)) return 'Ya existe una sección con ese nombre corto (slug).';
  if (/row-level security/i.test(m)) return 'Tu usuario no tiene permisos de administrador.';
  if (/foreign key/i.test(m)) return 'El registro está relacionado con otros datos.';
  return m;
}

export async function compressImage(file, max = 1600, quality = 0.85) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
    if (blob && blob.size < file.size * 1.2) return blob;
    return file;
  } catch {
    return file;
  }
}
