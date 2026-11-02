/* Página pública de agendamento de cada profissional */
(function () {
  const App = window.App, esc = App.esc, ic = App.icon, $ = App.$;
  const LS = (slug) => 'hb_req_' + slug;
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };

  const notFound = () => App.mount('<div class="notfound"><div class="stack" style="justify-items:center"><div class="logo-mark" style="width:60px;height:60px;border-radius:18px;font-size:1.6rem">' + ic('clock') + '</div><h1 style="font-size:2rem">Página não encontrada</h1><p class="muted">Confira se o link está correto ou fale com a profissional.</p><a class="btn btn-line" href="/" data-link>Conhecer o ' + esc(App.cfg.siteName) + '</a></div></div>');

  App.views.book = async (slug) => {
    App.mount('<div class="boot"><span class="spinner"></span></div>');
    let data;
    try { data = await App.get('/api/public/' + encodeURIComponent(slug)); } catch (e) { if (e.status === 404) return notFound(); App.mount('<div class="notfound"><div><h1>Ops!</h1><p class="muted">' + esc(e.message) + '</p></div></div>'); return; }
    const p = data.profile;
    document.title = (p.business || p.name) + ' — Agende seu horário';
    const accent = p.color ? 'style="--accent:' + esc(p.color) + ';--accent-ink:' + HB.contrastOn(p.color) + '"' : '';
    const initial = (p.name || 'M').charAt(0).toUpperCase();
    const waBtn = '';
    const tags = p.specialties ? p.specialties.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const days = [1, 2, 3, 4, 5, 6, 0];

    App.mount('<div class="pub" ' + accent + '><div class="pub-in">' +
      '<div class="pub-cover" style="' + (p.cover ? 'background-image:url(' + esc(p.cover) + ')' : '') + '"></div>' +
      '<div class="pub-head"><div class="avatar">' + (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="' + esc(p.name) + '">' : esc(initial)) + '</div>' +
      '<h1>' + esc(p.business || p.name) + '</h1><p class="pub-sub">' + (p.business ? esc(p.name) : '') + '</p>' +
      (p.bio ? '<p style="margin-top:12px;color:var(--ink2);white-space:pre-line">' + esc(p.bio) + '</p>' : '') +
      (tags.length ? '<div class="tags">' + tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' : '') +
      '<div class="pub-links">' + (p.instagram ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://instagram.com/' + esc(p.instagram) + '">' + ic('instagram') + ' @' + esc(p.instagram) + '</a>' : '') + waBtn + '</div></div>' +
      '<div id="my-req"></div>' +
      '<section class="pub-sec" id="servicos"><h2>Escolha seu procedimento</h2>' +
      (data.services.length ? '<div class="stack">' + data.services.map((s) => '<article class="psvc"><div class="top">' + (s.photo ? '<div class="ph"><img src="' + esc(s.photo) + '" alt="" loading="lazy"></div>' : '') + '<div style="flex:1;min-width:0"><h3>' + esc(s.name) + '</h3>' + (s.description ? '<p class="muted small" style="margin-top:4px">' + esc(s.description) + '</p>' : '') + '</div></div>' +
        '<div class="row between"><div class="meta"><span class="price">' + HB.brl(s.priceCents) + '</span><span>' + ic('clock') + ' ' + HB.durLabel(s.duration) + '</span></div><button class="btn btn-primary btn-sm" data-act="bk-start" data-id="' + s.id + '">Agendar</button></div></article>').join('') + '</div>' : '<div class="empty"><p>Esta profissional ainda não publicou serviços.</p></div>') + '</section>' +
      (data.gallery.length ? '<section class="pub-sec"><h2>Meus trabalhos</h2><div class="pgal">' + data.gallery.map((u, i) => '<button data-act="lightbox" data-i="' + i + '" aria-label="Ver foto ' + (i + 1) + '"><img src="' + esc(u) + '" alt="Trabalho ' + (i + 1) + '" loading="lazy"></button>').join('') + '</div></section>' : '') +
      '<section class="pub-sec"><h2>Atendimento</h2><div class="stack">' +
      (p.address ? '<div class="policy" style="display:flex;gap:10px"><span style="color:var(--rose-ink)">' + ic('pin') + '</span><div><div style="white-space:pre-line">' + esc(p.address) + '</div><a class="small" style="font-weight:600" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.address.replace(/\s+/g, ' ')) + '">Ver no mapa</a></div></div>' : '') +
      '<div class="hours-list">' + days.map((d) => { const h = data.hours[d]; return '<div><span>' + HB.WEEKDAYS[d] + '</span><b style="font-weight:600' + (h.open ? '' : ';color:var(--muted)') + '">' + (h.open ? h.start.replace(':', 'h').replace(/h00$/, 'h') + ' às ' + h.end.replace(':', 'h').replace(/h00$/, 'h') : 'Fechado') + '</b></div>'; }).join('') + '</div></div></section>' +
      (p.policies ? '<section class="pub-sec"><h2>Políticas</h2><div class="policy">' + esc(p.policies) + '</div></section>' : '') +
      '<div class="pub-foot">' + (p.hideBrand ? '' : 'Agenda online por <a href="/" data-link style="font-weight:600">' + esc(data.siteName) + '</a>') + '</div></div></div>');

    // solicitação anterior da cliente neste aparelho
    const prev = lsGet(LS(slug));
    if (prev && prev.token) {
      App.get('/api/public/' + encodeURIComponent(slug) + '/booking/' + encodeURIComponent(prev.token)).then((r) => {
        const b = r.booking; if (b.date < HB.dstr(new Date()) || b.status === 'cancelled' || b.status === 'completed') return;
        const label = b.expired ? 'Reserva expirada' : HB.STATUS[b.status].label;
        $('#my-req').innerHTML = '<div class="my-req"><div class="row between"><b>Sua solicitação</b><span class="chip ' + (b.expired ? 'mute' : HB.STATUS[b.status].tone) + '">' + label + '</span></div><span class="small">' + esc(b.serviceName) + ' · ' + HB.dateBR(b.date) + ' às ' + HB.timeLabel(b.time) + '</span>' +
          (b.status === 'pending' && !b.expired ? '<p class="muted tiny">Aguardando a confirmação da profissional. Se ainda não enviou a mensagem, toque abaixo.</p><a class="btn btn-wa btn-sm" href="' + esc(r.whatsappUrl) + '">' + ic('whatsapp') + ' Abrir WhatsApp</a>' : '') + '</div>';
      }).catch(() => {});
    }

    App.acts.lightbox = (el) => { const i = +el.dataset.i; const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = '<img src="' + esc(data.gallery[i]) + '" alt="">'; lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb); };
    App.acts['bk-start'] = (el) => flow(data, slug, data.services.find((s) => s.id === el.dataset.id));
  };

  /* ---------- Fluxo de agendamento ---------- */
  async function flow(data, slug, svc) {
    const p = data.profile;
    const st = { step: 'date', date: '', time: '', name: '', phone: '', month: null, slots: null, err: '' };
    const m = App.modal('<div class="bsheet-in" style="display:flex;flex-direction:column;height:100%"></div>', { cls: 'bsheet', noFocus: true });
    const root = $('.bsheet-in', m);
    const sheet = $('.sheet', m);
    sheet.style.cssText = '';
    const title = { date: 'Escolha a data', info: 'Seus dados', summary: 'Confira e confirme', done: 'Solicitação registrada' };

    try { st.slots = await App.get('/api/public/' + encodeURIComponent(slug) + '/slots?service=' + encodeURIComponent(svc.id)); }
    catch (e) { root.innerHTML = '<div class="bs-body"><p class="errmsg">' + esc(e.message) + '</p></div>'; return; }
    const today = st.slots.today;
    const first = Object.keys(st.slots.days)[0];
    st.month = (first || today).slice(0, 7);

    const header = (back) => '<div class="bs-head">' + (back ? '<button class="x" data-bk="back" aria-label="Voltar">' + ic('left') + '</button>' : '') + '<div class="ttl"><b>' + title[st.step] + '</b><span class="muted small">' + esc(svc.name) + ' · ' + HB.durLabel(svc.duration) + ' · ' + HB.brl(svc.priceCents) + '</span></div><button class="x" data-close aria-label="Fechar">' + ic('x') + '</button></div>';

    const calendar = () => {
      const [y, mo] = st.month.split('-').map(Number);
      const firstDay = new Date(y, mo - 1, 1); const dim = new Date(y, mo, 0).getDate();
      const lastAllowed = HB.addDays(today, st.slots.maxAdvanceDays).slice(0, 7);
      let cells = ''; for (let i = 0; i < firstDay.getDay(); i++) cells += '<span></span>';
      for (let d = 1; d <= dim; d++) {
        const ds = y + '-' + HB.pad(mo) + '-' + HB.pad(d); const av = !!st.slots.days[ds];
        cells += '<button type="button" class="cal-d' + (av ? ' avail' : ' dim') + (st.date === ds ? ' sel' : '') + (ds === today ? ' today' : '') + '" ' + (av ? 'data-bk="day" data-d="' + ds + '"' : 'disabled') + ' aria-label="' + d + ' de ' + HB.MONTHS[mo - 1] + (av ? '' : ' indisponível') + '">' + d + '</button>';
      }
      return '<div class="cal"><div class="cal-nav"><button type="button" class="btn btn-ghost btn-sm" data-bk="mprev" aria-label="Mês anterior" ' + (st.month <= today.slice(0, 7) ? 'disabled' : '') + '>' + ic('left') + '</button><h4>' + HB.MONTHS[mo - 1] + ' ' + y + '</h4><button type="button" class="btn btn-ghost btn-sm" data-bk="mnext" aria-label="Próximo mês" ' + (st.month >= lastAllowed ? 'disabled' : '') + '>' + ic('right') + '</button></div><div class="cal-grid">' + HB.WEEKDAYS_SHORT.map((w) => '<div class="cal-h">' + w + '</div>').join('') + cells + '</div></div>';
    };
    const slotsHtml = () => {
      if (!st.date) return Object.keys(st.slots.days).length ? '<p class="muted small" style="margin-top:14px">Toque em um dia destacado para ver os horários.</p>' : '<div class="notice" style="margin-top:14px">' + ic('calendar') + '<span>Sem horários livres no momento. Fale diretamente com a profissional.</span></div>';
      const list = st.slots.days[st.date] || [];
      const grp = [['Manhã', (t) => t < '12:00'], ['Tarde', (t) => t >= '12:00' && t < '18:00'], ['Noite', (t) => t >= '18:00']];
      return '<p style="margin-top:16px;font-weight:600;text-transform:capitalize">' + HB.WEEKDAYS[HB.weekday(st.date)] + ', ' + HB.dateBR(st.date).slice(0, 5) + '</p>' + grp.map(([l, fn]) => { const s = list.filter(fn); return s.length ? '<div class="period">' + l + '</div><div class="slots">' + s.map((t) => '<button type="button" class="slot' + (st.time === t ? ' sel' : '') + '" data-bk="time" data-t="' + t + '">' + t + '</button>').join('') + '</div>' : ''; }).join('');
    };

    const draw = () => {
      let body = '', foot = '';
      if (st.step === 'date') {
        body = calendar() + '<div id="slots">' + slotsHtml() + '</div>';
        foot = '<button class="btn btn-primary btn-block btn-lg" data-bk="to-info" ' + (st.time ? '' : 'disabled') + '>Continuar</button>';
      } else if (st.step === 'info') {
        body = '<form class="stack" id="bk-form" novalidate>' + App.field({ name: 'name', label: 'Seu nome', value: st.name, max: 60, auto: 'name', required: true }) + App.field({ name: 'phone', label: 'Seu telefone com DDD', value: st.phone, mask: 'phone', inputmode: 'tel', auto: 'tel', ph: '(11) 91234-5678', required: true }) +
          '<input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true"><p class="hint">Usamos seus dados apenas para esta solicitação de agendamento.</p><div class="errmsg form-err"></div></form>';
        foot = '<button class="btn btn-primary btn-block btn-lg" data-bk="to-summary">Revisar agendamento</button>';
      } else if (st.step === 'summary') {
        body = '<div class="summary"><div class="r"><span>Profissional</span><b>' + esc(p.name) + '</b></div><div class="r"><span>Procedimento</span><b>' + esc(svc.name) + '</b></div><div class="r"><span>Data</span><b style="text-transform:capitalize">' + HB.WEEKDAYS[HB.weekday(st.date)] + ', ' + HB.dateBR(st.date) + '</b></div><div class="r"><span>Horário</span><b>' + HB.timeLabel(st.time) + '</b></div><div class="r"><span>Duração</span><b>' + HB.durLabel(svc.duration) + '</b></div><div class="r"><span>Valor</span><b>' + HB.brl(svc.priceCents) + '</b></div><hr class="divider"><div class="r"><span>Cliente</span><b>' + esc(st.name) + '</b></div><div class="r"><span>Telefone</span><b>' + esc(HB.fmtPhone(HB.normPhone(st.phone))) + '</b></div></div>' +
          '<div class="notice" style="margin-top:14px">' + ic('alert') + '<span>O horário só fica <b>confirmado</b> depois que ' + esc(HB.firstName(p.name)) + ' responder. Ao tocar no botão abaixo, o WhatsApp abre com a mensagem pronta e <b>você precisa apertar enviar</b>.</span></div><div class="errmsg form-err" style="margin-top:10px"></div>';
        foot = '<button class="btn btn-wa btn-block btn-lg" data-bk="send">' + ic('whatsapp') + ' Confirmar pelo WhatsApp</button>';
      } else {
        body = '<div class="success"><div class="big">' + ic('check') + '</div><h3 style="font-size:1.5rem">Solicitação registrada!</h3><p class="muted">Agora é só enviar a mensagem no WhatsApp para ' + esc(HB.firstName(p.name)) + '. Seu horário fica <b>aguardando confirmação</b> até ela responder.</p>' +
          '<div class="summary" style="width:100%;text-align:left"><div class="r"><span>Procedimento</span><b>' + esc(svc.name) + '</b></div><div class="r"><span>Quando</span><b>' + HB.dateBR(st.date) + ' às ' + HB.timeLabel(st.time) + '</b></div><div class="r"><span>Status</span><b><span class="chip warn">Pendente de confirmação</span></b></div></div>' +
          '<p class="muted small">Não abriu o WhatsApp? Toque no botão abaixo e aperte <b>enviar</b>.</p></div>';
        foot = '<a class="btn btn-wa btn-block btn-lg" id="wa-open" href="' + esc(st.waUrl) + '">' + ic('whatsapp') + ' Abrir WhatsApp</a>';
      }
      root.innerHTML = header(st.step !== 'date' && st.step !== 'done') + '<div class="bs-body">' + body + '</div><div class="bs-foot">' + foot + '</div>';
      $('.sheet', m).classList.add('bsheet');
    };

    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-bk]'); if (!b) return;
      const k = b.dataset.bk;
      if (k === 'day') { st.date = b.dataset.d; st.time = ''; draw(); const s = $('#slots', m); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      else if (k === 'time') { st.time = b.dataset.t; draw(); }
      else if (k === 'mprev' || k === 'mnext') { const [y, mo] = st.month.split('-').map(Number); const d = new Date(y, mo - 1 + (k === 'mnext' ? 1 : -1), 1); st.month = HB.dstr(d).slice(0, 7); draw(); }
      else if (k === 'back') { st.step = st.step === 'summary' ? 'info' : 'date'; draw(); }
      else if (k === 'to-info') { st.step = 'info'; draw(); }
      else if (k === 'to-summary') {
        const f = $('#bk-form', m); App.showErr(f);
        st.name = f.name.value; st.phone = f.phone.value;
        const ne = HB.nameError(st.name); if (ne) return App.showErr(f, Object.assign(new Error('Informe seu nome.'), { field: 'name' }));
        if (!HB.normPhone(st.phone)) return App.showErr(f, Object.assign(new Error('Informe um telefone válido com DDD.'), { field: 'phone' }));
        st.honey = f.website.value; st.step = 'summary'; draw();
      }
      else if (k === 'send') {
        await App.busy(b, async () => {
          try {
            const r = await App.post('/api/public/' + encodeURIComponent(slug) + '/bookings', { serviceId: svc.id, date: st.date, time: st.time, name: st.name, phone: st.phone, website: st.honey || '' });
            if (!r.token) { st.waUrl = '#'; st.step = 'done'; draw(); return; }
            st.waUrl = r.whatsappUrl; lsSet(LS(slug), { token: r.token, at: Date.now() });
            st.step = 'done'; draw();
            window.location.assign(r.whatsappUrl);
          } catch (err) {
            const f = $('.form-err', m); if (f) f.textContent = err.message;
            if (err.status === 409) { // horário ocupado: recarrega disponibilidade
              try { st.slots = await App.get('/api/public/' + encodeURIComponent(slug) + '/slots?service=' + encodeURIComponent(svc.id)); } catch (_) { /* ignore */ }
              st.time = ''; st.step = 'date'; draw(); const s = $('.bs-body', m); if (s) s.insertAdjacentHTML('afterbegin', '<div class="notice" style="margin-bottom:12px">' + ic('alert') + '<span>' + esc(err.message) + '</span></div>');
            }
          }
        });
      }
    });
    draw();
  }
})();
