/* Hora Bela — núcleo do front-end: API, ícones, modais, roteador */
(function () {
  'use strict';
  const App = (window.App = { me: null, cfg: { siteName: 'Hora Bela', plans: [], registrationOpen: true }, acts: {}, views: {} });

  App.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = App.esc;
  App.$ = (sel, root) => (root || document).querySelector(sel);
  App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- API ---------- */
  App.api = async (method, url, body) => {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body === undefined ? {} : body); }
    let r;
    try { r = await fetch(url, opt); } catch (_) { const e = new Error('Sem conexão. Verifique sua internet e tente de novo.'); e.status = 0; throw e; }
    let data = null;
    try { data = await r.json(); } catch (_) { /* ignore */ }
    if (r.status === 402 && App.me && App.me.user && App.me.access) { App.me.access.expired = true; setTimeout(() => App.route(), 0); }
    if (!r.ok) { const e = new Error((data && data.error) || 'Algo deu errado.'); e.status = r.status; e.field = data && data.field; throw e; }
    return data;
  };
  App.get = (u) => App.api('GET', u);
  App.post = (u, b) => App.api('POST', u, b);
  App.put = (u, b) => App.api('PUT', u, b);
  App.patch = (u, b) => App.api('PATCH', u, b);
  App.del = (u) => App.api('DELETE', u);

  /* ---------- Ícones (traço fino, estilo minimalista) ---------- */
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    page: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M4 12.5 9.5 18 20 6.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    whatsapp: '<path d="M3.5 20.5 5 15.8A8.5 8.5 0 1 1 8.4 19z"/><path d="M9 8.8c.2 2.8 2.6 5.5 5.9 6.2l1.2-1.4-2.1-1-.9.8c-1-.4-1.9-1.3-2.3-2.3l.8-.9-1-2.1z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-4.5L6 20"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9"/>',
    left: '<path d="m14.5 5-7 7 7 7"/>', right: '<path d="m9.5 5 7 7-7 7"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    heart: '<path d="M12 20.5S3.5 15 3.5 9A4.7 4.7 0 0 1 12 6.8 4.7 4.7 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    external: '<path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-8"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    smartphone: '<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M11 18h2"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4 3.7-6 8-6s7.3 2 8 6"/>',
  };
  App.icon = (n, cls) => '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
  const ic = App.icon;

  App.logo = (href) => '<a class="logo" href="' + (href || '/') + '" data-link><span class="logo-mark">' + ic('clock') + '</span>' + esc(App.cfg.siteName) + '</a>';

  /* ---------- Toasts e modais ---------- */
  App.toast = (msg, bad) => {
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    App.$('#toasts').appendChild(el);
    setTimeout(() => el.remove(), bad ? 5200 : 3200);
  };
  App.modal = (html, opts = {}) => {
    const layer = App.$('#layer');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = '<div class="sheet ' + (opts.cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    layer.appendChild(scrim);
    document.body.style.overflow = 'hidden';
    const close = (val) => { scrim.remove(); if (!App.$('#layer .scrim')) document.body.style.overflow = ''; if (opts.onClose) opts.onClose(val); };
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim && !opts.persistent) close(); });
    scrim.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close()));
    scrim.close = close;
    const first = scrim.querySelector('[autofocus]') || scrim.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select');
    if (first && !opts.noFocus && matchMedia('(min-width:700px)').matches) first.focus();
    return scrim;
  };
  App.closeModals = () => { App.$$('#layer .scrim').forEach((s) => s.remove()); document.body.style.overflow = ''; };
  App.confirm = (title, text, okLabel, danger) => new Promise((resolve) => {
    let done = false;
    const m = App.modal('<h3>' + esc(title) + '</h3><p class="muted" style="margin:6px 0 20px">' + esc(text || '') + '</p><div class="row" style="justify-content:flex-end"><button class="btn btn-line" data-close>Voltar</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(okLabel || 'Confirmar') + '</button></div>', { onClose: () => { if (!done) resolve(false); } });
    m.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
  App.sheetHead = (title, sub) => '<div class="sheet-head"><div><h3>' + esc(title) + '</h3>' + (sub ? '<p class="muted small">' + esc(sub) + '</p>' : '') + '</div><button class="x" data-close aria-label="Fechar">' + ic('x') + '</button></div>';

  /* ---------- Ações delegadas (sem handlers inline) ---------- */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (link && !e.metaKey && !e.ctrlKey && link.target !== '_blank') { e.preventDefault(); App.go(link.getAttribute('href')); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = App.acts[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  /* ---------- Utilidades de formulário ---------- */
  App.busy = async (btn, fn) => {
    if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span>'; }
    try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } }
  };
  App.showErr = (form, err) => {
    App.$$('.errmsg', form).forEach((n) => { n.textContent = ''; });
    App.$$('.input.err', form).forEach((n) => n.classList.remove('err'));
    if (!err) return;
    const f = err.field && App.$('[name="' + err.field + '"]', form);
    const slot = f && f.closest('.field') && App.$('.errmsg', f.closest('.field'));
    if (f && slot) { slot.textContent = err.message; f.classList.add('err'); f.focus(); return; }
    const g = App.$('.form-err', form);
    if (g) g.textContent = err.message; else App.toast(err.message, true);
  };
  App.fval = (form, name) => { const el = form.elements[name]; return el ? el.value : ''; };
  App.fmtPhoneInput = (el) => {
    let d = el.value.replace(/\D/g, '').slice(0, 11);
    let out = d;
    if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length > 10 ? 7 : 6) + (d.length > (d.length > 10 ? 7 : 6) ? '-' + d.slice(d.length > 10 ? 7 : 6) : '');
    el.value = out;
  };
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('[data-mask=phone]')) App.fmtPhoneInput(e.target); });

  App.field = (o) => {
    const id = 'f_' + o.name;
    const common = ' id="' + id + '" name="' + o.name + '" class="input"' + (o.required ? ' required' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.mask ? ' data-mask="' + o.mask + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '');
    let control;
    if (o.type === 'textarea') control = '<textarea' + common + (o.rows ? ' rows="' + o.rows + '"' : '') + '>' + esc(o.value || '') + '</textarea>';
    else if (o.type === 'select') control = '<select' + common + '>' + o.options.map((x) => '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(o.value) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select>';
    else control = '<input type="' + (o.type || 'text') + '"' + common + ' value="' + esc(o.value == null ? '' : o.value) + '">';
    if (o.prefix) control = '<div class="input-group"><span class="pre">' + esc(o.prefix) + '</span>' + control + '</div>';
    return '<div class="field"><label for="' + id + '">' + esc(o.label) + '</label>' + control + (o.hint ? '<span class="hint">' + esc(o.hint) + '</span>' : '') + '<span class="errmsg"></span></div>';
  };

  /* ---------- Imagens ---------- */
  App.pickImage = (maxPx = 1200) => new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return resolve(null);
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { App.toast('Use uma imagem JPG, PNG ou WebP.', true); return resolve(null); }
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { App.toast('Não foi possível ler essa imagem.', true); resolve(null); };
      img.src = url;
    };
    inp.click();
  });
  App.uploadImage = async (maxPx) => {
    const data = await App.pickImage(maxPx);
    if (!data) return null;
    return (await App.post('/api/upload', { dataUrl: data })).url;
  };

  /* ---------- Links e textos ---------- */
  App.baseUrl = () => App.cfg.baseUrl || location.origin;
  App.pageUrl = (slug) => App.baseUrl() + '/' + slug;
  App.copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); }
    catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (__) { /* ignore */ } t.remove(); }
    App.toast(msg || 'Copiado!');
  };
  App.waTo = (phone, text) => 'https://wa.me/55' + phone + '?text=' + encodeURIComponent(text);

  /* ---------- Editor de horários ---------- */
  App.hoursEditor = (hours) => '<div class="hours" id="hours-ed">' + [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const h = hours[i];
    return '<div class="hrow' + (h.open ? '' : ' off') + '" data-day="' + i + '"><label class="dayname"><span class="switch"><input type="checkbox" data-open ' + (h.open ? 'checked' : '') + '><i></i></span>' + HB.WEEKDAYS[i] + '</label>' +
      '<div class="times"><input type="time" data-start value="' + h.start + '" aria-label="Início"> <span class="muted small">às</span> <input type="time" data-end value="' + h.end + '" aria-label="Término">' +
      ' <span class="muted small" style="margin-left:6px">pausa</span> <input type="time" data-bs value="' + (h.breakStart || '') + '" aria-label="Início da pausa"> <span class="muted small">–</span> <input type="time" data-be value="' + (h.breakEnd || '') + '" aria-label="Fim da pausa"></div></div>';
  }).join('') + '</div>';
  App.readHours = (root) => {
    const out = {};
    App.$$('.hrow', root).forEach((r) => {
      out[r.dataset.day] = { open: App.$('[data-open]', r).checked, start: App.$('[data-start]', r).value || '09:00', end: App.$('[data-end]', r).value || '18:00', breakStart: App.$('[data-bs]', r).value, breakEnd: App.$('[data-be]', r).value };
      if (!out[r.dataset.day].breakStart || !out[r.dataset.day].breakEnd) { out[r.dataset.day].breakStart = ''; out[r.dataset.day].breakEnd = ''; }
    });
    return out;
  };
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('.hrow [data-open]')) e.target.closest('.hrow').classList.toggle('off', !e.target.checked); });

  /* ---------- Roteador ---------- */
  App.mount = (html) => { App.$('#app').innerHTML = html; window.scrollTo(0, 0); };
  App.go = (path, replace) => {
    if (path === location.pathname + location.search) return App.route();
    history[replace ? 'replaceState' : 'pushState']({}, '', path);
    App.route();
  };
  window.addEventListener('popstate', () => App.route());

  App.loadMe = async () => {
    try { App.me = await App.get('/api/me'); } catch (_) { App.me = { user: null }; }
    return App.me;
  };
  App.logout = async () => { try { await App.post('/api/auth/logout'); } catch (_) { /* ignore */ } App.me = { user: null }; App.go('/'); };
})();
