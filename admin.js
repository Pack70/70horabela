/* Painel administrativo do proprietário da plataforma */
(function () {
  const App = window.App, esc = App.esc, ic = App.icon, $ = App.$;
  const TABS = [['', 'Resumo', 'chart'], ['contas', 'Contas', 'users'], ['planos', 'Planos', 'star'], ['logs', 'Registros de erros', 'alert'], ['sistema', 'Sistema', 'settings']];
  const S = { tab: '' };
  const fmtDT = (ms) => ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const sections = {};

  App.views.admin = async (tab) => {
    const u = App.me.user;
    if (!u) return App.go('/entrar', true);
    if (u.role !== 'admin') return App.go('/painel', true);
    tab = tab || ''; if (!sections[tab]) return App.go('/admin', true);
    S.tab = tab;
    App.mount('<div class="shell"><aside class="side">' + App.logo('/admin') + '<span class="chip ink" style="justify-self:start">Administrador</span><nav style="display:grid;gap:4px">' + TABS.map(([k, l, i]) => '<a class="nav-i' + (tab === k ? ' on' : '') + '" href="/admin' + (k ? '/' + k : '') + '" data-link>' + ic(i) + l + '</a>').join('') + '</nav><div style="margin-top:auto"><button class="btn btn-ghost btn-block btn-sm" data-act="logout">' + ic('logout') + ' Sair</button></div></aside>' +
      '<div style="min-width:0"><div class="topbar">' + App.logo('/admin') + '<button class="btn btn-ghost btn-sm" data-act="logout">Sair</button></div><div class="tabs" style="padding:12px 16px 0" id="atabs">' + TABS.map(([k, l]) => '<a class="tab' + (tab === k ? ' on' : '') + '" href="/admin' + (k ? '/' + k : '') + '" data-link>' + l + '</a>').join('') + '</div><main class="main" id="main"><div style="padding:60px;text-align:center"><span class="spinner"></span></div></main></div></div>');
    const st = document.createElement('style'); st.textContent = '@media(min-width:901px){#atabs{display:none!important}}'; document.head.appendChild(st);
    try { await sections[tab]($('#main')); } catch (e) { $('#main').innerHTML = '<div class="empty"><h3>Erro</h3><p>' + esc(e.message) + '</p></div>'; }
  };
  const refresh = () => sections[S.tab]($('#main'));

  sections[''] = async (m) => {
    const s = await App.get('/api/admin/stats');
    const tile = (n, l, hot) => '<div class="stat' + (hot ? ' hot' : '') + '"><b>' + n + '</b><span>' + l + '</span></div>';
    m.innerHTML = '<div class="page-h"><h1>Resumo da plataforma</h1></div><div class="stack-lg"><div class="stats">' + tile(s.professionals, 'Profissionais cadastradas') + tile(s.published, 'Páginas publicadas') + tile(s.newLast30, 'Novas nos últimos 30 dias') + tile(s.bookingsMonth, 'Solicitações neste mês') + '</div>' +
      '<div class="stats">' + tile(s.active, 'Contas ativas') + tile(s.suspended, 'Contas suspensas') + tile(s.bookingsTotal, 'Solicitações no total') + tile(s.errors24h, 'Erros nas últimas 24h', s.errors24h > 0) + '</div>' +
      '<div class="card stack"><h3>Assinantes por plano</h3>' + (s.byPlan.length ? s.byPlan.map((p) => '<div class="row between"><span>' + esc(p.plan_id) + '</span><b>' + p.n + '</b></div>').join('') : '<p class="muted">Sem assinaturas.</p>') + '</div>' +
      '<p class="muted small">Por privacidade, o painel administrativo mostra apenas métricas agregadas. Agendas e dados de clientes de cada profissional não são acessíveis aqui.</p></div>';
  };

  sections.contas = async (m) => {
    const [{ items }, { items: plans }] = await Promise.all([App.get('/api/admin/users?q=' + encodeURIComponent(S.q || '')), App.get('/api/admin/plans')]);
    m.innerHTML = '<div class="page-h"><div><h1>Contas</h1><p class="muted">' + items.length + ' profissional(is)</p></div></div><input class="input" id="aq" placeholder="Buscar por nome, e-mail ou link" value="' + esc(S.q || '') + '" style="margin-bottom:14px"><div class="card tbl-scroll" style="padding:6px"><table class="tbl"><thead><tr><th>Profissional</th><th>Link</th><th>Plano</th><th>Uso</th><th>Cadastro</th><th>Status</th><th></th></tr></thead><tbody>' +
      items.map((u) => '<tr><td><b>' + esc(u.name || '—') + '</b><br><span class="muted tiny">' + esc(u.email) + '</span></td><td>' + (u.slug ? '<a href="/' + esc(u.slug) + '" target="_blank" rel="noopener">/' + esc(u.slug) + '</a>' : '<span class="muted tiny">não configurado</span>') + '</td>' +
        '<td><select class="input" style="min-height:38px;padding:6px 10px" data-act="u-plan" data-id="' + u.id + '">' + plans.map((p) => '<option value="' + p.id + '"' + (p.id === u.plan_id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></td><td class="small">' + u.services + ' serv. · ' + u.bookings + ' solic.</td><td class="small">' + fmtDT(u.created_at) + '</td>' +
        '<td><span class="chip ' + (u.status === 'active' ? 'ok' : 'bad') + '">' + (u.status === 'active' ? 'Ativa' : 'Suspensa') + '</span></td><td><button class="btn btn-sm ' + (u.status === 'active' ? 'btn-danger' : 'btn-line') + '" data-act="u-status" data-id="' + u.id + '" data-to="' + (u.status === 'active' ? 'suspended' : 'active') + '">' + (u.status === 'active' ? 'Suspender' : 'Reativar') + '</button></td></tr>').join('') +
      (items.length ? '' : '<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">Nenhuma conta encontrada.</td></tr>') + '</tbody></table></div>';
    let t; $('#aq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(async () => { S.q = e.target.value; await refresh(); const i = $('#aq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); });
  };
  App.acts['u-status'] = async (el) => {
    const to = el.dataset.to;
    if (to === 'suspended' && !(await App.confirm('Suspender esta conta?', 'A profissional perde o acesso e a página pública sai do ar até a reativação.', 'Suspender', true))) return;
    try { await App.patch('/api/admin/users/' + el.dataset.id, { status: to }); App.toast(to === 'active' ? 'Conta reativada.' : 'Conta suspensa.'); refresh(); } catch (e) { App.toast(e.message, true); }
  };
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!t.matches || !t.matches('[data-act=u-plan]')) return;
    try { await App.patch('/api/admin/users/' + t.dataset.id, { planId: t.value }); App.toast('Plano atualizado.'); } catch (er) { App.toast(er.message, true); refresh(); }
  });

  sections.planos = async (m) => {
    const { items } = await App.get('/api/admin/plans');
    const lim = (v) => (v == null ? '' : v);
    m.innerHTML = '<div class="page-h"><div><h1>Planos e preços</h1><p class="muted">Campos de limite vazios significam “ilimitado”. A cobrança recorrente poderá ser ligada no futuro sem mudar essa estrutura.</p></div></div><div class="stack-lg">' +
      items.map((p) => '<form class="card stack plan-form" data-id="' + p.id + '"><div class="row between"><h3>' + esc(p.id) + '</h3>' + (p.id === 'free' ? '<span class="chip mute">Sempre ativo</span>' : '<label class="row small"><span class="switch"><input type="checkbox" name="active" ' + (p.active ? 'checked' : '') + '><i></i></span> Visível no site</label>') + '</div>' +
        '<div class="grid2">' + App.field({ name: 'name', label: 'Nome', value: p.name, max: 40 }) + App.field({ name: 'price', label: 'Preço mensal (R$)', value: HB.priceInput(p.priceCents), inputmode: 'decimal' }) + '</div>' +
        App.field({ name: 'tagline', label: 'Frase curta', value: p.tagline, max: 120 }) + '<div class="grid2">' + App.field({ name: 'services', label: 'Máx. de serviços', value: lim(p.limits.services), inputmode: 'numeric', ph: 'ilimitado' }) + App.field({ name: 'bookingsPerMonth', label: 'Máx. de solicitações por mês', value: lim(p.limits.bookingsPerMonth), inputmode: 'numeric', ph: 'ilimitado' }) + App.field({ name: 'gallery', label: 'Fotos na galeria', value: lim(p.limits.gallery), inputmode: 'numeric', ph: 'ilimitado' }) + '</div>' +
        '<div class="row wrap-row" style="gap:22px"><label class="row small"><span class="switch"><input type="checkbox" name="customColor" ' + (p.limits.customColor ? 'checked' : '') + '><i></i></span> Cor personalizada</label><label class="row small"><span class="switch"><input type="checkbox" name="hideBrand" ' + (p.limits.hideBrand ? 'checked' : '') + '><i></i></span> Ocultar marca na página</label><label class="row small"><span class="switch"><input type="checkbox" name="highlight" ' + (p.highlight ? 'checked' : '') + '><i></i></span> Destacar na landing</label></div>' +
        App.field({ name: 'features', label: 'Benefícios (um por linha)', type: 'textarea', value: p.features.join('\n'), rows: 5 }) + '<div class="errmsg form-err"></div><div><button class="btn btn-primary" type="submit">Salvar plano</button></div></form>').join('') + '</div>';
    App.$$('.plan-form').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      const cents = HB.parsePrice(f.price.value);
      if (cents === null) return App.showErr(f, Object.assign(new Error('Preço inválido.'), { field: 'price' }));
      const n = (v) => (String(v).trim() === '' ? null : Number(v));
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try { await App.put('/api/admin/plans/' + f.dataset.id, { name: f.name.value, priceCents: cents, tagline: f.tagline.value, active: f.active ? f.active.checked : true, highlight: f.highlight.checked, features: f.features.value.split('\n'), limits: { services: n(f.services.value), bookingsPerMonth: n(f.bookingsPerMonth.value), gallery: n(f.gallery.value), customColor: f.customColor.checked, hideBrand: f.hideBrand.checked } }); App.toast('Plano salvo.'); }
        catch (err) { App.showErr(f, err); }
      });
    }));
  };

  sections.logs = async (m) => {
    const { items } = await App.get('/api/admin/logs');
    m.innerHTML = '<div class="page-h"><div><h1>Registros técnicos de erros</h1><p class="muted">Últimos 100 erros do servidor.</p></div>' + (items.length ? '<button class="btn btn-line" data-act="logs-clear">Limpar</button>' : '') + '</div>' +
      (items.length ? '<div class="list">' + items.map((l) => '<details class="card flat"><summary style="cursor:pointer"><b>' + esc(l.message) + '</b><br><span class="muted tiny">' + fmtDT(l.at) + ' · ' + esc(l.route) + '</span></summary><pre style="overflow:auto;font-size:.75rem;margin:10px 0 0;white-space:pre-wrap">' + esc(l.stack) + '</pre></details>').join('') + '</div>' : '<div class="empty"><h3>Nenhum erro registrado 🎉</h3></div>');
  };
  App.acts['logs-clear'] = async () => { await App.del('/api/admin/logs'); refresh(); };

  sections.sistema = async (m) => {
    const s = await App.get('/api/admin/settings');
    m.innerHTML = '<div class="page-h"><h1>Configuração geral</h1></div><form class="card stack" id="f-sys">' +
      App.field({ name: 'siteName', label: 'Nome da plataforma', value: s.siteName, max: 40 }) +
      App.field({ name: 'baseUrl', label: 'Endereço público (domínio próprio)', value: s.baseUrl, ph: 'https://horabela.com.br', hint: 'Usado nos links compartilhados e nas prévias do Instagram/WhatsApp. Deixe vazio para usar o endereço atual.' }) +
      App.field({ name: 'supportWhatsapp', label: 'WhatsApp do suporte', value: s.supportWhatsapp, max: 20 }) +
      '<label class="row"><span class="switch"><input type="checkbox" name="registrationOpen" ' + (s.registrationOpen === '1' ? 'checked' : '') + '><i></i></span> Aceitar novos cadastros</label><div class="errmsg form-err"></div><div><button class="btn btn-primary" type="submit">Salvar configurações</button></div></form>';
    const f = $('#f-sys');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try { await App.put('/api/admin/settings', { siteName: f.siteName.value, baseUrl: f.baseUrl.value, supportWhatsapp: f.supportWhatsapp.value, registrationOpen: f.registrationOpen.checked }); App.cfg.siteName = f.siteName.value; App.toast('Configurações salvas.'); }
        catch (err) { App.showErr(f, err); }
      });
    });
  };
})();
