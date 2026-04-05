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
  stockBadge: (status, supplyDays) => {
    const map = {
      in_stock: ['in-stock', '✓ Stokta'],
      out_of_stock: supplyDays ? ['on-request', `⏱ Tedarik: ${supplyDays} Gün`] : ['out-stock', '✗ Stok Yok'],
      on_request: ['on-request', `⏱ Tedarik: ${supplyDays || 0} Gün - Teklif İsteyiniz`],
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
        document.querySelectorAll('.whatsapp-link').forEach(el => { el.href = `https://wa.me/${s.whatsapp_number.replace(/\D/g,'')}`; });
      }
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

// ===== PRICE RENDERER (labeled nakit/kart + taksit) =====
const PriceRenderer = {
  // rates: { cash, card } — card can equal cash for non-dealer
  // installmentBase: price used for taksit calculation
  render(cash, card, opts = {}) {
    if (cash == null) return `<div class="price-on-request">💰 Fiyat Sorunuz</div>`;
    const isDealer = opts.isDealer || false;
    const cashLabel = isDealer ? 'Bayi Nakit' : 'Nakit Fiyatı';
    const cardLabel = isDealer ? 'Bayi K.Kartı' : 'Kredi Kartı Tek Çekim';
    const cashCls = isDealer ? 'price-value-dealer' : 'price-value-cash';
    const tagCls = isDealer ? 'price-label-dealer' : 'price-label-cash';
    const id = 'inst-' + Math.random().toString(36).slice(2,7);
    const instRows = [3,6,9,12].map(n => {
      const monthly = (card||cash) / n;
      return `<div class="installment-row"><span>${n} Taksit</span><strong>${Format.price(monthly)}/ay</strong><span style="font-size:11px;color:var(--c-text-muted)">(Toplam: ${Format.price((card||cash))})</span></div>`;
    }).join('');
    return `
      <div class="price-block">
        <div class="price-row-item">
          <span class="price-label-tag ${tagCls}">${cashLabel}</span>
          <span class="${cashCls}">${Format.price(cash)}</span>
        </div>
        ${card && card !== cash ? `
        <div class="price-row-item">
          <span class="price-label-tag price-label-card">${cardLabel}</span>
          <span class="price-value-card">${Format.price(card)}</span>
        </div>` : ''}
        <button class="installment-toggle" onclick="document.getElementById('${id}').classList.toggle('open'); this.querySelector('.inst-arrow').textContent=document.getElementById('${id}').classList.contains('open')?'▲':'▼'">
          💳 Taksit Seçenekleri <span class="inst-arrow">▼</span>
        </button>
        <div class="installment-table" id="${id}">
          <div class="installment-row" style="background:var(--c-primary-light);font-weight:700">
            <span>Tek Çekim</span><strong>${Format.price(card||cash)}</strong><span></span>
          </div>
          ${instRows}
        </div>
      </div>`;
  }
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  SiteSettings.load();
  Cart.updateBadge();
  Notifications.load();

  // Employee redirect: send employee to admin panel on shopping pages
  if (Auth.isEmployee()) {
    const path = window.location.pathname;
    const shopPages = ['/', '/index.html', '/urunler.html', '/sepet.html', '/hesabim.html', '/teklif.html', '/araclar.html'];
    if (shopPages.includes(path)) { window.location.href = '/admin.html'; return; }
  }

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
