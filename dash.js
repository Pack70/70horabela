/* Painel da profissional */
(function () {
  const App = window.App, esc = App.esc, ic = App.icon, $ = App.$;
  const NAV = [
    ['', 'Início', 'home'], ['agenda', 'Minha agenda', 'calendar'], ['agendamentos', 'Agendamentos', 'list'], ['servicos', 'Meus serviços', 'scissors'],
    ['pagina', 'Minha página', 'page'], ['disponibilidade', 'Minha disponibilidade', 'clock'], ['clientes', 'Minhas clientes', 'users'], ['link', 'Meu link', 'link'], ['configuracoes', 'Configurações', 'settings'],
  ];
  const state = { section: '', param: '', pending: 0, bk: {}, cal: { view: 'day', date: null } };
  const today = () => HB.dstr(new Date());
  const dayLabel = (d) => { const t = today(); if (d === t) return 'Hoje'; if (d === HB.addDays(t, 1)) return 'Amanhã'; return HB.WEEKDAYS_SHORT[HB.weekday(d)] + ', ' + HB.dateBR(d).slice(0, 5); };
  const statusChip = (b) => b.expired ? '<span class="chip mute">Reserva expirada</span>' : '<span class="chip ' + HB.STATUS[b.status].tone + '">' + HB.STATUS[b.status].label + '</span>';
  const prof = () => App.me.profile;

  /* ---------- Cartão de agendamento ---------- */
  const bkCard = (b, o = {}) => {
    state.bk[b.id] = b;
    const acts = [];
    const open = b.status === 'pending' || b.status === 'confirmed' || b.status === 'rescheduled';
    if (b.status === 'pending') acts.push('<button class="btn btn-primary btn-sm" data-act="bk-confirm" data-id="' + b.id + '">' + ic('check') + ' Confirmar</button>');
    if (b.status === 'confirmed' || b.status === 'rescheduled') acts.push('<button class="btn btn-primary btn-sm" data-act="bk-complete" data-id="' + b.id + '">' + ic('check') + ' Concluir</button>');
    if (open) acts.push('<button class="btn btn-line btn-sm" data-act="bk-resched" data-id="' + b.id + '">Remarcar</button>');
    if (open) acts.push('<button class="btn btn-danger btn-sm" data-act="bk-cancel" data-id="' + b.id + '">' + (b.status === 'pending' ? 'Recusar' : 'Cancelar') + '</button>');
    if (b.status === 'cancelled') acts.push('<button class="btn btn-line btn-sm" data-act="bk-reopen" data-id="' + b.id + '">Reabrir como pendente</button>');
    acts.push('<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' + App.waTo(b.clientPhone ? '' + b.clientPhone : '', 'Olá, ' + HB.firstName(b.clientName) + '!') + '">' + ic('whatsapp') + ' WhatsApp</a>');
    return '<article class="bk' + (b.expired || b.status === 'cancelled' ? ' muted-card' : '') + '"><div class="bk-top"><div class="bk-time"><b>' + HB.timeLabel(b.time) + '</b><span>' + (o.noDate ? HB.durLabel(b.duration).replace(' minutos', ' min') : dayLabel(b.date)) + '</span></div>' +
      '<div class="bk-info"><b>' + esc(b.serviceName) + '</b><span class="muted small">' + esc(b.clientName) + ' · ' + esc(HB.fmtPhone(b.clientPhone)) + ' · ' + HB.brl(b.priceCents) + '</span>' +
      '<div style="margin-top:6px" class="row wrap-row">' + statusChip(b) + (b.source === 'manual' ? '<span class="chip mute">Manual</span>' : '') + '</div></div></div>' +
      (o.noActions ? '' : '<div class="bk-actions">' + acts.join('') + '</div>') + '</article>';
  };

  const notify = (b, kind) => {
    const fn = { confirmed: HB.confirmMessage, cancelled: HB.cancelMessage, rescheduled: HB.rescheduleMessage }[kind];
    if (!fn) return;
    const msg = fn({ clientName: b.clientName, serviceName: b.serviceName, date: b.date, time: b.time });
    const title = { confirmed: 'Horário confirmado!', cancelled: 'Agendamento cancelado', rescheduled: 'Horário remarcado' }[kind];
    App.modal(App.sheetHead(title, 'Avise ' + HB.firstName(b.clientName) + ' pelo WhatsApp.') + '<div class="bio-opt" style="margin-bottom:16px">' + esc(msg) + '</div><div class="row wrap-row"><a class="btn btn-wa" target="_blank" rel="noopener" href="' + App.waTo(b.clientPhone, msg) + '" data-close>' + ic('whatsapp') + ' Avisar no WhatsApp</a><button class="btn btn-line" data-close>Agora não</button></div>');
  };

  const setStatus = async (id, status, btn) => {
    await App.busy(btn, async () => {
      try {
        const r = await App.patch('/api/bookings/' + id + '/status', { status });
        App.toast({ confirmed: 'Agendamento confirmado.', cancelled: 'Agendamento cancelado.', completed: 'Atendimento concluído.', pending: 'Reaberto como pendente.' }[status]);
        App.closeModals(); await refresh();
        if (status === 'confirmed' || status === 'cancelled') notify(r.item, status);
      } catch (e) { App.toast(e.message, true); }
    });
  };
  App.acts['bk-confirm'] = (el) => setStatus(el.dataset.id, 'confirmed', el);
  App.acts['bk-complete'] = (el) => setStatus(el.dataset.id, 'completed', el);
  App.acts['bk-reopen'] = (el) => setStatus(el.dataset.id, 'pending', el);
  App.acts['bk-cancel'] = async (el) => {
    const b = state.bk[el.dataset.id];
    if (await App.confirm(b.status === 'pending' ? 'Recusar solicitação?' : 'Cancelar agendamento?', b.clientName + ' · ' + b.serviceName + ' · ' + HB.dateBR(b.date) + ' às ' + HB.timeLabel(b.time), b.status === 'pending' ? 'Recusar' : 'Cancelar agendamento', true)) setStatus(b.id, 'cancelled');
  };

  /* seletor de data + horários livres (usado em remarcar e agendamento manual) */
  const slotPicker = (root, { getDuration, exclude, onPick }) => {
    const dateEl = $('[name=date]', root), box = $('.slotbox', root);
    let picked = '';
    const load = async () => {
      picked = ''; onPick('');
      const dur = getDuration();
      if (!dateEl.value || !dur) { box.innerHTML = '<p class="muted small">Escolha o serviço e a data.</p>'; return; }
      box.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await App.get('/api/slots?date=' + dateEl.value + '&duration=' + dur + (exclude ? '&exclude=' + exclude : ''));
        box.innerHTML = r.slots.length ? '<div class="slots">' + r.slots.map((s) => '<button type="button" class="slot" data-t="' + s + '">' + s + '</button>').join('') + '</div>' : '<p class="muted small">Sem horários livres nesse dia.</p>';
      } catch (e) { box.innerHTML = '<p class="errmsg">' + esc(e.message) + '</p>'; }
    };
    dateEl.addEventListener('change', load);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.slot'); if (!b) return;
      App.$$('.slot', box).forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); picked = b.dataset.t; onPick(picked);
    });
    return { reload: load };
  };

  App.acts['bk-resched'] = (el) => {
    const b = state.bk[el.dataset.id]; let time = '';
    const m = App.modal(App.sheetHead('Remarcar horário', b.clientName + ' · ' + b.serviceName) +
      '<form class="stack" novalidate><div class="field"><label>Nova data</label><input class="input" type="date" name="date" min="' + today() + '" value="' + b.date + '"></div><div class="slotbox"></div><div class="errmsg form-err"></div><button class="btn btn-primary btn-block" type="submit" disabled>Remarcar</button></form>');
    const f = $('form', m), btn = $('button[type=submit]', f);
    const sp = slotPicker(f, { getDuration: () => b.duration, exclude: b.id, onPick: (t) => { time = t; btn.disabled = !t; } });
    sp.reload();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await App.busy(btn, async () => {
        try { const r = await App.post('/api/bookings/' + b.id + '/reschedule', { date: f.date.value, time }); m.close(); App.toast('Horário remarcado.'); await refresh(); notify(r.item, 'rescheduled'); }
        catch (err) { App.showErr(f, err); }
      });
    });
  };

  const manualBooking = async (date) => {
    const { items } = await App.get('/api/services');
    const act = items.filter((s) => s.active);
    if (!act.length) { App.toast('Cadastre um serviço antes de agendar.', true); return; }
    let time = '';
    const m = App.modal(App.sheetHead('Novo agendamento', 'Para clientes que agendaram por fora do link.') +
      '<form class="stack" novalidate>' + App.field({ name: 'serviceId', label: 'Serviço', type: 'select', options: act.map((s) => [s.id, s.name + ' · ' + HB.durLabel(s.duration) + ' · ' + HB.brl(s.priceCents)]) }) +
      '<div class="field"><label>Data</label><input class="input" type="date" name="date" min="' + today() + '" value="' + (date || today()) + '"></div><div class="slotbox"></div>' +
      '<div class="grid2">' + App.field({ name: 'name', label: 'Nome da cliente', max: 60 }) + App.field({ name: 'phone', label: 'Telefone com DDD', mask: 'phone', inputmode: 'tel' }) + '</div>' +
      '<div class="errmsg form-err"></div><button class="btn btn-primary btn-block" type="submit" disabled>Salvar agendamento</button></form>');
    const f = $('form', m), btn = $('button[type=submit]', f);
    const dur = () => (items.find((s) => s.id === f.serviceId.value) || {}).duration;
    const sp = slotPicker(f, { getDuration: dur, onPick: (t) => { time = t; btn.disabled = !t; } });
    f.serviceId.addEventListener('change', sp.reload); sp.reload();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(btn, async () => {
        try { await App.post('/api/bookings', { serviceId: f.serviceId.value, date: f.date.value, time, name: f.name.value, phone: f.phone.value }); m.close(); App.toast('Agendamento salvo.'); await refresh(); }
        catch (err) { App.showErr(f, err); }
      });
    });
  };
  App.acts['new-booking'] = (el) => manualBooking(el.dataset.date);

  /* ---------- Shell ---------- */
  const shell = () => {
    const p = prof();
    const items = NAV.map(([k, label, icon]) => '<a class="nav-i' + (state.section === k ? ' on' : '') + '" href="/painel' + (k ? '/' + k : '') + '" data-link>' + ic(icon) + label + (k === 'agendamentos' ? '<span class="count' + (state.pending ? '' : ' hide') + '" id="pcount">' + state.pending + '</span>' : '') + '</a>').join('');
    const bt = (k, label, icon) => '<a href="/painel' + (k ? '/' + k : '') + '" data-link class="' + (state.section === k ? 'on' : '') + '">' + ic(icon) + label + (k === 'agendamentos' && state.pending ? '<span class="dot">' + state.pending + '</span>' : '') + '</a>';
    App.mount('<div class="shell"><aside class="side">' + App.logo('/painel') + '<nav style="display:grid;gap:4px">' + items + '</nav><div style="margin-top:auto" class="stack">' +
      '<a class="btn btn-rose btn-block btn-sm" href="/' + esc(p.slug) + '" target="_blank" rel="noopener">' + ic('external') + ' Ver minha página</a><button class="btn btn-ghost btn-block btn-sm" data-act="logout">' + ic('logout') + ' Sair</button></div></aside>' +
      '<div style="min-width:0"><div class="topbar">' + App.logo('/painel') + '<a class="btn btn-rose btn-sm" href="/' + esc(p.slug) + '" target="_blank" rel="noopener">' + ic('external') + ' Minha página</a></div><main class="main" id="main"></main></div>' +
      '<nav class="bottom">' + bt('', 'Início', 'home') + bt('agenda', 'Agenda', 'calendar') + bt('agendamentos', 'Pedidos', 'list') + bt('servicos', 'Serviços', 'scissors') + bt('mais', 'Mais', 'more') + '</nav></div>');
  };
  App.acts.logout = () => App.logout();

  const payButtons = (p, big) => {
    const pv = App.cfg.providers || {}; const out = [];
    if (pv.mercadopago) out.push('<button class="btn ' + (big && p.highlight ? 'btn-primary' : big ? 'btn-primary' : 'btn-line') + ' ' + (big ? 'btn-block' : 'btn-sm') + '" ' + (big ? '' : 'style="justify-self:start" ') + 'data-act="subscribe" data-provider="mercadopago" data-plan="' + esc(p.id) + '">' + (big ? 'Assinar com Mercado Pago' : esc(p.name) + ' — ' + esc(HB.brl(p.priceCents)) + '/mês (Mercado Pago)') + '</button>');
    if ((pv.cakto || []).includes(p.id)) out.push('<button class="btn ' + (big && !pv.mercadopago ? 'btn-primary' : 'btn-line') + ' ' + (big ? 'btn-block' : 'btn-sm') + '" ' + (big ? '' : 'style="justify-self:start" ') + 'data-act="subscribe" data-provider="cakto" data-plan="' + esc(p.id) + '">' + (big ? 'Assinar com Cakto' : esc(p.name) + ' — ' + esc(HB.brl(p.priceCents)) + '/mês (Cakto)') + '</button>');
    return out.join('');
  };
  const planPayable = (p) => { const pv = App.cfg.providers || {}; return !!pv.mercadopago || (pv.cakto || []).includes(p.id); };
  const supportLink = (text) => App.cfg.supportWhatsapp && HB.normPhone(App.cfg.supportWhatsapp) ? App.waTo(HB.normPhone(App.cfg.supportWhatsapp), text) : '';
  const paywall = () => {
    const a = App.me.access; const u = App.me.user;
    const paid = App.cfg.plans.filter((p) => p.priceCents > 0);
    App.mount('<div class="wiz"><div class="wrap">' + App.logo('/') + '</div><div class="wiz-box" style="width:min(760px,100% - 32px)">' +
      '<span class="eyebrow">' + ic('lock') + ' ' + (a.trial ? 'Seu teste grátis terminou' : 'Seu período de acesso terminou') + '</span>' +
      '<h1 style="margin-top:14px">Assine para continuar recebendo agendamentos</h1>' +
      '<p class="muted" style="margin:8px 0 22px">Seus serviços, clientes e agenda continuam guardados. Sua página pública fica indisponível até a assinatura ser ativada.</p>' +
      '<div class="plans" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));max-width:none">' + paid.map((p) => {
        const href = supportLink('Olá! Quero assinar o plano ' + p.name + ' do ' + App.cfg.siteName + '. Meu e-mail: ' + u.email);
        return '<div class="plan' + (p.highlight ? ' hl' : '') + '"><div><h3>' + esc(p.name) + '</h3><p class="muted small">' + esc(p.tagline) + '</p></div><div class="price"><small>R$</small> ' + esc(HB.brl(p.priceCents).replace('R$ ', '')) + ' <small>/mês</small></div><ul>' + p.features.map((f) => '<li>' + ic('check') + '<span>' + esc(f) + '</span></li>').join('') + '</ul>' +
          (planPayable(p) ? payButtons(p, true) + '<p class="tiny muted" style="text-align:center">Pagamento seguro. Cobrança mensal automática, cancele quando quiser.</p>' : href ? '<a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="' + esc(href) + '">' + ic('whatsapp') + ' Assinar pelo WhatsApp</a>' : '<p class="small muted">Fale com o suporte para ativar este plano.</p>') + '</div>';
      }).join('') + '</div>' +
      '<p class="small muted" style="margin-top:18px">Logado como ' + esc(u.email) + '. Depois que o pagamento for confirmado, o acesso é liberado e você já pode entrar de novo.</p>' +
      '<div class="row" style="margin-top:14px"><button class="btn btn-line" data-act="logout">' + ic('logout') + ' Sair</button><button class="btn btn-ghost" data-act="paywall-retry">Já assinei, verificar de novo</button></div></div></div>');
  };
  App.acts['paywall-retry'] = async (el) => { await App.busy(el, async () => { try { if (App.cfg.billing) await App.post('/api/billing/sync', {}); } catch (e) { App.toast(e.message, true); } await App.loadMe(); App.route(); }); };
  App.acts.subscribe = (el) => App.busy(el, async () => {
    try { const r = await App.post('/api/billing/checkout', { planId: el.dataset.plan, provider: el.dataset.provider }); location.href = r.url; await new Promise(() => {}); }
    catch (e) { App.toast(e.message, true); }
  });
  App.acts['cancel-sub'] = async (el) => {
    if (!confirm('Cancelar a cobrança automática? Você continua com acesso até o fim do período já pago.')) return;
    await App.busy(el, async () => { try { await App.post('/api/billing/cancel', {}); App.toast('Assinatura cancelada.'); await App.loadMe(); refresh(); } catch (e) { App.toast(e.message, true); } });
  };

  const sections = {};
  const refresh = () => sections[state.section] ? sections[state.section]($('#main'), state.param) : null;
  App.refreshDash = refresh;
  const setPending = (n) => { state.pending = n; const c = $('#pcount'); if (c) { c.textContent = n; c.classList.toggle('hide', !n); } };

  App.views.dash = async (section, param) => {
    const u = App.me.user;
    if (!u) return App.go('/entrar', true);
    if (u.role !== 'pro') return App.go('/admin', true);
    if (!prof().onboarded) return App.go('/configurar', true);
    if (/[?&]assinatura=retorno/.test(location.search)) {
      history.replaceState(null, '', location.pathname);
      try { const r = await App.post('/api/billing/sync', {}); await App.loadMe(); App.toast(r.active ? 'Assinatura ativa! Obrigada.' : 'Pagamento em análise. Assim que for confirmado, o acesso é liberado.'); } catch (_) { /* segue */ }
    }
    if (App.me.access && App.me.access.expired) return paywall();
    if (section === undefined) section = '';
    if (section !== 'mais' && !sections[section]) return App.go('/painel', true);
    state.section = section; state.param = param;
    shell();
    App.get('/api/dashboard').then((d) => setPending(d.counts.pending)).catch(() => {});
    $('#main').innerHTML = '<div style="padding:60px;text-align:center"><span class="spinner"></span></div>';
    try { await (section === 'mais' ? sections.mais($('#main')) : sections[section]($('#main'), param)); }
    catch (e) { $('#main').innerHTML = '<div class="empty"><h3>Não foi possível carregar</h3><p>' + esc(e.message) + '</p><button class="btn btn-primary" style="margin-top:14px" data-act="reload">Tentar de novo</button></div>'; }
  };
  App.acts.reload = () => refresh();

  /* ---------- Início ---------- */
  sections[''] = async (m) => {
    const d = await App.get('/api/dashboard'); setPending(d.counts.pending);
    const p = prof(); const url = App.pageUrl(p.slug);
    const hour = new Date().getHours();
    const hi = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const sv = await App.get('/api/services');
    const ac = App.me.access;
    const trialBanner = ac && ac.trial && ac.daysLeft !== null ? '<div class="card flat" style="background:' + (ac.daysLeft <= 2 ? 'var(--warn-bg)' : 'var(--rose)') + ';border-color:var(--rose2)"><div class="row between wrap-row"><div><b>Teste grátis: ' + (ac.daysLeft === 0 ? 'termina hoje' : 'faltam ' + ac.daysLeft + ' dia' + (ac.daysLeft === 1 ? '' : 's')) + '</b><p class="small" style="margin-top:2px">Depois disso é preciso assinar um plano para continuar recebendo agendamentos.</p></div><a class="btn btn-primary btn-sm" href="/painel/configuracoes" data-link>Ver planos</a></div></div>' : '';
    m.innerHTML = '<div class="page-h"><div><p class="muted">' + HB.WEEKDAYS[new Date().getDay()] + ', ' + HB.dateBR(today()).slice(0, 5) + '</p><h1>' + hi + ', ' + esc(HB.firstName(p.name)) + ' 💗</h1></div><button class="btn btn-primary" data-act="new-booking">' + ic('plus') + ' Novo agendamento</button></div>' +
      '<div class="stack-lg">' + trialBanner +
      (sv.items.filter((s) => s.active).length ? '' : '<div class="card" style="background:var(--rose);border-color:var(--rose2)"><div class="row between wrap-row"><div><b>Cadastre seu primeiro serviço</b><p class="small" style="margin-top:2px">Sem serviços ativos, suas clientes não conseguem agendar.</p></div><a class="btn btn-primary btn-sm" href="/painel/servicos?novo=1" data-link>' + ic('plus') + ' Adicionar serviço</a></div></div>') +
      '<div class="share-card"><div style="min-width:0;flex:1"><b style="font-family:var(--serif);font-size:1.25rem;font-weight:500">Compartilhe sua agenda</b><div class="url" style="margin-top:10px">' + esc(url.replace(/^https?:\/\//, '')) + '</div></div><div class="row wrap-row"><button class="btn btn-rose btn-sm" data-act="copy-link">' + ic('copy') + ' Copiar link</button><a class="btn btn-line btn-sm" href="/painel/link" data-link style="color:var(--ink)">' + ic('share') + ' Mais opções</a></div></div>' +
      '<div class="stats"><div class="stat"><b>' + d.today.length + '</b><span>Atendimentos hoje</span></div><div class="stat' + (d.counts.pending ? ' hot' : '') + '"><b>' + d.counts.pending + '</b><span>Solicitações pendentes</span></div><div class="stat"><b>' + d.counts.confirmed + '</b><span>Confirmados</span></div><div class="stat"><b>' + d.counts.clientsServed + '</b><span>Clientes atendidas</span></div></div>' +
      '<div class="cols"><section class="stack"><h2 style="font-size:1.4rem">Hoje</h2>' + (d.today.length ? '<div class="list">' + d.today.map((b) => bkCard(b, { noDate: true })).join('') + '</div>' : '<div class="empty"><h3>Dia livre</h3><p>Nenhum atendimento para hoje.</p></div>') +
      '<h2 style="font-size:1.4rem;margin-top:10px">Próximos atendimentos</h2>' + (d.upcoming.length ? '<div class="list">' + d.upcoming.map((b) => bkCard(b, { noActions: true })).join('') + '</div>' : '<div class="empty"><p>Quando suas clientes agendarem, os próximos horários aparecem aqui.</p></div>') + '</section>' +
      '<section class="stack"><h2 style="font-size:1.4rem">Aguardando você</h2>' + (d.pending.filter((b) => !b.expired).length ? '<div class="list">' + d.pending.filter((b) => !b.expired).map((b) => bkCard(b)).join('') + '</div>' : '<div class="empty"><p>Nenhuma solicitação pendente. 🎉</p></div>') +
      (d.counts.expiredPending ? '<p class="small muted">' + d.counts.expiredPending + ' solicitação(ões) com reserva expirada. <a href="/painel/agendamentos" data-link style="font-weight:600">Ver todas</a></p>' : '') +
      '<div class="card flat stack"><b>Atalhos</b><a class="btn btn-line btn-sm" href="/painel/servicos" data-link>' + ic('scissors') + ' Editar serviços</a><a class="btn btn-line btn-sm" href="/painel/disponibilidade" data-link>' + ic('clock') + ' Configurar horários</a><a class="btn btn-line btn-sm" href="/painel/pagina" data-link>' + ic('page') + ' Personalizar minha página</a></div></section></div></div>';
  };
  App.acts['copy-link'] = () => App.copy(App.pageUrl(prof().slug), 'Link copiado!');

  /* ---------- Agenda ---------- */
  sections.agenda = async (m) => {
    const c = state.cal; if (!c.date) c.date = today();
    const d = c.date;
    let from, to;
    if (c.view === 'day') { from = to = d; }
    else if (c.view === 'week') { from = HB.addDays(d, -HB.weekday(d)); to = HB.addDays(from, 6); }
    else { const f = HB.parseD(d); const first = new Date(f.getFullYear(), f.getMonth(), 1); const last = new Date(f.getFullYear(), f.getMonth() + 1, 0); from = HB.addDays(HB.dstr(first), -first.getDay()); to = HB.addDays(HB.dstr(last), 6 - last.getDay()); }
    const [bk, av] = await Promise.all([App.get('/api/bookings?from=' + from + '&to=' + to), App.get('/api/availability')]);
    const list = bk.items.filter((b) => b.status !== 'cancelled' && !b.expired);
    const byDay = {}; list.forEach((b) => { (byDay[b.date] = byDay[b.date] || []).push(b); });
    const blockOn = (date) => av.blocks.find((b) => date >= b.startDate && date <= b.endDate && b.allDay);
    const dObj = HB.parseD(d);
    const title = c.view === 'day' ? HB.WEEKDAYS[dObj.getDay()] + ', ' + HB.dateBR(d).slice(0, 5) : c.view === 'week' ? HB.dateBR(from).slice(0, 5) + ' a ' + HB.dateBR(to).slice(0, 5) : HB.MONTHS[dObj.getMonth()] + ' de ' + dObj.getFullYear();
    let body = '';
    if (c.view === 'day') {
      const day = av.hours[HB.weekday(d)]; const blk = blockOn(d);
      const items = (byDay[d] || []).sort((a, b) => a.time.localeCompare(b.time));
      body = (blk ? '<div class="notice" style="margin-bottom:12px">' + ic('calendar') + '<span>Folga: ' + esc(blk.reason || 'agenda bloqueada') + '</span></div>' : !day.open ? '<div class="notice" style="margin-bottom:12px">' + ic('clock') + '<span>Você não atende neste dia da semana.</span></div>' : '') +
        (items.length ? '<div class="list">' + items.map((b) => bkCard(b, { noDate: true })).join('') + '</div>' : '<div class="empty"><h3>Nenhum atendimento</h3><p>Dia livre por enquanto.</p></div>');
    } else if (c.view === 'week') {
      body = '<div class="week">' + Array.from({ length: 7 }, (_, i) => { const dd = HB.addDays(from, i); const it = (byDay[dd] || []).sort((a, b) => a.time.localeCompare(b.time));
        return '<div class="day' + (dd === today() ? ' today' : '') + '"><h4>' + HB.WEEKDAYS_SHORT[i] + ' ' + HB.dateBR(dd).slice(0, 5) + '</h4>' + (blockOn(dd) ? '<span class="chip mute">Folga</span>' : '') + (it.length ? it.map((b) => { state.bk[b.id] = b; return '<button class="mini ' + b.status + '" data-act="cal-open" data-id="' + b.id + '"><b>' + HB.timeLabel(b.time) + '</b>' + esc(b.clientName.split(' ')[0]) + ' · ' + esc(b.serviceName) + '</button>'; }).join('') : '<span class="muted tiny">Livre</span>') + '</div>'; }).join('') + '</div>';
    } else {
      const cells = []; for (let x = from; x <= to; x = HB.addDays(x, 1)) cells.push(x);
      body = '<div class="cal"><div class="cal-grid cal-month">' + HB.WEEKDAYS_SHORT.map((w) => '<div class="cal-h">' + w + '</div>').join('') + cells.map((x) => { const n = (byDay[x] || []).length; const inM = HB.parseD(x).getMonth() === dObj.getMonth();
        return '<button class="cal-d' + (inM ? '' : ' dim') + (x === today() ? ' today' : '') + '" data-act="cal-day" data-date="' + x + '">' + Number(x.slice(8)) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>'; }).join('') + '</div></div>';
    }
    m.innerHTML = '<div class="page-h"><div><h1>Minha agenda</h1><p class="muted" style="text-transform:capitalize">' + title + '</p></div><button class="btn btn-primary" data-act="new-booking" data-date="' + (c.view === 'day' ? d : today()) + '">' + ic('plus') + ' Novo agendamento</button></div>' +
      '<div class="row between wrap-row" style="margin-bottom:16px"><div class="tabs">' + [['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']].map(([k, l]) => '<button class="tab' + (c.view === k ? ' on' : '') + '" data-act="cal-view" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<div class="row"><button class="btn btn-line btn-sm" data-act="cal-nav" data-n="-1" aria-label="Anterior">' + ic('left') + '</button><button class="btn btn-line btn-sm" data-act="cal-today">Hoje</button><button class="btn btn-line btn-sm" data-act="cal-nav" data-n="1" aria-label="Próximo">' + ic('right') + '</button></div></div>' + body;
  };
  App.acts['cal-view'] = (el) => { state.cal.view = el.dataset.v; refresh(); };
  App.acts['cal-today'] = () => { state.cal.date = today(); refresh(); };
  App.acts['cal-day'] = (el) => { state.cal.date = el.dataset.date; state.cal.view = 'day'; refresh(); };
  App.acts['cal-nav'] = (el) => {
    const n = Number(el.dataset.n), c = state.cal;
    if (c.view === 'day') c.date = HB.addDays(c.date, n); else if (c.view === 'week') c.date = HB.addDays(c.date, 7 * n);
    else { const o = HB.parseD(c.date); c.date = HB.dstr(new Date(o.getFullYear(), o.getMonth() + n, 1)); }
    refresh();
  };
  App.acts['cal-open'] = (el) => { const b = state.bk[el.dataset.id]; App.modal(App.sheetHead(b.serviceName, dayLabel(b.date) + ' às ' + HB.timeLabel(b.time)) + bkCard(b)); };

  /* ---------- Agendamentos ---------- */
  sections.agendamentos = async (m, tab) => {
    const t = state.tab || 'pending'; state.tab = t;
    const from = HB.addDays(today(), -120);
    const { items } = await App.get('/api/bookings?from=' + from);
    const td = today();
    const f = {
      pending: items.filter((b) => b.status === 'pending' && !b.expired && b.date >= td),
      confirmed: items.filter((b) => (b.status === 'confirmed' || b.status === 'rescheduled') && b.date >= td),
      past: items.filter((b) => b.status === 'completed' || ((b.status === 'confirmed' || b.status === 'rescheduled') && b.date < td)).reverse(),
      cancelled: items.filter((b) => b.status === 'cancelled' || b.expired || (b.status === 'pending' && b.date < td)).reverse(),
    };
    setPending(f.pending.length);
    const tabs = [['pending', 'Pendentes'], ['confirmed', 'Confirmados'], ['past', 'Passados'], ['cancelled', 'Cancelados/expirados']];
    m.innerHTML = '<div class="page-h"><div><h1>Agendamentos</h1><p class="muted">Confirme, remarque ou cancele solicitações.</p></div><button class="btn btn-primary" data-act="new-booking">' + ic('plus') + ' Novo agendamento</button></div>' +
      '<div class="tabs" style="margin-bottom:16px">' + tabs.map(([k, l]) => '<button class="tab' + (t === k ? ' on' : '') + '" data-act="bk-tab" data-v="' + k + '">' + l + ' (' + f[k].length + ')</button>').join('') + '</div>' +
      (f[t].length ? '<div class="list">' + f[t].map((b) => bkCard(b)).join('') + '</div>' : '<div class="empty"><h3>Nada por aqui</h3><p>' + { pending: 'Quando uma cliente solicitar um horário pelo seu link, aparece aqui.', confirmed: 'Nenhum atendimento confirmado à frente.', past: 'Seu histórico aparece aqui.', cancelled: 'Nenhum cancelamento.' }[t] + '</p></div>');
  };
  App.acts['bk-tab'] = (el) => { state.tab = el.dataset.v; refresh(); };

  /* ---------- Serviços ---------- */
  sections.servicos = async (m) => {
    const { items } = await App.get('/api/services');
    const pl = App.me.plan; const lim = pl.limits.services;
    App.me.usage.services = items.length;
    m.innerHTML = '<div class="page-h"><div><h1>Meus serviços</h1><p class="muted">O que você oferece, quanto custa e quanto tempo leva.</p></div><button class="btn btn-primary" data-act="svc-new">' + ic('plus') + ' Novo serviço</button></div>' +
      (lim != null ? '<div class="card flat" style="margin-bottom:16px"><div class="row between small"><span>' + items.length + ' de ' + lim + ' serviços do plano ' + esc(pl.name) + '</span></div><div class="usage" style="margin-top:8px"><i style="width:' + Math.min(100, items.length / lim * 100) + '%"></i></div></div>' : '') +
      (items.length ? '<div class="list">' + items.map((s) => '<div class="svc' + (s.active ? '' : ' off') + '"><div class="ph">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : ic('sparkle')) + '</div><div class="info"><b>' + esc(s.name) + '</b><span class="muted small">' + HB.brl(s.priceCents) + ' · ' + HB.durLabel(s.duration) + '</span>' + (s.description ? '<span class="muted tiny" style="display:block">' + esc(s.description) + '</span>' : '') + '</div>' +
        '<label class="switch" title="' + (s.active ? 'Ativo na página' : 'Desativado') + '"><input type="checkbox" data-act="svc-toggle" data-id="' + s.id + '" ' + (s.active ? 'checked' : '') + '><i></i></label>' +
        '<button class="btn btn-ghost btn-sm" data-act="svc-edit" data-id="' + s.id + '" aria-label="Editar">' + ic('edit') + '</button><button class="btn btn-ghost btn-sm" data-act="svc-del" data-id="' + s.id + '" aria-label="Excluir">' + ic('trash') + '</button></div>').join('') + '</div>'
        : '<div class="empty"><h3>Nenhum serviço ainda</h3><p>Cadastre o primeiro para começar a receber agendamentos.</p></div>');
    state.svc = Object.fromEntries(items.map((s) => [s.id, s]));
    if (new URLSearchParams(location.search).get('novo') === '1') { history.replaceState({}, '', '/painel/servicos'); if (!items.length) svcForm(); }
  };
  const svcForm = (s) => {
    let photo = s ? s.photo : '';
    const m = App.modal(App.sheetHead(s ? 'Editar serviço' : 'Novo serviço') + '<form class="stack" novalidate>' +
      App.field({ name: 'name', label: 'Nome do procedimento', value: s && s.name, max: 60, ph: 'Design de sobrancelhas' }) +
      '<div class="grid2">' + App.field({ name: 'price', label: 'Preço (R$)', value: s ? HB.priceInput(s.priceCents) : '', inputmode: 'decimal', ph: '40,00' }) +
      App.field({ name: 'duration', label: 'Duração', type: 'select', value: s ? s.duration : 60, options: [15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240, 300].concat(s && ![15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240, 300].includes(s.duration) ? [s.duration] : []).sort((a, b) => a - b).map((n) => [n, HB.durLabel(n)]) }) + '</div>' +
      App.field({ name: 'description', label: 'Descrição (opcional)', type: 'textarea', value: s && s.description, max: 300, ph: 'O que está incluso, cuidados, etc.' }) +
      '<div class="uploader"><div class="svc"><div class="ph" id="sp-ph" style="width:64px;height:64px">' + (photo ? '<img src="' + esc(photo) + '" alt="">' : ic('image')) + '</div></div><div class="row wrap-row"><button type="button" class="btn btn-line btn-sm" data-act="svc-photo">' + ic('image') + ' Foto (opcional)</button><button type="button" class="btn btn-ghost btn-sm' + (photo ? '' : ' hide') + '" data-act="svc-photo-rm">Remover</button></div></div>' +
      '<div class="errmsg form-err"></div><button class="btn btn-primary btn-block" type="submit">Salvar serviço</button></form>');
    const f = $('form', m);
    const showPh = () => { $('#sp-ph', m).innerHTML = photo ? '<img src="' + esc(photo) + '" alt="">' : ic('image'); $('[data-act=svc-photo-rm]', m).classList.toggle('hide', !photo); };
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'svc-photo') { const u = await App.uploadImage(900).catch((er) => { App.toast(er.message, true); return null; }); if (u) { photo = u; showPh(); } }
      if (b.dataset.act === 'svc-photo-rm') { photo = ''; showPh(); }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      const cents = HB.parsePrice(f.price.value);
      if (cents === null) return App.showErr(f, Object.assign(new Error('Informe um preço válido, ex.: 40,00'), { field: 'price' }));
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try {
          const body = { name: f.name.value, priceCents: cents, duration: Number(f.duration.value), description: f.description.value, photo };
          if (s) await App.put('/api/services/' + s.id, body); else await App.post('/api/services', body);
          m.close(); App.toast('Serviço salvo. Já aparece na sua página!'); refresh();
        } catch (err) { App.showErr(f, err); }
      });
    });
  };
  App.acts['svc-new'] = () => svcForm();
  App.acts['svc-edit'] = (el) => svcForm(state.svc[el.dataset.id]);
  App.acts['svc-del'] = async (el) => { const s = state.svc[el.dataset.id]; if (await App.confirm('Excluir serviço?', '“' + s.name + '” deixará de aparecer na sua página. Agendamentos já feitos continuam no histórico.', 'Excluir', true)) { try { await App.del('/api/services/' + s.id); App.toast('Serviço excluído.'); refresh(); } catch (e) { App.toast(e.message, true); } } };
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!t.matches || !t.matches('[data-act=svc-toggle]')) return;
    try { await App.put('/api/services/' + t.dataset.id, { active: t.checked }); App.toast(t.checked ? 'Serviço ativado.' : 'Serviço desativado.'); refresh(); } catch (er) { t.checked = !t.checked; App.toast(er.message, true); }
  });

  /* ---------- Minha página ---------- */
  sections.pagina = async (m) => {
    const p = prof(); const g = await App.get('/api/gallery'); const plan = App.me.plan;
    const initial = (p.name || 'M').charAt(0).toUpperCase();
    m.innerHTML = '<div class="page-h"><div><h1>Minha página</h1><p class="muted">Como suas clientes veem você.</p></div><a class="btn btn-rose" href="/' + esc(p.slug) + '" target="_blank" rel="noopener">' + ic('external') + ' Ver página</a></div>' +
      '<form class="stack-lg" id="f-page" novalidate><div class="card stack"><h3>Identidade</h3>' +
      '<div class="uploader"><div class="avatar" id="pg-av">' + (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : initial) + '</div><div class="row wrap-row"><button class="btn btn-line btn-sm" type="button" data-act="pg-avatar">' + ic('image') + ' Trocar foto</button></div></div>' +
      '<div><b class="small">Foto de capa</b><div class="coverbox" id="pg-cover" data-act="pg-cover" style="margin-top:6px;' + (p.cover ? 'background-image:url(' + esc(p.cover) + ')' : '') + '">' + (p.cover ? '' : ic('image') + '&nbsp; Adicionar capa') + '</div></div>' +
      '<div class="grid2">' + App.field({ name: 'name', label: 'Nome profissional', value: p.name, max: 60 }) + App.field({ name: 'business', label: 'Estabelecimento', value: p.business, max: 80 }) + '</div>' +
      App.field({ name: 'specialties', label: 'Especialidades', value: p.specialties, max: 200, hint: 'Separe por vírgula.' }) + App.field({ name: 'bio', label: 'Descrição', type: 'textarea', value: p.bio, max: 500 }) + '</div>' +
      '<div class="card stack"><h3>Contato e local</h3><div class="grid2">' + App.field({ name: 'whatsapp', label: 'WhatsApp com DDD', value: p.whatsapp ? HB.fmtPhone(p.whatsapp) : '', mask: 'phone', inputmode: 'tel' }) + App.field({ name: 'instagram', label: 'Instagram', value: p.instagram, prefix: '@', max: 60 }) + '</div>' +
      App.field({ name: 'address', label: 'Endereço ou instruções de atendimento', type: 'textarea', value: p.address, max: 300 }) +
      App.field({ name: 'policies', label: 'Política de cancelamento e atraso', type: 'textarea', value: p.policies, max: 800, rows: 4, ph: 'Ex.: Cancelamentos com até 3 horas de antecedência. Tolerância de atraso de 10 minutos.' }) + '</div>' +
      '<div class="card stack"><h3>Endereço do link</h3><div class="field"><div class="input-group"><span class="pre">' + esc(location.host) + '/</span><input class="input" name="slug" value="' + esc(p.slug) + '" maxlength="30" autocapitalize="off" spellcheck="false"></div><span class="hint">Se você mudar, o link antigo deixa de funcionar. Atualize a bio das redes sociais.</span><span class="errmsg"></span></div></div>' +
      '<div class="card stack"><h3>Cor da página</h3>' + (plan.limits.customColor ? '<div class="row"><input type="color" name="color" value="' + esc(p.color || '#181214') + '" style="width:56px;height:44px;border:0;background:none"><span class="muted small">Cor dos botões da sua página pública.</span></div>' : '<div class="lock">' + ic('lock') + '<span>A cor personalizada faz parte do plano Premium.</span></div>') + '</div>' +
      '<div class="errmsg form-err"></div><div><button class="btn btn-primary btn-lg" type="submit">Salvar alterações</button></div></form>' +
      '<div class="card stack" style="margin-top:24px"><div class="row between"><h3>Galeria de trabalhos</h3><span class="muted small">' + g.items.length + (plan.limits.gallery != null ? ' / ' + plan.limits.gallery : '') + '</span></div><div class="gal" id="gal">' +
      g.items.map((i) => '<div class="g"><img src="' + esc(i.url) + '" alt="Foto da galeria" loading="lazy"><button data-act="gal-del" data-id="' + i.id + '" aria-label="Remover">' + ic('x') + '</button></div>').join('') + '<button class="g add" type="button" data-act="gal-add">' + ic('plus') + '<span>Adicionar foto</span></button></div></div>';
    const f = $('#f-page');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try {
          const body = { name: f.name.value, business: f.business.value, specialties: f.specialties.value, bio: f.bio.value, whatsapp: f.whatsapp.value, instagram: f.instagram.value, address: f.address.value, policies: f.policies.value, slug: f.slug.value.trim().toLowerCase() };
          if (f.color) body.color = f.color.value === '#181214' ? '' : f.color.value;
          const r = await App.put('/api/profile', body); App.me.profile = r.profile; App.toast('Página atualizada!');
        } catch (err) { App.showErr(f, err); }
      });
    });
  };
  const imgField = (id, key, px) => async () => {
    const url = await App.uploadImage(px).catch((e) => { App.toast(e.message, true); return null; }); if (!url) return;
    try { const r = await App.put('/api/profile', { [key]: url }); App.me.profile = r.profile; refresh(); } catch (e) { App.toast(e.message, true); }
  };
  App.acts['pg-avatar'] = imgField('pg-av', 'avatar', 600);
  App.acts['pg-cover'] = imgField('pg-cover', 'cover', 1400);
  App.acts['gal-add'] = async () => {
    const data = await App.pickImage(1200); if (!data) return;
    try { await App.post('/api/gallery', { dataUrl: data }); refresh(); } catch (e) { App.toast(e.message, true); }
  };
  App.acts['gal-del'] = async (el) => { try { await App.del('/api/gallery/' + el.dataset.id); refresh(); } catch (e) { App.toast(e.message, true); } };

  /* ---------- Disponibilidade ---------- */
  sections.disponibilidade = async (m) => {
    const av = await App.get('/api/availability'); const s = av.settings; const free = App.me.plan.id === 'free';
    const sel = (name, label, val, opts, hint) => App.field({ name, label, type: 'select', value: val, options: opts, hint });
    m.innerHTML = '<div class="page-h"><div><h1>Minha disponibilidade</h1><p class="muted">Dias, horários, pausas e regras de antecedência.</p></div></div>' +
      '<form class="stack-lg" id="f-av"><div class="card stack"><h3>Horário de atendimento</h3>' + App.hoursEditor(av.hours) + '</div>' +
      '<div class="card stack"><h3>Regras de agendamento</h3><div class="grid2">' +
      sel('minNoticeHours', 'Antecedência mínima', s.minNoticeHours, [[0, 'Sem antecedência'], [1, '1 hora'], [2, '2 horas'], [4, '4 horas'], [12, '12 horas'], [24, '1 dia'], [48, '2 dias']], 'Quanto tempo antes a cliente pode agendar.') +
      sel('maxAdvanceDays', 'Agendar com até', s.maxAdvanceDays, [[7, '7 dias de antecedência'], [15, '15 dias'], [30, '30 dias'], [60, '60 dias'], [90, '90 dias'], [180, '180 dias']].concat([7, 15, 30, 60, 90, 180].includes(s.maxAdvanceDays) ? [] : [[s.maxAdvanceDays, s.maxAdvanceDays + ' dias']]), 'Até quantos dias à frente a agenda fica aberta.') +
      sel('slotStep', 'Intervalo entre horários', s.slotStep, [[15, '15 minutos'], [30, '30 minutos'], [45, '45 minutos'], [60, '1 hora']], 'De quanto em quanto tempo os horários são oferecidos.') +
      sel('holdMinutes', 'Reserva temporária da solicitação', s.holdMinutes, HB.HOLD_OPTIONS.map((n) => [n, HB.holdLabel(n)]).concat(HB.HOLD_OPTIONS.includes(s.holdMinutes) ? [] : [[s.holdMinutes, s.holdMinutes + ' minutos']]), 'Por quanto tempo um horário solicitado fica reservado enquanto você não confirma.') + '</div></div>' +
      '<div class="errmsg form-err"></div><div><button class="btn btn-primary btn-lg" type="submit">Salvar disponibilidade</button></div></form>' +
      '<div class="card stack" style="margin-top:24px"><div class="row between wrap-row"><div><h3>Folgas, férias e bloqueios</h3><p class="muted small">Datas em que você não atende.</p></div><button class="btn btn-line btn-sm" data-act="blk-new">' + ic('plus') + ' Adicionar</button></div>' +
      (free ? '<div class="lock">' + ic('lock') + '<span>Bloqueios de agenda fazem parte do plano Profissional.</span></div>' : '') +
      (av.blocks.length ? '<div class="list">' + av.blocks.map((b) => '<div class="svc"><div class="info"><b>' + (b.startDate === b.endDate ? HB.dateBR(b.startDate) : HB.dateBR(b.startDate) + ' até ' + HB.dateBR(b.endDate)) + (b.allDay ? '' : ' · ' + b.startTime + ' às ' + b.endTime) + '</b><span class="muted small">' + esc(b.reason || (b.allDay ? 'Dia todo' : 'Bloqueio')) + '</span></div><button class="btn btn-ghost btn-sm" data-act="blk-del" data-id="' + b.id + '" aria-label="Remover">' + ic('trash') + '</button></div>').join('') + '</div>' : '<p class="muted small">Nenhum bloqueio cadastrado.</p>') + '</div>';
    const f = $('#f-av');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try { await App.put('/api/profile', { hours: App.readHours(f), minNoticeHours: +f.minNoticeHours.value, maxAdvanceDays: +f.maxAdvanceDays.value, slotStep: +f.slotStep.value, holdMinutes: +f.holdMinutes.value }); App.toast('Disponibilidade salva!'); }
        catch (err) { App.showErr(f, err); }
      });
    });
  };
  App.acts['blk-new'] = () => {
    const m = App.modal(App.sheetHead('Novo bloqueio') + '<form class="stack" novalidate><div class="tabs"><button type="button" class="tab on" data-k="range">Folga / férias</button><button type="button" class="tab" data-k="hours">Horário específico</button></div>' +
      '<div class="grid2"><div class="field"><label>De</label><input class="input" type="date" name="startDate" min="' + today() + '" value="' + today() + '"></div><div class="field" id="b-end"><label>Até</label><input class="input" type="date" name="endDate" min="' + today() + '" value="' + today() + '"></div></div>' +
      '<div class="grid2 hide" id="b-times"><div class="field"><label>Início</label><input class="input" type="time" name="startTime" value="12:00"></div><div class="field"><label>Fim</label><input class="input" type="time" name="endTime" value="14:00"></div></div>' +
      App.field({ name: 'reason', label: 'Motivo (opcional)', max: 80, ph: 'Férias, consulta, curso…' }) + '<div class="errmsg form-err"></div><button class="btn btn-primary btn-block" type="submit">Bloquear</button></form>');
    const f = $('form', m); let kind = 'range';
    App.$$('.tab', f).forEach((t) => t.addEventListener('click', () => { kind = t.dataset.k; App.$$('.tab', f).forEach((x) => x.classList.toggle('on', x === t)); $('#b-end', f).classList.toggle('hide', kind === 'hours'); $('#b-times', f).classList.toggle('hide', kind !== 'hours'); }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try { await App.post('/api/blocks', { startDate: f.startDate.value, endDate: kind === 'hours' ? f.startDate.value : f.endDate.value, allDay: kind !== 'hours', startTime: f.startTime.value, endTime: f.endTime.value, reason: f.reason.value }); m.close(); App.toast('Bloqueio salvo.'); refresh(); }
        catch (err) { App.showErr(f, err); }
      });
    });
  };
  App.acts['blk-del'] = async (el) => { try { await App.del('/api/blocks/' + el.dataset.id); refresh(); } catch (e) { App.toast(e.message, true); } };

  /* ---------- Clientes ---------- */
  sections.clientes = async (m) => {
    const { items } = await App.get('/api/clients');
    state.clients = Object.fromEntries(items.map((c) => [c.id, c]));
    const row = (c) => '<button class="svc" style="width:100%;text-align:left;cursor:pointer" data-act="cli-open" data-id="' + c.id + '"><div class="avatar" style="width:46px;height:46px;font-size:1.1rem;box-shadow:none">' + esc(c.name.charAt(0).toUpperCase()) + '</div><div class="info"><b>' + esc(c.name) + '</b><span class="muted small">' + esc(HB.fmtPhone(c.phone)) + '</span></div><div style="text-align:right" class="small"><b>' + c.completed + '</b> atend.<br><span class="muted tiny">' + (c.lastDate ? 'últ. ' + HB.dateBR(c.lastDate).slice(0, 5) : '') + '</span></div></button>';
    m.innerHTML = '<div class="page-h"><div><h1>Minhas clientes</h1><p class="muted">' + items.length + ' cliente' + (items.length === 1 ? '' : 's') + ' no histórico.</p></div></div>' +
      (items.length ? '<input class="input" id="cli-q" placeholder="Buscar por nome ou telefone" style="margin-bottom:14px"><div class="list" id="cli-list">' + items.map(row).join('') + '</div>' : '<div class="empty"><h3>Ainda sem clientes</h3><p>Elas aparecem aqui automaticamente depois do primeiro agendamento.</p></div>');
    const q = $('#cli-q');
    if (q) q.addEventListener('input', () => { const t = q.value.toLowerCase().replace(/\s+/g, ' ').trim(); const d = t.replace(/\D/g, ''); $('#cli-list').innerHTML = items.filter((c) => c.name.toLowerCase().includes(t) || (d && c.phone.includes(d))).map(row).join('') || '<p class="muted small">Nenhuma cliente encontrada.</p>'; });
  };
  App.acts['cli-open'] = async (el) => {
    const id = el.dataset.id; const r = await App.get('/api/clients/' + id).catch((e) => { App.toast(e.message, true); return null; }); if (!r) return;
    const c = r.client;
    const m = App.modal(App.sheetHead(c.name, HB.fmtPhone(c.phone)) + '<div class="stack"><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + App.waTo(c.phone, 'Olá, ' + HB.firstName(c.name) + '!') + '" style="justify-self:start">' + ic('whatsapp') + ' Chamar no WhatsApp</a>' +
      '<div class="field"><label>Anotações</label><textarea class="input" id="cli-notes" maxlength="500" placeholder="Preferências, alergias, observações…">' + esc(c.notes) + '</textarea></div><button class="btn btn-line btn-sm" id="cli-save" style="justify-self:start">Salvar anotações</button>' +
      '<h4 style="font-size:1.1rem;margin-top:8px">Histórico</h4>' + (r.bookings.length ? '<div class="list">' + r.bookings.map((b) => '<div class="bk"><div class="row between"><div><b>' + esc(b.serviceName) + '</b><span class="muted small">' + HB.dateBR(b.date) + ' às ' + HB.timeLabel(b.time) + ' · ' + HB.brl(b.priceCents) + '</span></div>' + statusChip(b) + '</div></div>').join('') + '</div>' : '<p class="muted small">Sem atendimentos.</p>') + '</div>');
    $('#cli-save', m).addEventListener('click', async () => { try { await App.put('/api/clients/' + id, { notes: $('#cli-notes', m).value }); App.toast('Anotações salvas.'); } catch (e) { App.toast(e.message, true); } });
  };

  /* ---------- Compartilhe / Meu link ---------- */
  sections.link = async (m) => {
    const p = prof(); const url = App.pageUrl(p.slug); const bios = HB.bioTexts(p.business || p.name);
    m.innerHTML = '<div class="page-h"><div><h1>Compartilhe sua agenda</h1><p class="muted">Seu link exclusivo leva direto para a sua página de agendamento.</p></div></div><div class="stack-lg">' +
      '<div class="card stack"><b>Seu link</b><div class="link-box">' + esc(url) + '</div><div class="row wrap-row"><button class="btn btn-primary" data-act="copy-link">' + ic('copy') + ' Copiar link</button><a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(HB.shareText(p.business || p.name, url)) + '">' + ic('whatsapp') + ' Compartilhar no WhatsApp</a><a class="btn btn-line" target="_blank" rel="noopener" href="/' + esc(p.slug) + '">' + ic('external') + ' Abrir minha página</a>' + (navigator.share ? '<button class="btn btn-line" data-act="native-share">' + ic('share') + ' Mais opções</button>' : '') + '</div></div>' +
      '<div class="card stack"><div><b>Texto para a bio do Instagram</b><p class="muted small">Escolha um modelo, copie e cole na sua bio. Depois, coloque o link no campo “Site”.</p></div>' + bios.map((t, i) => '<div class="bio-opt">' + esc(t) + '</div><div><button class="btn btn-line btn-sm" data-act="copy-bio" data-i="' + i + '">' + ic('copy') + ' Copiar texto</button></div>').join('') + '</div>' +
      '<div class="card flat"><b>Dica</b><p class="muted small" style="margin-top:4px">Fixe o link nos destaques, coloque no perfil do TikTok e envie para clientes antigas. Quanto mais gente conhecer o link, mais agendamentos você recebe.</p></div></div>';
    state.bios = bios;
  };
  App.acts['copy-bio'] = (el) => App.copy(state.bios[+el.dataset.i], 'Texto copiado!');
  App.acts['native-share'] = () => navigator.share({ title: prof().name, text: 'Agende seu horário', url: App.pageUrl(prof().slug) }).catch(() => {});

  const subscribeBlock = (plan, ac) => {
    const opts = App.cfg.plans.filter((p) => p.priceCents > 0 && planPayable(p) && !(ac && ac.renewing && p.id === plan.id));
    return (opts.length ? '<div class="stack" style="gap:8px"><b class="small">' + (plan.priceCents ? 'Mudar de plano' : 'Assinar um plano') + '</b>' + opts.map((p) => payButtons(p, false)).join('') + '<p class="tiny muted">Pagamento seguro. Cobrança mensal automática.</p></div>' : '') +
      (ac && ac.recurring ? '<div><button class="btn btn-ghost btn-sm" data-act="cancel-sub">Cancelar cobrança automática</button></div>' : '') +
      (ac && ac.renewing && ac.provider === 'cakto' ? '<p class="tiny muted">Assinatura pela Cakto. Para cancelar, use o e-mail de compra da Cakto ou fale com o suporte.</p>' : '');
  };

  /* ---------- Configurações ---------- */
  sections.configuracoes = async (m) => {
    await App.loadMe();
    const { user, plan, usage } = App.me; const p = prof();
    const lim = plan.limits;
    m.innerHTML = '<div class="page-h"><div><h1>Configurações</h1></div></div><div class="stack-lg">' +
      '<div class="card stack"><div class="row between wrap-row"><div><b>Seu plano</b><h3 style="margin-top:2px">' + esc(plan.name) + '</h3></div><span class="chip ' + (plan.id === 'free' ? 'mute' : 'ink') + '">' + (plan.priceCents ? HB.brl(plan.priceCents) + '/mês' : 'Grátis') + '</span></div>' +
      '<ul class="small" style="margin:0;padding-left:18px;display:grid;gap:4px">' + plan.features.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>' +
      (lim.bookingsPerMonth != null ? '<div><div class="row between small"><span>Solicitações neste mês</span><span>' + usage.bookingsThisMonth + ' de ' + lim.bookingsPerMonth + '</span></div><div class="usage" style="margin-top:6px"><i style="width:' + Math.min(100, usage.bookingsThisMonth / lim.bookingsPerMonth * 100) + '%"></i></div></div>' : '') +
      (App.me.access && App.me.access.endsAt ? '<p class="small">' + (App.me.access.trial ? 'Seu teste grátis termina em <b>' : 'Seu acesso vai até <b>') + HB.dateBR(HB.dstr(new Date(App.me.access.endsAt))) + '</b>.</p>' : '') +
      (App.cfg.billing ? subscribeBlock(plan, App.me.access) : (plan.id !== 'premium' ? '<p class="muted small">Para assinar ou mudar de plano, fale com o suporte.</p>' + (supportLink('Olá! Quero assinar um plano do ' + App.cfg.siteName + '. Meu e-mail: ' + user.email) ? '<a class="btn btn-wa btn-sm" style="justify-self:start" target="_blank" rel="noopener" href="' + esc(supportLink('Olá! Quero assinar um plano do ' + App.cfg.siteName + '. Meu e-mail: ' + user.email)) + '">' + ic('whatsapp') + ' Falar com o suporte</a>' : '') : '')) + '</div>' +
      '<form class="card stack" id="f-email"><h3>E-mail de acesso</h3>' + App.field({ name: 'email', label: 'E-mail', type: 'email', value: user.email }) + App.field({ name: 'password', label: 'Confirme sua senha', type: 'password', auto: 'current-password' }) + '<div class="errmsg form-err"></div><div><button class="btn btn-line" type="submit">Atualizar e-mail</button></div></form>' +
      '<form class="card stack" id="f-pw"><h3>Senha</h3>' + App.field({ name: 'current', label: 'Senha atual', type: 'password', auto: 'current-password' }) + App.field({ name: 'next', label: 'Nova senha', type: 'password', auto: 'new-password', hint: 'Mínimo de 8 caracteres.' }) + '<div class="errmsg form-err"></div><div><button class="btn btn-line" type="submit">Trocar senha</button></div></form>' +
      '<form class="card stack" id="f-wa"><h3>WhatsApp de atendimento</h3>' + App.field({ name: 'whatsapp', label: 'WhatsApp com DDD', value: p.whatsapp ? HB.fmtPhone(p.whatsapp) : '', mask: 'phone', inputmode: 'tel', hint: 'Recebe as solicitações de agendamento.' }) + '<div class="errmsg form-err"></div><div><button class="btn btn-line" type="submit">Salvar WhatsApp</button></div></form>' +
      '<div><button class="btn btn-danger" data-act="logout">' + ic('logout') + ' Sair da conta</button></div></div>';
    const bind = (id, fn, ok) => { const f = $(id); f.addEventListener('submit', async (e) => { e.preventDefault(); App.showErr(f); await App.busy(f.querySelector('button[type=submit]'), async () => { try { await fn(f); App.toast(ok); } catch (err) { App.showErr(f, err); } }); }); };
    bind('#f-email', (f) => App.post('/api/account/email', { email: f.email.value, password: f.password.value }), 'E-mail atualizado.');
    bind('#f-pw', async (f) => { await App.post('/api/account/password', { current: f.current.value, next: f.next.value }); f.reset(); }, 'Senha alterada.');
    bind('#f-wa', async (f) => { const r = await App.put('/api/profile', { whatsapp: f.whatsapp.value }); App.me.profile = r.profile; }, 'WhatsApp atualizado.');
  };

  /* ---------- Mais (menu mobile) ---------- */
  sections.mais = async (m) => {
    m.innerHTML = '<div class="page-h"><h1>Mais</h1></div><div class="list">' + NAV.filter(([k]) => !['', 'agenda', 'agendamentos', 'servicos'].includes(k)).map(([k, l, i]) => '<a class="svc" href="/painel/' + k + '" data-link style="text-decoration:none">' + ic(i) + '<div class="info"><b>' + l + '</b></div>' + ic('right') + '</a>').join('') + '<button class="svc" data-act="logout" style="width:100%;cursor:pointer">' + ic('logout') + '<div class="info" style="text-align:left"><b>Sair</b></div></button></div>';
  };
})();
