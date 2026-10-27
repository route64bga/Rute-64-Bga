// =====================================================================
// ROUTE 64 · Tienda pública
// =====================================================================
import {
  DEMO, esc, money, icon, safeUrl, waLink, socialLink, store, toast, debounce,
  productImage, loadStore, createOrder, orderStatus,
} from './core.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');

const state = {
  data: null,
  cart: store.get('r64-cart', []), // [{ id, qty }]
  heroTimer: null,
};

// ---------------------------------------------------------------------
// Utilidades de datos
// ---------------------------------------------------------------------
const S = () => state.data.settings || {};
const productById = (id) => state.data.products.find((p) => String(p.id) === String(id));
const catById = (id) => state.data.categories.find((c) => c.id === id);
const discount = (p) => (p.compare_at_price && p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0);

function cartLines() {
  return state.cart
    .map((l) => ({ ...l, product: productById(l.id) }))
    .filter((l) => l.product);
}
const cartCount = () => cartLines().reduce((n, l) => n + l.qty, 0);
const cartSubtotal = () => cartLines().reduce((n, l) => n + l.qty * l.product.price, 0);
function shippingFor(subtotal) {
  const s = S();
  if (s.free_shipping_from > 0 && subtotal >= s.free_shipping_from) return 0;
  return Number(s.shipping_cost) || 0;
}
const shippingLabel = (subtotal) => {
  const s = S();
  if (s.free_shipping_from > 0 && subtotal >= s.free_shipping_from) return 'Gratis';
  return s.shipping_cost > 0 ? money(s.shipping_cost) : 'Por confirmar';
};

function saveCart() {
  state.cart = state.cart.filter((l) => productById(l.id) && l.qty > 0);
  store.set('r64-cart', state.cart);
  const n = cartCount();
  const badge = $('#cart-count');
  if (badge) { badge.textContent = n || ''; badge.dataset.n = n; }
}

function addToCart(id, qty = 1, open = true) {
  const p = productById(id);
  if (!p) return;
  const line = state.cart.find((l) => l.id === p.id);
  const current = line ? line.qty : 0;
  if (p.stock <= 0) return toast('Producto agotado');
  if (current + qty > p.stock) return toast(`Solo hay ${p.stock} ${p.stock === 1 ? 'unidad disponible' : 'unidades disponibles'}`);
  if (line) line.qty += qty; else state.cart.push({ id: p.id, qty });
  saveCart();
  renderDrawer();
  if (open) openDrawer(); else toast('Agregado al carrito', 'ok');
}

function setQty(id, qty) {
  const p = productById(id);
  const line = state.cart.find((l) => l.id === id);
  if (!line || !p) return;
  if (qty > p.stock) { toast(`Solo hay ${p.stock} disponibles`); qty = p.stock; }
  line.qty = qty;
  saveCart();
  renderDrawer();
}

// ---------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------
function cardHTML(p) {
  const sold = p.stock <= 0;
  const off = discount(p);
  const meta = [p.brand, p.scale].filter((x) => x && x !== '—').map(esc).join(' · ');
  return `
  <article class="card ${sold ? 'soldout' : ''}">
    <a href="#/producto/${esc(p.id)}" class="card-media" aria-label="${esc(p.name)}">
      <img src="${esc(productImage(p))}" alt="" loading="lazy">
      <div class="tags">
        ${off ? `<span class="tag">-${off}%</span>` : ''}
        ${sold ? '<span class="tag dark">Agotado</span>' : ''}
        ${!sold && p.stock === 1 ? '<span class="tag chrome">Última unidad</span>' : ''}
      </div>
    </a>
    <div class="card-body">
      ${meta ? `<div class="card-meta">${meta}</div>` : ''}
      <h3 class="card-title"><a href="#/producto/${esc(p.id)}">${esc(p.name)}</a></h3>
      <div class="price"><b>${money(p.price)}</b>${off ? `<s>${money(p.compare_at_price)}</s>` : ''}</div>
      <button class="btn btn-sm" data-add="${esc(p.id)}" ${sold ? 'disabled' : ''}>${sold ? 'Agotado' : `${icon('cart')} Agregar`}</button>
    </div>
  </article>`;
}

const gridHTML = (list) => `<div class="grid">${list.map(cardHTML).join('')}</div>`;
const emptyHTML = (msg, extra = '') => `<div class="empty">${icon('box')}<p>${msg}</p>${extra}</div>`;

// ---------------------------------------------------------------------
// Encabezado, pie y elementos fijos
// ---------------------------------------------------------------------
function renderChrome() {
  const s = S();
  if (DEMO) $('#demo-note').innerHTML = '<div class="demo-note">Vista de demostración con productos de ejemplo. Los datos reales se cargan al conectar Supabase en <b>config.js</b>.</div>';
  $('#topbar').textContent = s.announcement || '';
  if (s.store_name) document.title = `${s.store_name} | Hot Wheels y coleccionables a escala`;

  $('#header-actions').innerHTML = `
    <a class="icon-btn" href="#/catalogo?buscar=1" aria-label="Buscar productos">${icon('search')}</a>
    <button class="icon-btn" id="cart-btn" aria-label="Abrir carrito">${icon('cart')}<span class="badge-count" id="cart-count"></span></button>
    <button class="icon-btn menu-toggle" id="menu-btn" aria-label="Abrir menú" aria-expanded="false">${icon('menu')}</button>`;

  const wa = waLink(s.whatsapp, `Hola ${s.store_name || 'Route 64'}, quiero información sobre un producto.`);
  const fab = $('#fab-wa');
  if (wa) { fab.href = wa; fab.innerHTML = icon('whatsapp'); fab.hidden = false; }

  const socials = socialsHTML();
  const cats = state.data.categories.slice(0, 5);
  $('#footer').innerHTML = `
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <a href="#/" class="brand"><img src="assets/img/logo.jpg" alt="" width="52" height="52"><span class="brand-name display"><span class="chrome-text">Route</span> <span class="red">64</span></span></a>
          <p>${esc(s.about || '')}</p>
          ${socials ? `<div class="socials">${socials}</div>` : ''}
        </div>
        <div>
          <h4>Tienda</h4>
          <ul>
            <li><a href="#/catalogo">Todo el catálogo</a></li>
            <li><a href="#/catalogo/ofertas">Promociones</a></li>
            ${cats.map((c) => `<li><a href="#/catalogo/${esc(c.slug)}">${esc(c.name)}</a></li>`).join('')}
          </ul>
        </div>
        <div>
          <h4>Contacto</h4>
          <ul>
            ${s.whatsapp ? `<li><a href="${esc(waLink(s.whatsapp))}" target="_blank" rel="noopener">WhatsApp: ${esc(s.whatsapp)}</a></li>` : ''}
            ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
            ${s.address ? `<li>${esc(s.address)}</li>` : ''}
            ${s.hours ? `<li>${esc(s.hours)}</li>` : ''}
            <li><a href="#/contacto">Ver página de contacto</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${esc(s.store_name || 'Route 64')}. ${esc(s.tagline || '')}</span>
        <a href="admin.html">Administrar tienda</a>
      </div>
    </div>`;
  saveCart();
}

function socialsHTML() {
  const s = S();
  const items = [
    ['instagram', socialLink.instagram(s.instagram), 'Instagram'],
    ['facebook', socialLink.facebook(s.facebook), 'Facebook'],
    ['tiktok', socialLink.tiktok(s.tiktok), 'TikTok'],
    ['whatsapp', waLink(s.whatsapp), 'WhatsApp'],
  ].filter(([, url]) => url);
  return items.map(([ic, url, label]) => `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${label}">${icon(ic)}</a>`).join('');
}

function setActiveNav(key) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
}

function toggleMenu(force) {
  const nav = $('#nav');
  const open = force ?? !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  const btn = $('#menu-btn');
  if (btn) { btn.setAttribute('aria-expanded', open); btn.innerHTML = icon(open ? 'close' : 'menu'); }
}

// ---------------------------------------------------------------------
// Carrito (panel lateral)
// ---------------------------------------------------------------------
function renderDrawer() {
  const lines = cartLines();
  const sub = cartSubtotal();
  const s = S();
  const missing = s.free_shipping_from > 0 ? s.free_shipping_from - sub : 0;
  $('#drawer').innerHTML = `
    <div class="drawer-head">
      <h2 class="display">Tu carrito</h2>
      <button class="icon-btn" data-close-drawer aria-label="Cerrar carrito">${icon('close')}</button>
    </div>
    <div class="drawer-body">
      ${lines.length ? lines.map((l) => `
        <div class="line">
          <img src="${esc(productImage(l.product))}" alt="">
          <div>
            <div class="line-name">${esc(l.product.name)}</div>
            <div class="stepper sm">
              <button data-qty="${esc(l.id)}" data-d="-1" aria-label="Quitar una unidad">${icon('minus')}</button>
              <input value="${l.qty}" inputmode="numeric" data-qty-input="${esc(l.id)}" aria-label="Cantidad">
              <button data-qty="${esc(l.id)}" data-d="1" aria-label="Agregar una unidad">${icon('plus')}</button>
            </div>
            <div><button class="line-remove" data-remove="${esc(l.id)}">Eliminar</button></div>
          </div>
          <div class="line-price">${money(l.qty * l.product.price)}</div>
        </div>`).join('') : emptyHTML('Tu carrito está vacío.', '<a class="btn btn-sm" href="#/catalogo" data-close-drawer>Ver catálogo</a>')}
    </div>
    ${lines.length ? `
    <div class="drawer-foot">
      ${missing > 0 ? `<div class="alert info">Agrega ${money(missing)} más para obtener envío gratis.</div>` : ''}
      <div class="totals">
        <div><span>Subtotal</span><span>${money(sub)}</span></div>
        <div><span>Envío</span><span>${shippingLabel(sub)}</span></div>
        <div class="grand"><span>Total</span><span>${money(sub + shippingFor(sub))}</span></div>
      </div>
      <a class="btn btn-block" href="#/checkout" data-close-drawer>Finalizar compra</a>
      <button class="btn btn-ghost btn-block" data-close-drawer>Seguir comprando</button>
    </div>` : ''}`;
}

function openDrawer() {
  renderDrawer();
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------
function pageHome() {
  const { banners, categories, products } = state.data;
  const s = S();
  const featured = (products.filter((p) => p.featured).length ? products.filter((p) => p.featured) : products).slice(0, 8);
  const deals = products.filter((p) => discount(p) && p.stock > 0).slice(0, 4);
  const slides = banners.length ? banners : [{
    id: 'default', title: s.store_name || 'Route 64', subtitle: s.tagline || 'Colecciona. Disfruta. Vive tu pasión.',
    badge: 'Tu destino diecast', image_url: '', button_text: 'Ver catálogo', button_link: '#/catalogo',
  }];

  view.innerHTML = `
  <section class="wrap">
    <div class="hero">
      <div class="hero-track" id="hero-track">
        ${slides.map((b, i) => {
          const img = safeUrl(b.image_url);
          const link = safeUrl(b.button_link) || '#/catalogo';
          const ext = /^https?:/.test(link);
          return `
          <div class="slide ${i === 0 ? 'active' : ''} ${img ? '' : 'no-img'}" ${img ? `style="background-image:url('${esc(img)}')"` : ''} aria-hidden="${i !== 0}">
            ${img ? '' : '<img class="slide-logo" src="assets/img/logo.jpg" alt="">'}
            <div class="slide-body">
              ${b.badge ? `<span class="slide-badge">${esc(b.badge)}</span>` : ''}
              <h1 class="slide-title display">${esc(b.title)}</h1>
              ${b.subtitle ? `<p class="slide-sub">${esc(b.subtitle)}</p>` : ''}
              ${b.button_text ? `<a class="btn" href="${esc(link)}" ${ext ? 'target="_blank" rel="noopener"' : ''}>${esc(b.button_text)}</a>` : ''}
            </div>
          </div>`;
        }).join('')}
        ${slides.length > 1 ? `
          <button class="hero-arrow prev" data-hero="-1" aria-label="Anuncio anterior">${icon('left')}</button>
          <button class="hero-arrow next" data-hero="1" aria-label="Anuncio siguiente">${icon('right')}</button>
          <div class="hero-dots">${slides.map((_, i) => `<button class="${i === 0 ? 'active' : ''}" data-dot="${i}" aria-label="Ver anuncio ${i + 1}"></button>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>

  <section class="wrap section-sm">
    <div class="values">
      <div class="value">${icon('shield')}<div><b>Calidad premium</b><span>Piezas revisadas una a una</span></div></div>
      <div class="value">${icon('scan')}<div><b>Selección exclusiva</b><span>Referencias difíciles de encontrar</span></div></div>
      <div class="value">${icon('wheel')}<div><b>Detalles que inspiran</b><span>Ediciones para coleccionistas</span></div></div>
      <div class="value">${icon('truck')}<div><b>Tu destino diecast</b><span>Envíos a toda Colombia</span></div></div>
    </div>
  </section>

  ${categories.length ? `
  <section class="wrap section">
    <div class="section-head">
      <div><h2 class="section-title display">Secciones</h2><p class="section-sub">Explora el catálogo por tipo de colección.</p></div>
      <a class="link-more" href="#/catalogo">Ver todo →</a>
    </div>
    <div class="cat-grid">
      ${categories.map((c) => {
        const n = products.filter((p) => p.category_id === c.id).length;
        const first = products.find((p) => p.category_id === c.id);
        const img = safeUrl(c.image_url) || (first ? productImage(first) : 'assets/img/logo.jpg');
        return `<a class="cat-card" href="#/catalogo/${esc(c.slug)}">
          <img src="${esc(img)}" alt="" loading="lazy">
          <span class="count">${n} ${n === 1 ? 'producto' : 'productos'}</span>
          <div class="cat-body"><h3 class="display">${esc(c.name)}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ''}</div>
        </a>`;
      }).join('')}
    </div>
  </section>` : ''}

  <section class="wrap section">
    <div class="section-head">
      <div><h2 class="section-title display">Destacados</h2><p class="section-sub">Selección recomendada de la tienda.</p></div>
      <a class="link-more" href="#/catalogo">Ver catálogo →</a>
    </div>
    ${featured.length ? gridHTML(featured) : emptyHTML('Pronto publicaremos productos.')}
  </section>

  ${deals.length ? `
  <section class="wrap section">
    <div class="section-head">
      <div><h2 class="section-title display">Promociones</h2><p class="section-sub">Precios especiales por tiempo limitado.</p></div>
      <a class="link-more" href="#/catalogo/ofertas">Ver todas →</a>
    </div>
    ${gridHTML(deals)}
  </section>` : ''}

  ${ctaBand()}`;
  startHero();
}

function ctaBand() {
  const s = S();
  const ig = socialLink.instagram(s.instagram);
  const wa = waLink(s.whatsapp, 'Hola, quiero información sobre los productos disponibles.');
  if (!ig && !wa) return '';
  return `
  <section class="wrap section">
    <div class="cta-band">
      <div>
        <h2 class="display">${ig ? 'Síguenos en <span class="red">Instagram</span>' : 'Escríbenos por <span class="red">WhatsApp</span>'}</h2>
        <p>${ig ? 'Nuevos ingresos, lanzamientos y promociones publicados primero en nuestras redes.' : 'Consulta disponibilidad, encargos y referencias especiales.'}</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ig ? `<a class="btn btn-chrome" href="${esc(ig)}" target="_blank" rel="noopener">${icon('instagram')} ${esc(s.instagram.startsWith('http') ? 'Instagram' : '@' + s.instagram.replace(/^@/, ''))}</a>` : ''}
        ${wa ? `<a class="btn btn-wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>` : ''}
      </div>
    </div>
  </section>`;
}

function startHero() {
  clearInterval(state.heroTimer);
  const track = $('#hero-track');
  if (!track) return;
  const slides = [...track.querySelectorAll('.slide')];
  if (slides.length < 2) return;
  let i = 0;
  const go = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.setAttribute('aria-hidden', k !== i); });
    track.querySelectorAll('[data-dot]').forEach((d, k) => d.classList.toggle('active', k === i));
  };
  const play = () => { clearInterval(state.heroTimer); state.heroTimer = setInterval(() => go(i + 1), 6000); };
  track.addEventListener('click', (e) => {
    const a = e.target.closest('[data-hero]');
    const d = e.target.closest('[data-dot]');
    if (a) { go(i + Number(a.dataset.hero)); play(); }
    if (d) { go(Number(d.dataset.dot)); play(); }
  });
  track.addEventListener('mouseenter', () => clearInterval(state.heroTimer));
  track.addEventListener('mouseleave', play);
  let x0 = null;
  track.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); play(); }
    x0 = null;
  });
  play();
}

function pageCatalog(slug, params) {
  const { categories, products } = state.data;
  const cat = categories.find((c) => c.slug === slug);
  const isDeals = slug === 'ofertas';
  setActiveNav(isDeals ? 'ofertas' : 'catalogo');
  const title = isDeals ? 'Promociones' : cat ? cat.name : 'Catálogo';
  const sub = isDeals ? 'Productos con precio especial.' : cat ? cat.description : 'Todos los productos disponibles.';
  const filters = { q: '', sort: 'relevancia' };

  view.innerHTML = `
  <section class="wrap">
    <div class="page-head">
      <div class="crumbs"><a href="#/">Inicio</a> / ${cat || isDeals ? '<a href="#/catalogo">Catálogo</a> / ' : ''}${esc(title)}</div>
      <h1 class="page-title display">${esc(title)}</h1>
      ${sub ? `<p class="section-sub">${esc(sub)}</p>` : ''}
    </div>
    <div class="toolbar">
      <div class="chips" role="list">
        <a class="chip ${!cat && !isDeals ? 'active' : ''}" href="#/catalogo">Todo</a>
        <a class="chip ${isDeals ? 'active' : ''}" href="#/catalogo/ofertas">Promociones</a>
        ${categories.map((c) => `<a class="chip ${cat && cat.id === c.id ? 'active' : ''}" href="#/catalogo/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}
      </div>
      <label class="search">${icon('search')}<span class="sr-only">Buscar</span><input id="q" type="search" placeholder="Buscar por nombre, marca o escala" autocomplete="off"></label>
      <select class="select" id="sort" aria-label="Ordenar">
        <option value="relevancia">Más recientes</option>
        <option value="precio-asc">Menor precio</option>
        <option value="precio-desc">Mayor precio</option>
        <option value="nombre">Nombre A–Z</option>
      </select>
    </div>
    <div id="results"></div>
  </section>
  <div class="section-sm"></div>`;

  const draw = () => {
    let list = products.slice();
    if (cat) list = list.filter((p) => p.category_id === cat.id);
    if (isDeals) list = list.filter((p) => discount(p));
    const q = filters.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q) {
      list = list.filter((p) => [p.name, p.brand, p.scale, p.description, catById(p.category_id)?.name]
        .join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    }
    if (filters.sort === 'precio-asc') list.sort((a, b) => a.price - b.price);
    if (filters.sort === 'precio-desc') list.sort((a, b) => b.price - a.price);
    if (filters.sort === 'nombre') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    // Los agotados van al final
    list.sort((a, b) => (a.stock <= 0) - (b.stock <= 0));
    $('#results').innerHTML = list.length
      ? `<p class="hint" style="margin:0 0 12px">${list.length} ${list.length === 1 ? 'producto' : 'productos'}</p>${gridHTML(list)}`
      : emptyHTML(q ? `No hay resultados para “${esc(filters.q)}”.` : 'Esta sección aún no tiene productos.');
  };
  $('#q').addEventListener('input', debounce((e) => { filters.q = e.target.value; draw(); }, 180));
  $('#sort').addEventListener('change', (e) => { filters.sort = e.target.value; draw(); });
  draw();
  if (params.get('buscar')) setTimeout(() => $('#q').focus(), 50);
  const active = $('.chip.active');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function pageProduct(id) {
  const p = productById(id);
  if (!p) return pageNotFound('Este producto no está disponible.');
  setActiveNav('catalogo');
  const cat = catById(p.category_id);
  const off = discount(p);
  const sold = p.stock <= 0;
  const imgs = p.images && p.images.length ? p.images : [productImage(p)];
  const s = S();
  const wa = waLink(s.whatsapp, `Hola, me interesa el producto "${p.name}" (${money(p.price)}). ¿Está disponible?`);
  const related = state.data.products.filter((x) => x.id !== p.id && x.category_id === p.category_id && x.stock > 0).slice(0, 4);
  const stockClass = sold ? 'out' : p.stock <= 2 ? 'low' : '';
  const stockText = sold ? 'Agotado' : p.stock === 1 ? 'Última unidad disponible' : p.stock <= 2 ? `Quedan ${p.stock} unidades` : 'Disponible';

  view.innerHTML = `
  <section class="wrap">
    <div class="pdp">
      <div>
        <div class="gallery-main">
          <img id="main-img" src="${esc(imgs[0])}" alt="${esc(p.name)}">
          <div class="tags">${off ? `<span class="tag">-${off}%</span>` : ''}${sold ? '<span class="tag dark">Agotado</span>' : ''}</div>
        </div>
        ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((src, i) => `<button class="${i === 0 ? 'active' : ''}" data-thumb="${esc(src)}" aria-label="Ver foto ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="pdp-info">
        <div class="crumbs"><a href="#/catalogo">Catálogo</a>${cat ? ` / <a href="#/catalogo/${esc(cat.slug)}">${esc(cat.name)}</a>` : ''}</div>
        <h1 class="display">${esc(p.name)}</h1>
        <div class="stock-note ${stockClass}">${stockText}</div>
        <div class="pdp-price"><b>${money(p.price)}</b>${off ? `<s>${money(p.compare_at_price)}</s><span class="tag">Ahorras ${money(p.compare_at_price - p.price)}</span>` : ''}</div>
        <div class="specs">
          ${p.brand ? `<div class="spec"><small>Marca</small><b>${esc(p.brand)}</b></div>` : ''}
          ${p.scale && p.scale !== '—' ? `<div class="spec"><small>Escala</small><b>${esc(p.scale)}</b></div>` : ''}
          ${cat ? `<div class="spec"><small>Sección</small><b>${esc(cat.name)}</b></div>` : ''}
        </div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        ${sold ? '' : `
        <div class="buy-row">
          <div class="stepper" id="pdp-qty">
            <button data-step="-1" aria-label="Menos">${icon('minus')}</button>
            <input value="1" inputmode="numeric" aria-label="Cantidad">
            <button data-step="1" aria-label="Más">${icon('plus')}</button>
          </div>
          <button class="btn" id="pdp-add">${icon('cart')} Agregar al carrito</button>
        </div>
        <div class="buy-row" style="margin-top:10px">
          <button class="btn btn-chrome" id="pdp-buy">Comprar ahora</button>
          ${wa ? `<a class="btn btn-wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')} Consultar</a>` : ''}
        </div>`}
        ${sold && wa ? `<div class="buy-row"><a class="btn btn-wa" href="${esc(waLink(s.whatsapp, `Hola, ¿van a tener de nuevo "${p.name}"?`))}" target="_blank" rel="noopener">${icon('whatsapp')} Avisarme cuando llegue</a></div>` : ''}
        ${s.shipping_note ? `<div class="alert info" style="margin-top:18px">${icon('truck')} ${esc(s.shipping_note)}</div>` : ''}
      </div>
    </div>
  </section>
  ${related.length ? `
  <section class="wrap section" style="padding-top:0">
    <div class="section-head"><h2 class="section-title display">También te puede interesar</h2></div>
    ${gridHTML(related)}
  </section>` : ''}`;

  view.querySelectorAll('[data-thumb]').forEach((b) => b.addEventListener('click', () => {
    $('#main-img').src = b.dataset.thumb;
    view.querySelectorAll('[data-thumb]').forEach((x) => x.classList.toggle('active', x === b));
  }));
  if (!sold) {
    const input = $('#pdp-qty input');
    const clamp = (v) => Math.max(1, Math.min(p.stock, Number.parseInt(v, 10) || 1));
    $('#pdp-qty').addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (b) input.value = clamp(Number(input.value) + Number(b.dataset.step));
    });
    input.addEventListener('change', () => { input.value = clamp(input.value); });
    $('#pdp-add').addEventListener('click', () => addToCart(p.id, clamp(input.value)));
    $('#pdp-buy').addEventListener('click', () => {
      const line = state.cart.find((l) => l.id === p.id);
      if (!line) addToCart(p.id, clamp(input.value), false);
      location.hash = '#/checkout';
    });
  }
}

function pageCheckout() {
  setActiveNav('-');
  const lines = cartLines();
  if (!lines.length) {
    view.innerHTML = `<section class="wrap section">${emptyHTML('Tu carrito está vacío.', '<a class="btn" href="#/catalogo">Ver catálogo</a>')}</section>`;
    return;
  }
  const s = S();
  const sub = cartSubtotal();
  const methods = [];
  if (s.wompi_public_key) methods.push(['wompi', 'card', 'Pago en línea', 'Tarjeta débito o crédito, PSE, Nequi o Botón Bancolombia, procesado por Wompi.']);
  methods.push(['transferencia', 'bank', 'Transferencia o Nequi', 'Al confirmar verás los datos de pago. Envía el comprobante por WhatsApp.']);
  if (s.whatsapp) methods.push(['whatsapp', 'whatsapp', 'Acordar el pago por WhatsApp', 'Confirmamos disponibilidad, envío y forma de pago por chat.']);
  const saved = store.get('r64-customer', {});

  view.innerHTML = `
  <section class="wrap">
    <div class="page-head">
      <div class="crumbs"><a href="#/">Inicio</a> / Finalizar compra</div>
      <h1 class="page-title display">Finalizar compra</h1>
      <p class="section-sub">Compra como invitado. No es necesario crear una cuenta.</p>
    </div>
    <form class="checkout" id="checkout-form" novalidate>
      <div>
        <div class="panel">
          <h2 class="display">Datos de contacto y envío</h2>
          <div class="form-grid">
            <label class="field full"><span>Nombre completo <em>*</em></span><input class="input" name="name" required autocomplete="name" value="${esc(saved.name || '')}"></label>
            <label class="field"><span>Celular / WhatsApp <em>*</em></span><input class="input" name="phone" required inputmode="tel" autocomplete="tel" value="${esc(saved.phone || '')}"></label>
            <label class="field"><span>Correo electrónico</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(saved.email || '')}"></label>
            <label class="field"><span>Cédula</span><input class="input" name="document" inputmode="numeric" value="${esc(saved.document || '')}"></label>
            <label class="field"><span>Ciudad <em>*</em></span><input class="input" name="city" required autocomplete="address-level2" value="${esc(saved.city || '')}"></label>
            <label class="field full"><span>Dirección de entrega <em>*</em></span><input class="input" name="address" required autocomplete="street-address" placeholder="Calle, número, barrio, apartamento" value="${esc(saved.address || '')}"></label>
            <label class="field full"><span>Notas del pedido</span><textarea class="textarea" name="notes" placeholder="Indicaciones de entrega u observaciones"></textarea></label>
          </div>
        </div>
        <div class="panel">
          <h2 class="display">Método de pago</h2>
          <div class="pay-options">
            ${methods.map(([v, ic, t, d], i) => `
              <label class="pay-option"><input type="radio" name="method" value="${v}" ${i === 0 ? 'checked' : ''}>
                <div><b>${icon(ic)} ${t}</b><small>${d}</small></div></label>`).join('')}
          </div>
        </div>
      </div>
      <div class="sticky">
        <div class="panel">
          <h2 class="display">Resumen</h2>
          ${lines.map((l) => `
            <div class="mini-line"><img src="${esc(productImage(l.product))}" alt="">
              <div class="grow"><div>${esc(l.product.name)}</div><small>${l.qty} × ${money(l.product.price)}</small></div>
              <b>${money(l.qty * l.product.price)}</b></div>`).join('')}
          <div class="totals" style="margin-top:14px">
            <div><span>Subtotal</span><span>${money(sub)}</span></div>
            <div><span>Envío</span><span>${shippingLabel(sub)}</span></div>
            <div class="grand"><span>Total</span><span>${money(sub + shippingFor(sub))}</span></div>
          </div>
          ${s.shipping_note ? `<p class="hint" style="margin:12px 0 0">${esc(s.shipping_note)}</p>` : ''}
          <div id="checkout-error" style="margin-top:14px"></div>
          <button class="btn btn-block" type="submit" id="checkout-submit" style="margin-top:14px">Confirmar pedido</button>
          <a class="btn btn-ghost btn-block" href="#/catalogo" style="margin-top:10px">Seguir comprando</a>
        </div>
      </div>
    </form>
  </section>`;

  $('#checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const customer = Object.fromEntries(['name', 'phone', 'email', 'document', 'city', 'address', 'notes'].map((k) => [k, String(f.get(k) || '').trim()]));
    const method = f.get('method');
    const errBox = $('#checkout-error');
    const missing = [['name', 'nombre'], ['phone', 'celular'], ['city', 'ciudad'], ['address', 'dirección']].filter(([k]) => !customer[k]).map(([, l]) => l);
    if (missing.length) { errBox.innerHTML = `<div class="alert error">Completa los campos obligatorios: ${missing.join(', ')}.</div>`; return; }
    if (customer.phone.replace(/\D/g, '').length < 7) { errBox.innerHTML = '<div class="alert error">El número de celular no es válido.</div>'; return; }
    if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) { errBox.innerHTML = '<div class="alert error">El correo electrónico no es válido.</div>'; return; }
    errBox.innerHTML = '';
    const btn = $('#checkout-submit');
    btn.disabled = true; btn.textContent = 'Procesando…';
    try {
      const items = cartLines().map((l) => ({ id: l.id, qty: l.qty }));
      const res = await createOrder(customer, items, method);
      store.set('r64-customer', { ...customer, notes: '' });
      store.set('r64-last-order', { ...res, customer, method });
      state.cart = []; saveCart();
      if (method === 'wompi' && res.signature) {
        location.href = wompiUrl(res, customer);
      } else {
        location.hash = `#/pedido/${res.reference}`;
      }
    } catch (err) {
      errBox.innerHTML = `<div class="alert error">${esc(err.message || 'No fue posible registrar el pedido. Intenta de nuevo.')}</div>`;
      btn.disabled = false; btn.textContent = 'Confirmar pedido';
    }
  });
}

function wompiUrl(res, c) {
  const u = new URL('https://checkout.wompi.co/p/');
  const redirect = `${location.origin}${location.pathname}#/pedido/${res.reference}`;
  u.searchParams.set('public-key', res.public_key);
  u.searchParams.set('currency', 'COP');
  u.searchParams.set('amount-in-cents', String(res.amount_in_cents));
  u.searchParams.set('reference', res.reference);
  u.searchParams.set('signature:integrity', res.signature);
  u.searchParams.set('redirect-url', redirect);
  if (c.email) u.searchParams.set('customer-data:email', c.email);
  if (c.name) u.searchParams.set('customer-data:full-name', c.name);
  const phone = c.phone.replace(/\D/g, '').slice(-10);
  if (phone) { u.searchParams.set('customer-data:phone-number', phone); u.searchParams.set('customer-data:phone-number-prefix', '+57'); }
  return u.toString();
}

function orderMessage(o) {
  const lines = (o.items || []).map((i) => `• ${i.qty} × ${i.name} (${money(i.price * i.qty)})`).join('\n');
  return `Hola ${S().store_name || 'Route 64'}, realicé el pedido ${o.reference}.\n${lines}\nTotal: ${money(o.total)}\nNombre: ${o.customer?.name || ''}\nCiudad: ${o.customer?.city || ''}`;
}

async function pageOrder(ref, params) {
  setActiveNav('-');
  const s = S();
  const last = store.get('r64-last-order', null);
  const o = last && last.reference === ref ? last : { reference: ref, items: [], method: '' };
  const txId = params.get('id') || new URLSearchParams(location.search).get('id');

  view.innerHTML = `<section class="wrap"><div class="confirm" id="confirm"><div class="loader"><div class="spinner"></div></div></div></section>`;

  let tx = null;
  if (txId) {
    const key = s.wompi_public_key || '';
    const host = key.startsWith('pub_test') ? 'sandbox.wompi.co' : 'production.wompi.co';
    try {
      const r = await fetch(`https://${host}/v1/transactions/${encodeURIComponent(txId)}`);
      if (r.ok) tx = (await r.json()).data;
    } catch { /* sin conexión con Wompi */ }
  }
  const st = await orderStatus(ref).catch(() => null);

  let head;
  if (tx && tx.status === 'APPROVED') head = ['ok', 'check', 'Pago aprobado', 'Recibimos tu pago. Prepararemos tu pedido y te contactaremos para coordinar el envío.'];
  else if (tx && ['DECLINED', 'VOIDED', 'ERROR'].includes(tx.status)) head = ['', 'alert', 'Pago no aprobado', 'La transacción no fue aprobada. Puedes intentarlo de nuevo o escribirnos por WhatsApp para pagar por otro medio.'];
  else if (tx) head = ['', 'clock', 'Pago en verificación', 'La transacción está pendiente de confirmación. Te contactaremos cuando se apruebe.'];
  else head = ['ok', 'check', 'Pedido recibido', o.method === 'whatsapp' ? 'Continúa por WhatsApp para confirmar disponibilidad, envío y pago.' : o.method === 'transferencia' ? 'Realiza el pago con los datos indicados y envía el comprobante por WhatsApp.' : 'Guarda la referencia de tu pedido.'];

  const wa = waLink(s.whatsapp, orderMessage(o));
  const statusLabel = { pendiente: 'Pendiente de pago', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };

  $('#confirm').innerHTML = `
    <div class="big-icon ${head[0]}">${icon(head[1])}</div>
    <h1 class="page-title display">${head[2]}</h1>
    <p class="section-sub">${head[3]}</p>
    <div class="ref">${esc(ref)}</div>
    ${st && !tx ? `<p class="hint">Estado: <b>${esc(statusLabel[st.status] || st.status)}</b></p>` : ''}
    ${o.method === 'transferencia' && s.payment_instructions ? `
      <div class="panel"><h2 class="display">Datos para el pago</h2><p class="desc" style="margin:0">${esc(s.payment_instructions)}</p>
      <p class="hint" style="margin:10px 0 0">Valor a pagar: <b>${money(o.total)}</b> · Referencia: <b>${esc(ref)}</b></p></div>` : ''}
    ${o.items?.length ? `
      <div class="panel"><h2 class="display">Resumen del pedido</h2>
        ${o.items.map((i) => `<div class="mini-line"><div class="grow"><div>${esc(i.name)}</div><small>${i.qty} × ${money(i.price)}</small></div><b>${money(i.qty * i.price)}</b></div>`).join('')}
        <div class="totals" style="margin-top:12px">
          <div><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
          <div><span>Envío</span><span>${o.shipping ? money(o.shipping) : 'Por confirmar / gratis'}</span></div>
          <div class="grand"><span>Total</span><span>${money(o.total)}</span></div>
        </div>
      </div>` : ''}
    <div class="buy-row" style="justify-content:center">
      ${wa ? `<a class="btn btn-wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')} ${o.method === 'transferencia' ? 'Enviar comprobante' : 'Escribir por WhatsApp'}</a>` : ''}
      ${tx && tx.status !== 'APPROVED' && tx.status !== 'PENDING' && o.items?.length ? '<button class="btn btn-ghost" data-retry>Volver a intentar</button>' : ''}
      <a class="btn btn-ghost" href="#/catalogo">Seguir comprando</a>
    </div>`;
}

function pageContact() {
  setActiveNav('contacto');
  const s = S();
  const items = [
    ['whatsapp', 'WhatsApp', s.whatsapp, waLink(s.whatsapp)],
    ['instagram', 'Instagram', s.instagram && (s.instagram.startsWith('http') ? 'Instagram' : '@' + s.instagram.replace(/^@/, '')), socialLink.instagram(s.instagram)],
    ['facebook', 'Facebook', s.facebook && 'Facebook', socialLink.facebook(s.facebook)],
    ['tiktok', 'TikTok', s.tiktok && (s.tiktok.startsWith('http') ? 'TikTok' : '@' + s.tiktok.replace(/^@/, '')), socialLink.tiktok(s.tiktok)],
    ['mail', 'Correo', s.email, s.email ? `mailto:${s.email}` : ''],
    ['phone', 'Teléfono', s.phone, s.phone ? `tel:${s.phone.replace(/\s/g, '')}` : ''],
    ['pin', 'Ubicación', s.address, ''],
    ['clock', 'Horario de atención', s.hours, ''],
  ].filter(([, , v]) => v);

  view.innerHTML = `
  <section class="wrap">
    <div class="page-head">
      <div class="crumbs"><a href="#/">Inicio</a> / Contacto</div>
      <h1 class="page-title display">Contacto</h1>
      <p class="section-sub">${esc(s.about || '')}</p>
    </div>
    <div class="contact-grid" style="margin-top:20px">
      <div class="contact-list">
        ${items.map(([ic, label, val, url]) => {
          const inner = `${icon(ic)}<div><small>${label}</small>${esc(val)}</div>`;
          const ext = url && /^https?:/.test(url);
          return url ? `<a class="contact-item" href="${esc(url)}" ${ext ? 'target="_blank" rel="noopener"' : ''}>${inner}</a>` : `<div class="contact-item">${inner}</div>`;
        }).join('') || emptyHTML('Información de contacto pendiente de publicar.')}
      </div>
      <form class="panel" id="contact-form">
        <h2 class="display">Escríbenos</h2>
        <div class="form-grid">
          <label class="field full"><span>Nombre</span><input class="input" name="name" required autocomplete="name"></label>
          <label class="field full"><span>Mensaje</span><textarea class="textarea" name="msg" required placeholder="Consulta sobre un producto, encargo o envío"></textarea></label>
        </div>
        <button class="btn btn-block" style="margin-top:16px" type="submit">${s.whatsapp ? `${icon('whatsapp')} Enviar por WhatsApp` : `${icon('mail')} Enviar por correo`}</button>
        <p class="hint" style="margin:10px 0 0">El mensaje se abre en ${s.whatsapp ? 'WhatsApp' : 'tu aplicación de correo'} para enviarlo.</p>
      </form>
    </div>
  </section>`;

  $('#contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get('name') || '').trim();
    const msg = String(f.get('msg') || '').trim();
    if (!name || !msg) return toast('Completa tu nombre y el mensaje');
    const text = `Hola, soy ${name}. ${msg}`;
    if (s.whatsapp) window.open(waLink(s.whatsapp, text), '_blank', 'noopener');
    else if (s.email) location.href = `mailto:${s.email}?subject=${encodeURIComponent('Consulta desde la página web')}&body=${encodeURIComponent(text)}`;
    else toast('La tienda aún no ha publicado sus datos de contacto');
  });
}

function pageNotFound(msg = 'La página que buscas no existe.') {
  setActiveNav('-');
  view.innerHTML = `<section class="wrap section">${emptyHTML(esc(msg), '<a class="btn" href="#/">Ir al inicio</a>')}</section>`;
}

// ---------------------------------------------------------------------
// Enrutador
// ---------------------------------------------------------------------
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs || '') };
}

function route() {
  clearInterval(state.heroTimer);
  toggleMenu(false);
  closeDrawer();
  const { parts, params } = parseHash();
  const [r, a] = parts;
  setActiveNav(r || '');
  if (!r) pageHome();
  else if (r === 'catalogo') pageCatalog(a, params);
  else if (r === 'producto') pageProduct(a);
  else if (r === 'carrito') { pageCatalog(undefined, params); openDrawer(); }
  else if (r === 'checkout') pageCheckout();
  else if (r === 'pedido') pageOrder(a, params);
  else if (r === 'contacto') pageContact();
  else pageNotFound();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---------------------------------------------------------------------
// Eventos globales
// ---------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const t = e.target;
  const add = t.closest('[data-add]');
  if (add) { e.preventDefault(); addToCart(add.dataset.add); return; }
  if (t.closest('#cart-btn')) { openDrawer(); return; }
  if (t.closest('#menu-btn')) { toggleMenu(); return; }
  if (t.closest('[data-close-drawer]')) { closeDrawer(); return; }
  if (t.closest('#overlay')) { closeDrawer(); return; }
  const q = t.closest('[data-qty]');
  if (q) {
    const line = state.cart.find((l) => l.id === q.dataset.qty);
    if (!line) return;
    const n = line.qty + Number(q.dataset.d);
    if (n <= 0) { state.cart = state.cart.filter((l) => l !== line); saveCart(); renderDrawer(); } else setQty(line.id, n);
    return;
  }
  const retry = t.closest('[data-retry]');
  if (retry) {
    const last = store.get('r64-last-order', null);
    if (last?.items) { state.cart = last.items.map((i) => ({ id: i.id, qty: i.qty })); saveCart(); }
    location.hash = '#/checkout';
    return;
  }
  const rm = t.closest('[data-remove]');
  if (rm) { state.cart = state.cart.filter((l) => l.id !== rm.dataset.remove); saveCart(); renderDrawer(); }
  if (t.closest('.nav a')) toggleMenu(false);
});
document.addEventListener('change', (e) => {
  const inp = e.target.closest('[data-qty-input]');
  if (inp) {
    const n = Number.parseInt(inp.value, 10);
    if (!n || n < 1) { state.cart = state.cart.filter((l) => l.id !== inp.dataset.qtyInput); saveCart(); renderDrawer(); }
    else setQty(inp.dataset.qtyInput, n);
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); toggleMenu(false); } });
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
async function init() {
  view.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    state.data = await loadStore();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<section class="wrap section">${emptyHTML('No fue posible cargar la tienda. Revisa tu conexión e intenta de nuevo.', '<button class="btn" onclick="location.reload()">Reintentar</button>')}</section>`;
    return;
  }
  renderChrome();
  renderDrawer();
  route();
}
init();
