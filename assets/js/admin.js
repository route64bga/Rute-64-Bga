// =====================================================================
// ROUTE 64 · Panel de administración
// =====================================================================
import { DEMO, esc, money, icon, slugify, safeUrl, waLink, toast, auth, db, productImage, debounce } from './core.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const A = {
  tab: 'pedidos',
  settings: {},
  categories: [],
  products: [],
  banners: [],
  orders: [],
  orderFilter: 'todos',
  productFilter: { q: '', cat: '' },
};

const TABS = [
  ['pedidos', 'receipt', 'Pedidos'],
  ['productos', 'box', 'Productos'],
  ['secciones', 'layers', 'Secciones'],
  ['anuncios', 'megaphone', 'Anuncios'],
  ['ajustes', 'settings', 'Configuración'],
];
const STATUS = {
  pendiente: ['Pendiente', 'warn'],
  pagado: ['Pagado', 'ok'],
  enviado: ['Enviado', ''],
  entregado: ['Entregado', ''],
  cancelado: ['Cancelado', 'red'],
};
const METHOD = { wompi: 'Pago en línea (Wompi)', transferencia: 'Transferencia / Nequi', whatsapp: 'Acordado por WhatsApp' };

const int = (v) => Number.parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10) || 0;
const intOrNull = (v) => (String(v ?? '').trim() === '' ? null : int(v));
const dateFmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDate = (d) => (d ? dateFmt.format(new Date(d)) : '');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------
function openModal({ title, body, foot = '', size = '' }) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.id = 'modal';
  back.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3 class="display">${esc(title)}</h3><button class="icon-btn" data-close-modal aria-label="Cerrar">${icon('close')}</button></div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close-modal]')) closeModal(); });
  document.body.append(back);
  document.body.style.overflow = 'hidden';
  return back;
}
function closeModal() {
  const m = $('#modal');
  if (m) m.remove();
  document.body.style.overflow = '';
}
function confirmDialog(message, okText = 'Eliminar') {
  return new Promise((resolve) => {
    const m = openModal({
      title: 'Confirmar',
      size: 'sm',
      body: `<p style="margin:0">${esc(message)}</p>`,
      foot: `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn" id="confirm-ok">${esc(okText)}</button>`,
    });
    let done = false;
    $('#confirm-ok', m).addEventListener('click', () => { done = true; closeModal(); resolve(true); });
    new MutationObserver((_, obs) => { if (!document.body.contains(m)) { obs.disconnect(); if (!done) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

// ---------------------------------------------------------------------
// Inicio de sesión
// ---------------------------------------------------------------------
function renderLogin(mode = 'login', msg = '') {
  app.innerHTML = `
  <div class="login">
    <form class="login-card" id="login-form" novalidate>
      <img src="assets/img/logo.jpg" alt="Route 64">
      <h1 class="display">${mode === 'reset' ? 'Recuperar contraseña' : mode === 'newpass' ? 'Nueva contraseña' : 'Panel de administración'}</h1>
      ${DEMO ? '<div class="alert info">Modo demostración: ingresa cualquier correo y contraseña. Los cambios no se guardan.</div>' : ''}
      ${msg ? `<div class="alert ${msg.startsWith('!') ? 'error' : 'ok'}">${esc(msg.replace(/^!/, ''))}</div>` : ''}
      ${mode !== 'newpass' ? '<label class="field"><span>Correo electrónico</span><input class="input" name="email" type="email" autocomplete="username" required></label>' : ''}
      ${mode !== 'reset' ? `<label class="field"><span>${mode === 'newpass' ? 'Nueva contraseña (mínimo 8 caracteres)' : 'Contraseña'}</span><input class="input" name="password" type="password" autocomplete="${mode === 'newpass' ? 'new-password' : 'current-password'}" required></label>` : ''}
      <button class="btn btn-block" type="submit">${mode === 'reset' ? 'Enviar enlace' : mode === 'newpass' ? 'Guardar contraseña' : 'Ingresar'}</button>
      ${mode === 'login' ? '<button type="button" class="linkish" data-mode="reset">¿Olvidaste tu contraseña?</button>' : ''}
      ${mode === 'reset' ? '<button type="button" class="linkish" data-mode="login">Volver al inicio de sesión</button>' : ''}
      <a class="linkish" href="index.html" style="text-align:center">Ir a la tienda</a>
    </form>
  </div>`;
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => renderLogin(b.dataset.mode)));
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (mode === 'reset') {
        if (!email) throw new Error('Escribe tu correo');
        await auth.resetPassword(email);
        renderLogin('login', 'Si el correo está registrado, recibirás un enlace para cambiar la contraseña.');
      } else if (mode === 'newpass') {
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
        await auth.updatePassword(password);
        toast('Contraseña actualizada', 'ok');
        boot();
      } else {
        if (!email || !password) throw new Error('Escribe tu correo y contraseña');
        await auth.signIn(email, password);
        boot();
      }
    } catch (err) {
      renderLogin(mode, '!' + err.message);
    }
  });
}

function renderNoAccess(email) {
  app.innerHTML = `
  <div class="login"><div class="login-card">
    <img src="assets/img/logo.jpg" alt="Route 64">
    <h1 class="display">Sin permisos</h1>
    <div class="alert error">El usuario ${esc(email || '')} inició sesión, pero no está registrado como administrador de la tienda.</div>
    <button class="btn btn-ghost btn-block" id="out">Cerrar sesión</button>
  </div></div>`;
  $('#out').addEventListener('click', async () => { await auth.signOut(); renderLogin(); });
}

// ---------------------------------------------------------------------
// Estructura del panel
// ---------------------------------------------------------------------
function renderShell() {
  const links = TABS.map(([k, ic, label]) => `<button class="side-link" data-tab="${k}">${icon(ic)} ${label}</button>`).join('');
  app.innerHTML = `
  <div class="admin">
    <aside class="side">
      <a href="index.html" class="brand"><img src="assets/img/logo.jpg" alt="" width="44" height="44"><span class="brand-name display"><span class="chrome-text">Route</span> <span class="red">64</span></span></a>
      ${links}
      <div class="side-spacer"></div>
      <a class="side-link" href="index.html" target="_blank" rel="noopener">${icon('store')} Ver tienda</a>
      <button class="side-link" data-logout>${icon('logout')} Cerrar sesión</button>
    </aside>
    <div class="admin-main">
      ${DEMO ? '<div class="demo-note">Modo demostración: los cambios se pierden al recargar. Conecta Supabase en config.js para guardarlos.</div>' : ''}
      <nav class="admin-tabs">${links}<a class="side-link" href="index.html" target="_blank" rel="noopener">${icon('store')} Tienda</a><button class="side-link" data-logout>${icon('logout')} Salir</button></nav>
      <div class="admin-top"><h1 class="display" id="tab-title"></h1><div class="row-actions" id="tab-actions"></div></div>
      <div class="admin-content" id="content"></div>
    </div>
  </div>`;
  if (app.dataset.bound) return;
  app.dataset.bound = '1';
  app.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { A.tab = t.dataset.tab; renderTab(); window.scrollTo(0, 0); }
    if (e.target.closest('[data-logout]')) { await auth.signOut(); renderLogin(); }
  });
}

async function loadAll() {
  const [settings, categories, products, banners, orders] = await Promise.all([
    db.getSettings(), db.list('categories'), db.list('products'), db.list('banners'), db.list('orders'),
  ]);
  Object.assign(A, { settings, categories, products, banners, orders });
}

function renderTab() {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === A.tab));
  const [, , label] = TABS.find(([k]) => k === A.tab);
  $('#tab-title').textContent = label;
  $('#tab-actions').innerHTML = '';
  ({ pedidos: tabOrders, productos: tabProducts, secciones: tabCategories, anuncios: tabBanners, ajustes: tabSettings })[A.tab]();
}

const switchHTML = (attr, id, on, label) =>
  `<label class="switch" title="${label}"><input type="checkbox" ${attr}="${esc(id)}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label>`;

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
function tabOrders() {
  $('#tab-actions').innerHTML = `<button class="btn btn-ghost btn-sm" id="reload">Actualizar</button>`;
  $('#reload').addEventListener('click', async () => { A.orders = await db.list('orders'); tabOrders(); toast('Pedidos actualizados', 'ok'); });

  const paid = A.orders.filter((o) => ['pagado', 'enviado', 'entregado'].includes(o.status));
  const pending = A.orders.filter((o) => o.status === 'pendiente');
  const list = A.orderFilter === 'todos' ? A.orders : A.orders.filter((o) => o.status === A.orderFilter);

  $('#content').innerHTML = `
    <div class="stats">
      <div class="stat"><small>Pendientes</small><b>${pending.length}</b></div>
      <div class="stat"><small>Pagados / enviados</small><b>${paid.length}</b></div>
      <div class="stat"><small>Total vendido</small><b>${money(paid.reduce((n, o) => n + o.total, 0))}</b></div>
      <div class="stat"><small>Productos agotados</small><b>${A.products.filter((p) => p.stock <= 0).length}</b></div>
    </div>
    <div class="chips" style="margin-bottom:16px">
      ${['todos', ...Object.keys(STATUS)].map((k) => `<button class="chip ${A.orderFilter === k ? 'active' : ''}" data-of="${k}">${k === 'todos' ? 'Todos' : STATUS[k][0]} (${k === 'todos' ? A.orders.length : A.orders.filter((o) => o.status === k).length})</button>`).join('')}
    </div>
    <div class="rows">
      ${list.length ? list.map(orderHTML).join('') : '<div class="empty">' + icon('receipt') + '<p>No hay pedidos en este estado.</p></div>'}
    </div>`;

  $('#content').querySelectorAll('[data-of]').forEach((b) => b.addEventListener('click', () => { A.orderFilter = b.dataset.of; tabOrders(); }));
  $('#content').querySelectorAll('[data-save-order]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.saveOrder;
    const box = b.closest('.order');
    const status = $('[name=status]', box).value;
    const admin_notes = $('[name=admin_notes]', box).value;
    b.disabled = true;
    try {
      const saved = await db.save('orders', { id, status, admin_notes });
      A.orders = A.orders.map((o) => (o.id === id ? { ...o, ...saved } : o));
      if (['pagado', 'enviado', 'entregado', 'cancelado'].includes(status)) A.products = await db.list('products');
      toast('Pedido actualizado', 'ok');
      tabOrders();
    } catch (err) { toast(err.message); b.disabled = false; }
  }));
}

function orderHTML(o) {
  const [label, cls] = STATUS[o.status] || [o.status, ''];
  const wa = waLink(o.customer_phone, `Hola ${o.customer_name}, te escribimos de ${A.settings.store_name || 'Route 64'} sobre tu pedido ${o.reference}.`);
  return `
  <details class="order">
    <summary>
      <div>
        <div class="row-title">${esc(o.reference)} · ${esc(o.customer_name)}</div>
        <div class="row-sub"><span>${fmtDate(o.created_at)}</span><span>${esc(o.city || '')}</span><span>${METHOD[o.payment_method] || esc(o.payment_method)}</span></div>
      </div>
      <div style="text-align:right"><b>${money(o.total)}</b><div><span class="pill ${cls}">${label}</span></div></div>
    </summary>
    <div class="order-body">
      <div class="order-cols">
        <div class="kv">
          <div>Cliente: <b>${esc(o.customer_name)}</b></div>
          <div>Celular: <b>${esc(o.customer_phone)}</b></div>
          ${o.customer_email ? `<div>Correo: <b>${esc(o.customer_email)}</b></div>` : ''}
          ${o.document_id ? `<div>Cédula: <b>${esc(o.document_id)}</b></div>` : ''}
        </div>
        <div class="kv">
          <div>Ciudad: <b>${esc(o.city)}</b></div>
          <div>Dirección: <b>${esc(o.address)}</b></div>
          ${o.notes ? `<div>Notas: <b>${esc(o.notes)}</b></div>` : ''}
        </div>
      </div>
      <div>
        ${(o.items || []).map((i) => `<div class="mini-line"><div class="grow"><div>${esc(i.name)}</div><small>${i.qty} × ${money(i.price)}</small></div><b>${money(i.qty * i.price)}</b></div>`).join('')}
        <div class="totals" style="margin-top:10px">
          <div><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
          <div><span>Envío</span><span>${money(o.shipping)}</span></div>
          <div class="grand"><span>Total</span><span>${money(o.total)}</span></div>
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span>Estado del pedido</span>
          <select class="select" name="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="hint">Al marcarlo como pagado se descuentan las unidades del inventario.</span>
        </label>
        <label class="field"><span>Notas internas</span><input class="input" name="admin_notes" value="${esc(o.admin_notes || '')}" placeholder="Guía de envío, observaciones…"></label>
      </div>
      <div class="row-actions" style="justify-content:flex-end;flex-wrap:wrap">
        ${wa ? `<a class="btn btn-wa btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir al cliente</a>` : ''}
        <button class="btn btn-sm" data-save-order="${esc(o.id)}">Guardar cambios</button>
      </div>
    </div>
  </details>`;
}

// ---------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------
function tabProducts() {
  $('#tab-actions').innerHTML = `<button class="btn btn-sm" id="new-product">${icon('plus')} Nuevo producto</button>`;
  $('#new-product').addEventListener('click', () => productModal());
  const f = A.productFilter;
  $('#content').innerHTML = `
    <div class="toolbar" style="margin-top:0">
      <label class="search">${icon('search')}<input id="pq" type="search" placeholder="Buscar producto" value="${esc(f.q)}"></label>
      <select class="select" id="pc"><option value="">Todas las secciones</option>${A.categories.map((c) => `<option value="${esc(c.id)}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="none" ${f.cat === 'none' ? 'selected' : ''}>Sin sección</option></select>
    </div>
    <div class="rows" id="prod-rows"></div>`;
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    let list = A.products;
    if (f.cat === 'none') list = list.filter((p) => !p.category_id);
    else if (f.cat) list = list.filter((p) => p.category_id === f.cat);
    if (q) list = list.filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(q));
    $('#prod-rows').innerHTML = list.length ? list.map((p) => {
      const cat = A.categories.find((c) => c.id === p.category_id);
      return `
      <div class="row ${p.active ? '' : 'inactive'}">
        <img src="${esc(productImage(p))}" alt="">
        <div>
          <div class="row-title">${p.featured ? `<span class="red" title="Destacado">★</span> ` : ''}${esc(p.name)}</div>
          <div class="row-sub">
            <span>${money(p.price)}${p.compare_at_price > p.price ? ` <s>${money(p.compare_at_price)}</s>` : ''}</span>
            <span class="pill ${p.stock <= 0 ? 'red' : p.stock <= 2 ? 'warn' : ''}">${p.stock <= 0 ? 'Agotado' : `${p.stock} und.`}</span>
            <span>${esc(cat ? cat.name : 'Sin sección')}</span>
            ${p.active ? '' : '<span class="pill">Oculto</span>'}
          </div>
        </div>
        <div class="row-actions">
          ${switchHTML('data-toggle-product', p.id, p.active, 'Visible en la tienda')}
          <button class="icon-btn" data-edit-product="${esc(p.id)}" aria-label="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-del-product="${esc(p.id)}" aria-label="Eliminar">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty">${icon('box')}<p>${A.products.length ? 'No hay productos con ese filtro.' : 'Aún no hay productos. Crea el primero con “Nuevo producto”.'}</p></div>`;
  };
  draw();
  $('#pq').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  $('#pc').addEventListener('change', (e) => { f.cat = e.target.value; draw(); });
  $('#prod-rows').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit-product]');
    const del = e.target.closest('[data-del-product]');
    if (ed) productModal(A.products.find((p) => p.id === ed.dataset.editProduct));
    if (del) {
      const p = A.products.find((x) => x.id === del.dataset.delProduct);
      if (!(await confirmDialog(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer. Si solo quieres ocultarlo, usa el interruptor de visibilidad.`))) return;
      try { await db.remove('products', p.id); A.products = A.products.filter((x) => x.id !== p.id); draw(); toast('Producto eliminado', 'ok'); } catch (err) { toast(err.message); }
    }
  });
  $('#prod-rows').addEventListener('change', async (e) => {
    const t = e.target.closest('[data-toggle-product]');
    if (!t) return;
    try {
      const saved = await db.save('products', { id: t.dataset.toggleProduct, active: t.checked });
      A.products = A.products.map((p) => (p.id === saved.id ? saved : p));
      draw();
      toast(saved.active ? 'Producto visible en la tienda' : 'Producto oculto', 'ok');
    } catch (err) { toast(err.message); t.checked = !t.checked; }
  });
}

function productModal(p = null) {
  const isNew = !p;
  p = p || { name: '', category_id: A.productFilter.cat && A.productFilter.cat !== 'none' ? A.productFilter.cat : (A.categories[0]?.id || null), brand: 'Hot Wheels', scale: '1:64', price: '', compare_at_price: null, stock: 1, images: [], featured: false, active: true, sort_order: 0, description: '' };
  const images = [...(p.images || [])];
  const m = openModal({
    title: isNew ? 'Nuevo producto' : 'Editar producto',
    body: `
      <form id="pform" class="form-grid" novalidate>
        <div class="field full"><span>Fotos (la primera es la principal)</span><div class="img-grid" id="imgs"></div>
          <input type="file" id="file" accept="image/*" multiple hidden><span class="hint">Se comprimen automáticamente. Formatos JPG, PNG o WEBP.</span></div>
        <label class="field full"><span>Nombre <em>*</em></span><input class="input" name="name" value="${esc(p.name)}" required></label>
        <label class="field"><span>Sección</span><select class="select" name="category_id"><option value="">Sin sección</option>${A.categories.map((c) => `<option value="${esc(c.id)}" ${p.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Marca</span><input class="input" name="brand" value="${esc(p.brand || '')}" placeholder="Hot Wheels, Matchbox, Majorette…"></label>
        <label class="field"><span>Precio de venta (COP) <em>*</em></span><input class="input" name="price" inputmode="numeric" value="${p.price === '' ? '' : esc(p.price)}" placeholder="38000"></label>
        <label class="field"><span>Precio anterior (opcional)</span><input class="input" name="compare_at_price" inputmode="numeric" value="${p.compare_at_price ?? ''}" placeholder="Para mostrar descuento"></label>
        <label class="field"><span>Unidades disponibles</span><input class="input" name="stock" inputmode="numeric" value="${esc(p.stock)}"></label>
        <label class="field"><span>Escala</span><input class="input" name="scale" value="${esc(p.scale || '')}" placeholder="1:64"></label>
        <label class="field full"><span>Descripción</span><textarea class="textarea" name="description">${esc(p.description || '')}</textarea></label>
        <label class="field"><span>Orden (menor aparece primero)</span><input class="input" name="sort_order" inputmode="numeric" value="${esc(p.sort_order || 0)}"></label>
        <div class="field"><span>Opciones</span>
          <label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Destacado en el inicio</label>
          <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Visible en la tienda</label>
        </div>
        <div class="full" id="perr"></div>
      </form>`,
    foot: `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn" id="psave">Guardar producto</button>`,
  });

  const drawImgs = (uploading = 0) => {
    $('#imgs', m).innerHTML = images.map((src, i) => `
      <div class="img-slot"><img src="${esc(src)}" alt="">
        <button type="button" class="x" data-rm="${i}" aria-label="Quitar foto">${icon('close')}</button>
        ${i === 0 ? '<span class="main-flag">Principal</span>' : `<button type="button" class="make-main" data-main="${i}">Hacer principal</button>`}
      </div>`).join('')
      + Array.from({ length: uploading }, () => '<div class="img-slot skeleton"></div>').join('')
      + `<label class="img-add" for="file">${icon('upload')}Subir fotos</label>`;
  };
  drawImgs();
  $('#imgs', m).addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    const mk = e.target.closest('[data-main]');
    if (rm) { images.splice(Number(rm.dataset.rm), 1); drawImgs(); }
    if (mk) { const [x] = images.splice(Number(mk.dataset.main), 1); images.unshift(x); drawImgs(); }
  });
  $('#file', m).addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    let pending = files.length;
    drawImgs(pending);
    await Promise.all(files.map(async (file) => {
      try { images.push(await db.upload(file, 'productos')); } catch (err) { toast(err.message); }
      pending -= 1; drawImgs(pending);
    }));
  });

  $('#psave', m).addEventListener('click', async () => {
    const f = new FormData($('#pform', m));
    const row = {
      name: String(f.get('name') || '').trim(),
      category_id: f.get('category_id') || null,
      brand: String(f.get('brand') || '').trim(),
      scale: String(f.get('scale') || '').trim(),
      price: int(f.get('price')),
      compare_at_price: intOrNull(f.get('compare_at_price')),
      stock: Math.max(0, int(f.get('stock'))),
      description: String(f.get('description') || '').trim(),
      sort_order: int(f.get('sort_order')),
      featured: f.get('featured') === 'on',
      active: f.get('active') === 'on',
      images,
    };
    if (!isNew) row.id = p.id;
    const err = !row.name ? 'Escribe el nombre del producto.' : !row.price ? 'Escribe el precio de venta.' : '';
    if (err) { $('#perr', m).innerHTML = `<div class="alert error">${err}</div>`; return; }
    if (row.compare_at_price !== null && row.compare_at_price <= row.price) row.compare_at_price = null;
    const btn = $('#psave', m);
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const saved = await db.save('products', row);
      A.products = isNew ? [saved, ...A.products] : A.products.map((x) => (x.id === saved.id ? saved : x));
      closeModal();
      toast(isNew ? 'Producto creado' : 'Producto actualizado', 'ok');
      tabProducts();
    } catch (e2) {
      $('#perr', m).innerHTML = `<div class="alert error">${esc(e2.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Guardar producto';
    }
  });
}

// ---------------------------------------------------------------------
// Imagen única (secciones y anuncios)
// ---------------------------------------------------------------------
function singleImage(container, url, folder, wide = false) {
  let value = url || '';
  const draw = (loading = false) => {
    container.innerHTML = loading
      ? `<div class="img-slot skeleton ${wide ? 'img-wide' : ''}"></div>`
      : value
        ? `<div class="img-slot ${wide ? 'img-wide' : ''}"><img src="${esc(value)}" alt=""><button type="button" class="x" data-clear aria-label="Quitar imagen">${icon('close')}</button></div>`
        : `<label class="img-add ${wide ? 'img-wide' : ''}">${icon('upload')}Subir imagen<input type="file" accept="image/*" hidden></label>`;
  };
  container.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { value = ''; draw(); } });
  container.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    draw(true);
    try { value = await db.upload(file, folder); } catch (err) { toast(err.message); }
    draw();
  });
  draw();
  return () => value;
}

// ---------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------
function tabCategories() {
  $('#tab-actions').innerHTML = `<button class="btn btn-sm" id="new-cat">${icon('plus')} Nueva sección</button>`;
  $('#new-cat').addEventListener('click', () => categoryModal());
  $('#content').innerHTML = `
    <p class="section-sub" style="margin:0 0 16px">Las secciones organizan el catálogo y aparecen en el inicio y en el menú de filtros.</p>
    <div class="rows">
      ${A.categories.length ? A.categories.map((c) => {
        const n = A.products.filter((p) => p.category_id === c.id).length;
        const img = safeUrl(c.image_url);
        return `
        <div class="row ${c.active ? '' : 'inactive'}">
          ${img ? `<img src="${esc(img)}" alt="">` : `<div class="thumb" style="display:grid;place-items:center">${icon('layers')}</div>`}
          <div>
            <div class="row-title">${esc(c.name)}</div>
            <div class="row-sub"><span>${n} ${n === 1 ? 'producto' : 'productos'}</span><span>Orden: ${c.sort_order}</span><span>/catalogo/${esc(c.slug)}</span>${c.active ? '' : '<span class="pill">Oculta</span>'}</div>
          </div>
          <div class="row-actions">
            ${switchHTML('data-toggle-cat', c.id, c.active, 'Visible en la tienda')}
            <button class="icon-btn" data-edit-cat="${esc(c.id)}" aria-label="Editar">${icon('edit')}</button>
            <button class="icon-btn" data-del-cat="${esc(c.id)}" aria-label="Eliminar">${icon('trash')}</button>
          </div>
        </div>`;
      }).join('') : `<div class="empty">${icon('layers')}<p>Aún no hay secciones.</p></div>`}
    </div>`;
  const c = $('#content');
  c.querySelectorAll('[data-edit-cat]').forEach((b) => b.addEventListener('click', () => categoryModal(A.categories.find((x) => x.id === b.dataset.editCat))));
  c.querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', async () => {
    const cat = A.categories.find((x) => x.id === b.dataset.delCat);
    const n = A.products.filter((p) => p.category_id === cat.id).length;
    if (!(await confirmDialog(`¿Eliminar la sección "${cat.name}"?${n ? ` Sus ${n} productos quedarán sin sección, pero no se borran.` : ''}`))) return;
    try {
      await db.remove('categories', cat.id);
      A.categories = A.categories.filter((x) => x.id !== cat.id);
      A.products = A.products.map((p) => (p.category_id === cat.id ? { ...p, category_id: null } : p));
      tabCategories(); toast('Sección eliminada', 'ok');
    } catch (err) { toast(err.message); }
  }));
  c.querySelectorAll('[data-toggle-cat]').forEach((t) => t.addEventListener('change', async () => {
    try {
      const saved = await db.save('categories', { id: t.dataset.toggleCat, active: t.checked });
      A.categories = A.categories.map((x) => (x.id === saved.id ? saved : x));
      tabCategories();
    } catch (err) { toast(err.message); t.checked = !t.checked; }
  }));
}

function categoryModal(cat = null) {
  const isNew = !cat;
  cat = cat || { name: '', slug: '', description: '', image_url: '', sort_order: A.categories.length + 1, active: true };
  const m = openModal({
    title: isNew ? 'Nueva sección' : 'Editar sección',
    body: `
      <form id="cform" class="form-grid" novalidate>
        <label class="field"><span>Nombre <em>*</em></span><input class="input" name="name" value="${esc(cat.name)}" placeholder="Ej.: Super Treasure Hunt"></label>
        <label class="field"><span>Nombre en la dirección web</span><input class="input" name="slug" value="${esc(cat.slug)}" placeholder="se genera automáticamente"></label>
        <label class="field full"><span>Descripción</span><input class="input" name="description" value="${esc(cat.description || '')}"></label>
        <div class="field full"><span>Imagen de portada (opcional)</span><div id="cimg"></div><span class="hint">Si no se sube imagen, se usa la foto del primer producto de la sección.</span></div>
        <label class="field"><span>Orden</span><input class="input" name="sort_order" inputmode="numeric" value="${esc(cat.sort_order)}"></label>
        <div class="field"><span>Opciones</span><label class="check"><input type="checkbox" name="active" ${cat.active ? 'checked' : ''}> Visible en la tienda</label></div>
        <div class="full" id="cerr"></div>
      </form>`,
    foot: `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn" id="csave">Guardar sección</button>`,
  });
  const getImg = singleImage($('#cimg', m), cat.image_url, 'secciones');
  const nameIn = $('[name=name]', m);
  const slugIn = $('[name=slug]', m);
  let slugTouched = !isNew;
  slugIn.addEventListener('input', () => { slugTouched = true; });
  nameIn.addEventListener('input', () => { if (!slugTouched) slugIn.value = slugify(nameIn.value); });

  $('#csave', m).addEventListener('click', async () => {
    const f = new FormData($('#cform', m));
    const row = {
      name: String(f.get('name') || '').trim(),
      slug: slugify(f.get('slug') || f.get('name')),
      description: String(f.get('description') || '').trim(),
      image_url: getImg(),
      sort_order: int(f.get('sort_order')),
      active: f.get('active') === 'on',
    };
    if (!isNew) row.id = cat.id;
    if (!row.name) { $('#cerr', m).innerHTML = '<div class="alert error">Escribe el nombre de la sección.</div>'; return; }
    if (row.slug === 'ofertas') row.slug = 'ofertas-' + Date.now().toString(36);
    try {
      const saved = await db.save('categories', row);
      A.categories = (isNew ? [...A.categories, saved] : A.categories.map((x) => (x.id === saved.id ? saved : x)))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      closeModal(); toast(isNew ? 'Sección creada' : 'Sección actualizada', 'ok'); tabCategories();
    } catch (err) { $('#cerr', m).innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  });
}

// ---------------------------------------------------------------------
// Anuncios / promociones
// ---------------------------------------------------------------------
function bannerState(b) {
  const now = Date.now();
  if (!b.active) return ['Oculto', ''];
  if (b.starts_at && Date.parse(b.starts_at) > now) return ['Programado', 'warn'];
  if (b.ends_at && Date.parse(b.ends_at) < now) return ['Vencido', 'red'];
  return ['Publicado', 'ok'];
}

function tabBanners() {
  $('#tab-actions').innerHTML = `<button class="btn btn-sm" id="new-banner">${icon('plus')} Nuevo anuncio</button>`;
  $('#new-banner').addEventListener('click', () => bannerModal());
  $('#content').innerHTML = `
    <p class="section-sub" style="margin:0 0 16px">Los anuncios rotan en la parte superior del inicio. Usa las fechas para que una promoción aparezca y desaparezca sola.</p>
    <div class="rows">
      ${A.banners.length ? A.banners.map((b) => {
        const [st, cls] = bannerState(b);
        const img = safeUrl(b.image_url);
        return `
        <div class="row ${b.active ? '' : 'inactive'}">
          ${img ? `<img src="${esc(img)}" alt="">` : `<div class="thumb" style="display:grid;place-items:center">${icon('megaphone')}</div>`}
          <div>
            <div class="row-title">${esc(b.title)}</div>
            <div class="row-sub"><span class="pill ${cls}">${st}</span>${b.badge ? `<span>${esc(b.badge)}</span>` : ''}${b.starts_at || b.ends_at ? `<span>${b.starts_at ? fmtDate(b.starts_at) : 'Ahora'} → ${b.ends_at ? fmtDate(b.ends_at) : 'sin fin'}</span>` : ''}<span>Orden: ${b.sort_order}</span></div>
          </div>
          <div class="row-actions">
            ${switchHTML('data-toggle-banner', b.id, b.active, 'Publicado')}
            <button class="icon-btn" data-edit-banner="${esc(b.id)}" aria-label="Editar">${icon('edit')}</button>
            <button class="icon-btn" data-del-banner="${esc(b.id)}" aria-label="Eliminar">${icon('trash')}</button>
          </div>
        </div>`;
      }).join('') : `<div class="empty">${icon('megaphone')}<p>No hay anuncios. Mientras tanto el inicio muestra el logo de la tienda.</p></div>`}
    </div>`;
  const c = $('#content');
  c.querySelectorAll('[data-edit-banner]').forEach((b) => b.addEventListener('click', () => bannerModal(A.banners.find((x) => x.id === b.dataset.editBanner))));
  c.querySelectorAll('[data-del-banner]').forEach((b) => b.addEventListener('click', async () => {
    const ban = A.banners.find((x) => x.id === b.dataset.delBanner);
    if (!(await confirmDialog(`¿Eliminar el anuncio "${ban.title}"?`))) return;
    try { await db.remove('banners', ban.id); A.banners = A.banners.filter((x) => x.id !== ban.id); tabBanners(); toast('Anuncio eliminado', 'ok'); } catch (err) { toast(err.message); }
  }));
  c.querySelectorAll('[data-toggle-banner]').forEach((t) => t.addEventListener('change', async () => {
    try {
      const saved = await db.save('banners', { id: t.dataset.toggleBanner, active: t.checked });
      A.banners = A.banners.map((x) => (x.id === saved.id ? saved : x));
      tabBanners();
    } catch (err) { toast(err.message); t.checked = !t.checked; }
  }));
}

function bannerModal(b = null) {
  const isNew = !b;
  b = b || { title: '', subtitle: '', badge: '', image_url: '', button_text: 'Ver catálogo', button_link: '#/catalogo', starts_at: null, ends_at: null, sort_order: A.banners.length + 1, active: true };
  const targets = [
    ['#/catalogo', 'Catálogo completo'],
    ['#/catalogo/ofertas', 'Promociones (productos con descuento)'],
    ...A.categories.map((c) => [`#/catalogo/${c.slug}`, `Sección: ${c.name}`]),
    ['#/contacto', 'Página de contacto'],
  ];
  if (A.settings.whatsapp) targets.push([waLink(A.settings.whatsapp), 'Chat de WhatsApp']);
  const known = targets.some(([v]) => v === b.button_link);
  const m = openModal({
    title: isNew ? 'Nuevo anuncio' : 'Editar anuncio',
    body: `
      <form id="bform" class="form-grid" novalidate>
        <label class="field full"><span>Título <em>*</em></span><input class="input" name="title" value="${esc(b.title)}" placeholder="Ej.: 2x1 en Mainline"></label>
        <label class="field full"><span>Texto</span><input class="input" name="subtitle" value="${esc(b.subtitle || '')}" placeholder="Detalle de la promoción"></label>
        <label class="field"><span>Etiqueta</span><input class="input" name="badge" value="${esc(b.badge || '')}" placeholder="Promoción, Nuevo ingreso…"></label>
        <label class="field"><span>Texto del botón</span><input class="input" name="button_text" value="${esc(b.button_text || '')}" placeholder="Dejar vacío para ocultar el botón"></label>
        <label class="field full"><span>El botón lleva a</span>
          <select class="select" name="target">${targets.map(([v, l]) => `<option value="${esc(v)}" ${b.button_link === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="custom" ${known ? '' : 'selected'}>Otro enlace…</option></select></label>
        <label class="field full" id="custom-link" ${known ? 'hidden' : ''}><span>Enlace</span><input class="input" name="custom" value="${known ? '' : esc(b.button_link || '')}" placeholder="https://… o #/producto/…"></label>
        <div class="field full"><span>Imagen de fondo (opcional)</span><div id="bimg"></div><span class="hint">Tamaño recomendado: 1600 × 600 px. El texto se muestra a la izquierda; sin imagen se usa el diseño con el logo.</span></div>
        <label class="field"><span>Mostrar desde</span><input class="input" type="datetime-local" name="starts_at" value="${toLocalInput(b.starts_at)}"></label>
        <label class="field"><span>Mostrar hasta</span><input class="input" type="datetime-local" name="ends_at" value="${toLocalInput(b.ends_at)}"></label>
        <label class="field"><span>Orden</span><input class="input" name="sort_order" inputmode="numeric" value="${esc(b.sort_order)}"></label>
        <div class="field"><span>Opciones</span><label class="check"><input type="checkbox" name="active" ${b.active ? 'checked' : ''}> Publicado</label></div>
        <div class="full" id="berr"></div>
      </form>`,
    foot: `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn" id="bsave">Guardar anuncio</button>`,
  });
  const getImg = singleImage($('#bimg', m), b.image_url, 'anuncios', true);
  $('[name=target]', m).addEventListener('change', (e) => { $('#custom-link', m).hidden = e.target.value !== 'custom'; });

  $('#bsave', m).addEventListener('click', async () => {
    const f = new FormData($('#bform', m));
    const target = f.get('target');
    const row = {
      title: String(f.get('title') || '').trim(),
      subtitle: String(f.get('subtitle') || '').trim(),
      badge: String(f.get('badge') || '').trim(),
      button_text: String(f.get('button_text') || '').trim(),
      button_link: target === 'custom' ? safeUrl(f.get('custom')) : target,
      image_url: getImg(),
      starts_at: fromLocalInput(f.get('starts_at')),
      ends_at: fromLocalInput(f.get('ends_at')),
      sort_order: int(f.get('sort_order')),
      active: f.get('active') === 'on',
    };
    if (!isNew) row.id = b.id;
    const err = !row.title ? 'Escribe el título del anuncio.'
      : row.starts_at && row.ends_at && row.ends_at <= row.starts_at ? 'La fecha final debe ser posterior a la inicial.' : '';
    if (err) { $('#berr', m).innerHTML = `<div class="alert error">${err}</div>`; return; }
    try {
      const saved = await db.save('banners', row);
      A.banners = (isNew ? [...A.banners, saved] : A.banners.map((x) => (x.id === saved.id ? saved : x))).sort((x, y) => x.sort_order - y.sort_order);
      closeModal(); toast(isNew ? 'Anuncio creado' : 'Anuncio actualizado', 'ok'); tabBanners();
    } catch (e2) { $('#berr', m).innerHTML = `<div class="alert error">${esc(e2.message)}</div>`; }
  });
}

// ---------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------
async function tabSettings() {
  const s = A.settings;
  const priv = await db.getPrivate().catch(() => ({ wompi_integrity_secret: '' }));
  const fld = (name, label, opts = {}) => `
    <label class="field ${opts.full ? 'full' : ''}"><span>${label}</span>
      ${opts.area ? `<textarea class="textarea" name="${name}" placeholder="${esc(opts.ph || '')}">${esc(s[name] ?? '')}</textarea>`
        : `<input class="input" name="${name}" value="${esc(opts.value ?? s[name] ?? '')}" placeholder="${esc(opts.ph || '')}" ${opts.num ? 'inputmode="numeric"' : ''} ${opts.type ? `type="${opts.type}"` : ''} autocomplete="off">`}
      ${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}
    </label>`;
  $('#content').innerHTML = `
  <form id="sform">
    <div class="panel settings-section"><h2 class="display">Tienda</h2><p>Textos generales que aparecen en la página.</p>
      <div class="form-grid">
        ${fld('store_name', 'Nombre de la tienda')}
        ${fld('tagline', 'Lema')}
        ${fld('announcement', 'Barra de anuncio superior', { full: true, hint: 'Franja roja en la parte superior. Dejar vacío para ocultarla.', ph: 'Ej.: Envío gratis desde $150.000' })}
        ${fld('about', 'Descripción de la tienda', { full: true, area: true })}
      </div>
    </div>
    <div class="panel settings-section"><h2 class="display">Contacto y redes sociales</h2><p>Solo se muestran los campos que tengan información.</p>
      <div class="form-grid">
        ${fld('whatsapp', 'WhatsApp', { ph: '3001234567', hint: 'Número de 10 dígitos. Se usa para el botón flotante y los pedidos.' })}
        ${fld('phone', 'Teléfono')}
        ${fld('email', 'Correo electrónico', { type: 'email' })}
        ${fld('instagram', 'Instagram', { ph: 'usuario o enlace completo' })}
        ${fld('facebook', 'Facebook', { ph: 'usuario o enlace completo' })}
        ${fld('tiktok', 'TikTok', { ph: 'usuario o enlace completo' })}
        ${fld('address', 'Dirección')}
        ${fld('city', 'Ciudad')}
        ${fld('hours', 'Horario de atención', { full: true })}
      </div>
    </div>
    <div class="panel settings-section"><h2 class="display">Envíos</h2><p>El costo se suma automáticamente al total del pedido.</p>
      <div class="form-grid">
        ${fld('shipping_cost', 'Costo de envío (COP)', { num: true, hint: 'Usa 0 si el envío se cotiza por WhatsApp.' })}
        ${fld('free_shipping_from', 'Envío gratis desde (COP)', { num: true, hint: 'Usa 0 para desactivar el envío gratis.' })}
        ${fld('shipping_note', 'Información de envío', { full: true, area: true })}
      </div>
    </div>
    <div class="panel settings-section"><h2 class="display">Pagos</h2><p>Transferencia y WhatsApp funcionan siempre. El pago en línea se activa al registrar las llaves de Wompi.</p>
      <div class="form-grid">
        ${fld('payment_instructions', 'Datos para transferencia / Nequi', { full: true, area: true, ph: 'Banco, tipo y número de cuenta, titular, Nequi…' })}
        ${fld('wompi_public_key', 'Wompi: llave pública', { ph: 'pub_prod_…', hint: 'Wompi → Desarrolladores → Llaves del API.' })}
        <label class="field"><span>Wompi: secreto de integridad</span>
          <input class="input" name="wompi_integrity_secret" type="password" value="${esc(priv.wompi_integrity_secret || '')}" placeholder="prod_integrity_…" autocomplete="off">
          <span class="hint">Se guarda en una tabla privada; no es visible en la tienda.</span></label>
      </div>
    </div>
    <div class="savebar"><button class="btn" type="submit" id="ssave">Guardar configuración</button></div>
  </form>`;

  $('#sform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const txt = (k) => String(f.get(k) || '').trim();
    const row = {};
    ['store_name', 'tagline', 'announcement', 'about', 'whatsapp', 'phone', 'email', 'instagram', 'facebook', 'tiktok',
      'address', 'city', 'hours', 'shipping_note', 'payment_instructions', 'wompi_public_key'].forEach((k) => { row[k] = txt(k); });
    row.shipping_cost = Math.max(0, int(f.get('shipping_cost')));
    row.free_shipping_from = Math.max(0, int(f.get('free_shipping_from')));
    const secret = txt('wompi_integrity_secret');
    if (row.wompi_public_key && !secret) { toast('Para activar Wompi también se necesita el secreto de integridad'); return; }
    const btn = $('#ssave');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await db.saveSettings(row);
      if (secret !== (priv.wompi_integrity_secret || '')) await db.savePrivate({ wompi_integrity_secret: secret });
      Object.assign(A.settings, row);
      priv.wompi_integrity_secret = secret;
      toast('Configuración guardada', 'ok');
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.textContent = 'Guardar configuración';
  });
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
let booted = false;
async function boot() {
  try {
    const session = await auth.session();
    if (!session) return renderLogin();
    if (!(await auth.isAdmin())) return renderNoAccess(session.user?.email);
    renderShell();
    $('#content').innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    await loadAll();
    renderTab();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="login"><div class="login-card"><h1 class="display">Error</h1><div class="alert error">${esc(err.message || 'No fue posible cargar el panel.')}</div><button class="btn" onclick="location.reload()">Reintentar</button></div></div>`;
  }
}

auth.onChange((event) => {
  if (event === 'PASSWORD_RECOVERY') renderLogin('newpass');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
if (!booted) { booted = true; boot(); }
