/**
 * Shared utilities used across all pages
 */

// ===== AUTH =====
const Auth = {
  getToken: () => localStorage.getItem('kkm_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('kkm_user')); } catch { return null; } },
  isLoggedIn: () => !!Auth.getToken(),
  isDealer: () => Auth.getUser()?.role === 'dealer',
  isAdmin: () => Auth.getUser()?.role === 'admin',
  isEmployee: () => Auth.getUser()?.role === 'employee',
  isStaff: () => ['admin', 'employee'].includes(Auth.getUser()?.role),
  logout: () => {
    localStorage.removeItem('kkm_token');
    localStorage.removeItem('kkm_user');
    window.location.href = '/';
  },
  headers: () => {
    const h = { 'Content-Type': 'application/json' };
    const t = Auth.getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }
};

// ===== API =====
const API = {
  async get(path) {
    const r = await fetch(`/api${path}`, { headers: Auth.headers() });
    if (!r.ok) { 
        if (r.status === 401) Auth.logout(); 
        const e = await r.json(); throw new Error(e.error || 'Sunucu hatası'); 
    }
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(`/api${path}`, { method: 'POST', headers: Auth.headers(), body: JSON.stringify(data) });
    if (!r.ok) { 
        if (r.status === 401) Auth.logout(); 
        const e = await r.json(); throw new Error(e.error || 'Sunucu hatası'); 
    }
    return r.json();
  },
  async put(path, data) {
    const r = await fetch(`/api${path}`, { method: 'PUT', headers: Auth.headers(), body: JSON.stringify(data) });
    if (!r.ok) { 
        if (r.status === 401) Auth.logout();
        const e = await r.json(); throw new Error(e.error || 'Sunucu hatası'); 
    }
    return r.json();
  },
  async delete(path) {
    const r = await fetch(`/api${path}`, { method: 'DELETE', headers: Auth.headers() });
    if (!r.ok) { 
        if (r.status === 401) Auth.logout();
        const e = await r.json(); throw new Error(e.error || 'Sunucu hatası'); 
    }
    return r.json();
  },
  async patch(path, data) {
    const r = await fetch(`/api${path}`, { method: 'PATCH', headers: Auth.headers(), body: JSON.stringify(data) });
    if (!r.ok) {
        if (r.status === 401) Auth.logout();
        const e = await r.json(); throw new Error(e.error || 'Sunucu hatası');
    }
    return r.json();
  },
  async postForm(path, formData) {
    const t = Auth.getToken();
    const h = t ? { 'Authorization': `Bearer ${t}` } : {};
    const r = await fetch(`/api${path}`, { method: 'POST', headers: h, body: formData });
    if (!r.ok) { 
        if (r.status === 401) Auth.logout();
        const e = await r.json(); throw new Error(e.error || 'Sunucu hatası'); 
    }
    return r.json();
  }
};

// ===== TOAST =====
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    this.init();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span style="font-size:20px">${icons[type]||'ℹ️'}</span><div><p style="font-size:14px;font-weight:600;margin:0">${message}</p></div>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); }
};

// ===== FORMAT =====
const Format = {
  price: (v) => v != null ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(v) : null,
  date: (d) => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-',
  datetime: (d) => d ? new Date(d).toLocaleString('tr-TR') : '-',
  number: (n) => new Intl.NumberFormat('tr-TR').format(n || 0),
  statusLabel: (s) => ({
    pending: 'Bekliyor',
    pending_stock_check: 'Stok Kontrol Bekliyor',
    payment_link_sent: 'Ödeme Linki Gönderildi',
    project_discount_set: 'Proje İskontosu Tanımlandı',
    confirmed: 'Onaylandı',
    processing: 'Hazırlanıyor',
    shipped: 'Kargoda',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal Edildi',
    refunded: 'İade Edildi',
    // Dealer project statuses
    draft: 'Taslak',
    pending_discount: 'İskonto Bekleniyor',
    discount_approved: 'İskonto Onaylandı',
    sent: 'Teklif Gönderildi',
    accepted: 'Kabul Edildi',
    rejected: 'Reddedildi',
    completed: 'Tamamlandı',
    // Quote request
    new: 'Yeni',
    in_review: 'İnceleniyor',
    replied: 'Yanıtlandı',
    closed: 'Kapalı'
  })[s] || s,
  statusBadge: (s) => {
    const cls = {
      pending: 'badge-yellow', pending_stock_check: 'badge-yellow', confirmed: 'badge-green',
      payment_link_sent: 'badge-blue', shipped: 'badge-blue', delivered: 'badge-green',
      cancelled: 'badge-red', refunded: 'badge-red', processing: 'badge-orange',
      draft: 'badge-gray', pending_discount: 'badge-yellow', discount_approved: 'badge-green',
      sent: 'badge-blue', accepted: 'badge-green', rejected: 'badge-red', completed: 'badge-green',
      new: 'badge-orange', in_review: 'badge-blue', replied: 'badge-green', closed: 'badge-gray'
    }[s] || 'badge-gray';
    return `<span class="badge ${cls}">${Format.statusLabel(s)}</span>`;
  },
  stockBadge: (status) => {
    const map = {
      in_stock: ['in-stock', '✓ Stokta'],
      out_of_stock: ['out-stock', '✗ Stok Yok'],
      on_request: ['on-request', '⏱ Talep Üzerine / Stok Sorunuz'],
      price_on_request: ['price-req', '💰 Fiyat Sorunuz']
    };
    const [cls, label] = map[status] || ['out-stock', 'Bilinmiyor'];
    return `<span class="stock-badge ${cls}"><span class="stock-dot"></span>${label}</span>`;
  }
};

// ===== CART =====
const Cart = {
  sessionId: localStorage.getItem('kkm_session') || (() => { const id = Math.random().toString(36).slice(2); localStorage.setItem('kkm_session', id); return id; })(),
  headers: () => ({ ...Auth.headers(), 'x-session-id': Cart.sessionId }),

  async get() {
    const r = await fetch('/api/cart', { headers: Cart.headers() });
    return r.json();
  },
  async add(productId, quantity = 1) {
    const r = await fetch('/api/cart/add', { method: 'POST', headers: { ...Cart.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: productId, quantity }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    Cart.updateBadge();
    return d;
  },
  async update(itemId, quantity) {
    const r = await fetch('/api/cart/update', { method: 'PUT', headers: { ...Cart.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, quantity }) });
    return r.json();
  },
  async remove(itemId) {
    const r = await fetch(`/api/cart/remove/${itemId}`, { method: 'DELETE', headers: Cart.headers() });
    return r.json();
  },
  async clear() {
    const r = await fetch('/api/cart/clear', { method: 'DELETE', headers: Cart.headers() });
    return r.json();
  },
  async updateBadge() {
    try {
      const { items } = await Cart.get();
      const count = items?.reduce((s, i) => s + i.quantity, 0) || 0;
      document.querySelectorAll('.cart-count').forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? '' : 'none';
      });
    } catch {}
  }
};

// ===== NOTIFICATIONS =====
const Notifications = {
  async load() {
    if (!Auth.isLoggedIn()) return;
    try {
      const { unreadCount } = await API.get('/notifications');
      document.querySelectorAll('.notif-count').forEach(el => {
        el.textContent = unreadCount;
        el.style.display = unreadCount > 0 ? '' : 'none';
      });
    } catch {}
  }
};

// ===== SITE SETTINGS =====
const SiteSettings = {
  async load() {
    try {
      const s = await fetch('/api/settings/public').then(r=>r.json());
      if (s.site_name) {
        document.title = document.title.includes('|') ? `${document.title.split('|')[0]} | ${s.site_name}` : s.site_name;
        document.querySelectorAll('.brand-name-text').forEach(el => el.textContent = s.site_name);
      }
      if (s.site_phone) document.querySelectorAll('.contact-phone').forEach(el => { el.href=`tel:${s.site_phone.replace(/\s+/g,'')}`; el.textContent=s.site_phone; });
      if (s.site_email) document.querySelectorAll('.contact-email').forEach(el => { el.href=`mailto:${s.site_email}`; el.textContent=s.site_email; });
      if (s.site_address) document.querySelectorAll('.contact-address').forEach(el => el.textContent = s.site_address);
      if (s.site_logo) {
        document.querySelectorAll('.nav-logo-icon-wrap').forEach(el => {
          el.innerHTML = `<img src="${s.site_logo}" class="site-logo-img" alt="logo" onerror="this.parentNode.innerHTML='<div class=nav-logo-emoji-fallback>&#128293;</div>'">`;
        });
      }
      if (s.whatsapp_number) {
        const waNum = s.whatsapp_number.replace(/\D/g,'');
        document.querySelectorAll('.whatsapp-link').forEach(el => { el.href = `https://wa.me/${waNum}`; });
        // Inject floating WhatsApp button if not already present
        if (!document.getElementById('wa-float-btn')) {
          const waBtn = document.createElement('a');
          waBtn.id = 'wa-float-btn';
          waBtn.className = 'wa-float-btn';
          waBtn.href = `https://wa.me/${waNum}`;
          waBtn.target = '_blank';
          waBtn.rel = 'noopener';
          waBtn.title = 'WhatsApp ile iletişim';
          waBtn.innerHTML = '&#x1F4AC;';
          waBtn.style.cssText = '';
          document.body.appendChild(waBtn);
        }
      }

      // Hero Slider logic
      const hero = document.getElementById('hero-section');
      if (hero && (s.site_banner_1 || s.site_banner_2 || s.site_banner_3)) {
        const banners = [s.site_banner_1, s.site_banner_2, s.site_banner_3].filter(Boolean);
        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'hero-slider';
        sliderWrap.innerHTML = banners.map(b => `<div class="hero-slide" style="background-image:url('${b}')"></div>`).join('');
        hero.insertBefore(sliderWrap, hero.firstChild);
        
        if (banners.length > 1) {
          let cIdx = 0;
          setInterval(() => {
            cIdx = (cIdx + 1) % banners.length;
            sliderWrap.style.transform = `translateX(-${cIdx * 100}%)`;
          }, 4500);
        }
      }
    } catch(e) {}
  }
};

// ===== CATEGORY MENU =====
const CategoryMenu = {
  async render() {
    const nav = document.getElementById('category-nav-list');
    if (!nav) return;
    try {
      const cats = await fetch('/api/categories').then(r=>r.json());
      const roots = cats.filter(c => !c.parent_id).sort((a,b)=>a.sort_order-b.sort_order);
      const children = cats.filter(c => c.parent_id);
      
      let html = `<li><a href="/urunler.html">🌟 Tüm Ürünler</a></li>`;
      roots.forEach(root => {
        const subs = children.filter(c => c.parent_id === root.id).sort((a,b)=>a.sort_order-b.sort_order);
        if (subs.length > 0) {
          html += `<li class="has-dropdown">
            <button class="cat-nav-btn" onclick="window.location.href='/urunler.html?category=${root.id}'">
              ${root.name} <span class="cat-dropdown-arrow">▼</span>
            </button>
            <div class="cat-dropdown">
              ${subs.map(s => `<a href="/urunler.html?category=${s.id}">${s.name}</a>`).join('')}
            </div>
          </li>`;
        } else {
          html += `<li><a href="/urunler.html?category=${root.id}">${root.name}</a></li>`;
        }
      });
      nav.innerHTML = html;
    } catch(e) {}
  }
};

// ===== MODAL HELPERS =====
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
  if (e.target.closest('.modal-close')) e.target.closest('.modal-overlay')?.classList.remove('open');
});

// ===== TABS =====
function initTabs(container) {
  const tabs = container.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); document.getElementById(t.dataset.tab)?.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab)?.classList.add('active');
    });
  });
}

// ===== PRICE RENDERER (labeled nakit/kart + taksit popup) =====
const PriceRenderer = {
  render(cash, card, opts = {}) {
    if (cash == null) return `<div class="price-on-request">💰 Fiyat Sorunuz</div>`;
    const isDealer = opts.isDealer || false;
    const cashLabel = isDealer ? 'Bayi Nakit' : 'Nakit Fiyatı';
    const cardLabel = isDealer ? 'Bayi K.Kartı' : 'Kredi Kartı Tek Çekim';
    const cashCls = isDealer ? 'price-value-dealer' : 'price-value-cash';
    const tagCls = isDealer ? 'price-label-dealer' : 'price-label-cash';
    
    return `
      <div class="price-block">
        <div class="price-row-item mb-1">
          <span class="price-label-tag ${tagCls}">${cashLabel}</span>
          <span class="${cashCls}">${Format.price(cash)}</span>
        </div>
        ${card && card !== cash ? `
        <div class="price-row-item">
          <span class="price-label-tag price-label-card">${cardLabel}</span>
          <span class="price-value-card">${Format.price(card)}</span>
        </div>` : ''}
        <button class="btn btn-ghost btn-sm mt-3" style="padding:4px 8px;font-size:12px" onclick="openTaksitModal(${card||cash}, '${opts.productName?opts.productName.replace(/'/g,"\\'"):''}')">
          💳 Taksit Seçenekleri →
        </button>
      </div>`;
  }
};

window.openTaksitModal = function(basePrice, productName) {
  let modal = document.getElementById('global-taksit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'global-taksit-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header"><h3 class="modal-title" style="font-size:16px">💳 Taksit Seçenekleri</h3><button class="modal-close">✕</button></div>
        <div class="modal-body" style="padding:0">
          <div style="padding:var(--space-4);background:var(--c-bg);font-weight:600;font-size:14px;border-bottom:1px solid var(--c-border)" id="taksit-product-name"></div>
          <div style="padding:var(--space-4)" id="taksit-modal-content"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  
  document.getElementById('taksit-product-name').textContent = productName || 'Taksit Tablosu';
  document.getElementById('taksit-product-name').style.display = productName ? 'block' : 'none';
  
  const instRows = [1,3,6,9,12].map(n => {
    const monthly = basePrice / n;
    return `
      <div style="display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid var(--c-border);${n===1?'background:var(--c-primary-light);font-weight:700':''}">
        <span>${n===1?'Tek Çekim':n+' Taksit'}</span>
        <div style="text-align:right">
          <div style="${n!==1?'font-weight:600;color:var(--c-primary)':''}">${n===1?Format.price(basePrice):Format.price(monthly)+'/ay'}</div>
          ${n!==1?`<div style="font-size:11px;color:var(--c-text-muted)">Toplam: ${Format.price(basePrice)}</div>`:''}
        </div>
      </div>`;
  }).join('');
  
  document.getElementById('taksit-modal-content').innerHTML = `
    <div style="border:1px solid var(--c-border);border-radius:var(--r-md);overflow:hidden">
      ${instRows}
    </div>
    <div style="margin-top:var(--space-4);text-align:center">
      <button class="btn btn-outline btn-full modal-close">Kapat</button>
    </div>
  `;
  openModal('global-taksit-modal');
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  SiteSettings.load();
  Cart.updateBadge();
  Notifications.load();
  CategoryMenu.render();

  // (Employee allowed to view shop pages for quote prep)

  // Dealer mode banner
  if (Auth.isDealer()) {
    const banner = document.getElementById('dealer-mode-bar');
    if (banner) {
      banner.classList.add('active');
      const u = Auth.getUser();
      banner.innerHTML = `🏢 <strong>${u.company_name || u.name}</strong> olarak giriş yapıldı &nbsp;—&nbsp; <strong style="color:#4ade80">✓ Bayi Modu Aktif</strong> &nbsp;|&nbsp; <span style="font-size:12px;opacity:0.85"İskontolu fiyatlar geçerlidir</span> &nbsp;|&nbsp; <a href="/bayi.html" style="color:#fbbf24;font-weight:700">Bayi Paneli →</a>`;
    }
  }

  // Update nav auth state
  const user = Auth.getUser();
  const navAuthArea = document.getElementById('nav-auth-area');
  if (navAuthArea) {
    if (user) {
      const isStaff = Auth.isAdmin() || Auth.isEmployee();
      navAuthArea.innerHTML = `
        <div style="position:relative;display:inline-block">
          <button class="nav-btn" onclick="document.getElementById('user-dropdown').classList.toggle('open'); event.stopPropagation();" style="gap:8px">
            <span style="font-size:18px">${isStaff ? '⚙️' : Auth.isDealer() ? '🏢' : '👤'}</span>
            <span class="desktop-only">${user.name.split(' ')[0]}</span>
            <span style="font-size:10px">▼</span>
            <span class="notif-count cart-badge" style="display:none">0</span>
          </button>
          <div class="user-dropdown" id="user-dropdown">
            <div style="padding:12px 16px;border-bottom:1px solid var(--c-border)">
              <p style="font-weight:600;font-size:14px">${user.name}</p>
              <p style="font-size:12px;color:var(--c-text-muted)">${user.email}</p>
              ${{admin:'<span class="badge badge-red" style="margin-top:4px">Admin</span>',employee:'<span class="badge badge-blue" style="margin-top:4px">Çalışan</span>',dealer:'<span class="badge badge-yellow" style="margin-top:4px">Bayi</span>'}[user.role]||''}
            </div>
            ${Auth.isAdmin() || Auth.isEmployee() ? `<a class="dropdown-item" href="/admin.html">⚙️ Yönetim Paneli</a>` : ''}
            ${user.role === 'dealer' ? `<a class="dropdown-item" href="/bayi.html">🏢 Bayi Paneli</a>` : ''}
            ${!isStaff ? `<a class="dropdown-item" href="/hesabim.html">👤 Hesabım</a>` : ''}
            ${!isStaff ? `<a class="dropdown-item" href="/hesabim.html#siparisler">📦 Siparişlerim</a>` : ''}
            <button class="dropdown-item" onclick="Auth.logout()" style="color:var(--c-error)">🚪 Çıkış Yap</button>
          </div>
        </div>`;
      Notifications.load();
    } else {
      navAuthArea.innerHTML = `
        <a href="/giris.html" class="nav-btn">Giriş Yap</a>
        <a href="/giris.html?mode=dealer" class="nav-btn nav-btn-primary" style="background:linear-gradient(135deg,#f59e0b,#d97706)">🏢 Bayi Girişi</a>`;
    }
  }

  // Dropdown close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#user-dropdown') && !e.target.closest('[onclick*="user-dropdown"]')) {
      document.getElementById('user-dropdown')?.classList.remove('open');
    }
  });
});
