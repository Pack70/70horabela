/* Login, cadastro e assistente de primeiro acesso */
(function () {
  const App = window.App, esc = App.esc, ic = App.icon;

  const side = () => '<aside class="auth-side">' + App.logo('/') + '<div><h2>Sua agenda de beleza, organizada em um só lugar.</h2><p style="margin-top:14px;max-width:26em;color:var(--ink2)">Uma página de agendamento só sua, pronta para o link da bio. As clientes escolhem o horário e você confirma pelo WhatsApp.</p></div><p class="small" style="color:var(--ink2)">' + ic('heart') + ' Feito para profissionais autônomas da beleza</p></aside>';

  App.views.login = () => {
    App.mount('<div class="auth">' + side() + '<main class="auth-main"><form class="auth-box" id="f-login" novalidate>' +
      '<div class="hide-lg" style="margin-bottom:6px">' + App.logo('/') + '</div>' +
      '<div><h1>Que bom te ver de novo</h1><p class="muted" style="margin-top:6px">Entre para acessar sua agenda.</p></div>' +
      App.field({ name: 'email', label: 'E-mail', type: 'email', required: true, auto: 'email', ph: 'voce@exemplo.com' }) +
      App.field({ name: 'password', label: 'Senha', type: 'password', required: true, auto: 'current-password' }) +
      '<div class="errmsg form-err"></div><button class="btn btn-primary btn-block btn-lg" type="submit">Entrar</button>' +
      (App.cfg.registrationOpen ? '<p class="small muted" style="text-align:center">Ainda não tem conta? <a href="/cadastro" data-link style="font-weight:600">Criar minha página grátis</a></p>' : '') +
      '</form></main></div>');
    const f = App.$('#f-login');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try {
          const r = await App.post('/api/auth/login', { email: f.email.value, password: f.password.value });
          await App.loadMe();
          App.go(r.role === 'admin' ? '/admin' : '/painel');
        } catch (err) { App.showErr(f, err); }
      });
    });
  };

  App.views.register = () => {
    if (!App.cfg.registrationOpen) { App.mount('<div class="auth"><main class="auth-main" style="grid-column:1/-1"><div class="auth-box"><h1>Cadastros temporariamente fechados</h1><p class="muted">Volte em breve ou entre na sua conta.</p><a class="btn btn-primary" href="/entrar" data-link>Entrar</a></div></main></div>'); return; }
    App.mount('<div class="auth">' + side() + '<main class="auth-main"><form class="auth-box" id="f-reg" novalidate>' +
      '<div><h1>Crie sua página grátis</h1><p class="muted" style="margin-top:6px">Leva menos de 5 minutos. Sem cartão de crédito.</p></div>' +
      App.field({ name: 'name', label: 'Seu nome', required: true, auto: 'name', ph: 'Maria Silva', max: 60 }) +
      App.field({ name: 'email', label: 'E-mail', type: 'email', required: true, auto: 'email', ph: 'voce@exemplo.com' }) +
      App.field({ name: 'password', label: 'Senha', type: 'password', required: true, auto: 'new-password', hint: 'Mínimo de 8 caracteres.' }) +
      '<div class="errmsg form-err"></div><button class="btn btn-primary btn-block btn-lg" type="submit">Criar minha página grátis</button>' +
      '<p class="small muted" style="text-align:center">Já tem conta? <a href="/entrar" data-link style="font-weight:600">Entrar</a></p></form></main></div>');
    const f = App.$('#f-reg');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try {
          await App.post('/api/auth/register', { name: f.name.value, email: f.email.value, password: f.password.value });
          await App.loadMe();
          App.go('/configurar');
        } catch (err) { App.showErr(f, err); }
      });
    });
  };

  /* ---------- Assistente de configuração ---------- */
  App.views.wizard = () => {
    const { profile } = App.me;
    const st = { step: 1, hours: null, slugOk: null };
    const TOTAL = 4;
    const initial = (profile.name || 'M').trim().charAt(0).toUpperCase();
    const hoursPromise = App.get('/api/availability').then((r) => { st.hours = r.hours; });

    const titles = [
      ['Vamos começar por você', 'Essas informações aparecem na sua página de agendamento.'],
      ['Mostre sua cara', 'Uma foto de perfil passa confiança. A capa é opcional.'],
      ['Como as clientes falam com você', 'O WhatsApp recebe as solicitações de agendamento.'],
      ['Seu link e seus horários', 'Defina o endereço da sua página e quando você atende.'],
    ];

    const body = () => {
      if (st.step === 1) return '<div class="stack">' +
        App.field({ name: 'name', label: 'Nome profissional', value: profile.name, required: true, max: 60, hint: 'Como suas clientes te conhecem. Ex.: Maria Beauty' }) +
        App.field({ name: 'business', label: 'Nome do estabelecimento (opcional)', value: profile.business, max: 80, ph: 'Studio Maria Silva' }) +
        App.field({ name: 'specialties', label: 'Especialidades', value: profile.specialties, max: 200, ph: 'Design de sobrancelhas, Brow lamination', hint: 'Separe por vírgula.' }) +
        App.field({ name: 'bio', label: 'Descrição do seu trabalho', type: 'textarea', value: profile.bio, max: 500, ph: 'Conte em poucas palavras como é o seu atendimento…' }) + '</div>';
      if (st.step === 2) return '<div class="stack-lg">' +
        '<div class="uploader"><div class="avatar" id="w-av">' + (profile.avatar ? '<img src="' + esc(profile.avatar) + '" alt="">' : esc(initial)) + '</div><div><b>Foto de perfil</b><p class="muted small" style="margin:2px 0 8px">Quadrada, de preferência com seu rosto ou logo.</p><button class="btn btn-line btn-sm" type="button" data-act="w-avatar">' + ic('image') + ' Escolher foto</button></div></div>' +
        '<div><b>Foto de capa (opcional)</b><div class="coverbox" id="w-cover" data-act="w-cover" style="margin-top:8px;' + (profile.cover ? 'background-image:url(' + esc(profile.cover) + ')' : '') + '">' + (profile.cover ? '' : ic('image') + '&nbsp; Adicionar capa') + '</div></div></div>';
      if (st.step === 3) return '<div class="stack">' +
        App.field({ name: 'whatsapp', label: 'WhatsApp com DDD', value: profile.whatsapp ? HB.fmtPhone(profile.whatsapp) : '', required: true, mask: 'phone', inputmode: 'tel', ph: '(11) 91234-5678', hint: 'É para este número que as solicitações serão enviadas.' }) +
        App.field({ name: 'instagram', label: 'Instagram (opcional)', value: profile.instagram, prefix: '@', ph: 'mariabeauty', max: 60 }) +
        App.field({ name: 'address', label: 'Endereço ou local de atendimento', type: 'textarea', value: profile.address, max: 300, ph: 'Rua das Flores, 123 — Vila Mariana, São Paulo. Atendo também a domicílio.' }) + '</div>';
      return '<div class="stack-lg">' +
        '<div class="field"><label for="f_slug">Endereço da sua página</label><div class="input-group"><span class="pre">' + esc(location.host) + '/</span><input class="input" id="f_slug" name="slug" value="' + esc(profile.slug || HB.slugify(profile.business || profile.name)) + '" maxlength="30" autocapitalize="off" autocomplete="off" spellcheck="false"></div><span class="hint" id="slug-msg"></span><span class="errmsg"></span></div>' +
        '<div><b>Horários de atendimento</b><p class="muted small" style="margin:2px 0 10px">Você pode ajustar tudo depois em “Minha disponibilidade”.</p><div id="w-hours"></div></div></div>';
    };

    const draw = () => {
      const [t, s] = titles[st.step - 1];
      App.mount('<div class="wiz"><div class="wrap">' + App.logo('/') + '</div><form class="wiz-box" id="f-wiz" novalidate>' +
        '<div class="progress">' + Array.from({ length: TOTAL }, (_, i) => '<i class="' + (i < st.step ? 'on' : '') + '"></i>').join('') + '</div>' +
        '<p class="muted small">Passo ' + st.step + ' de ' + TOTAL + '</p><h1>' + t + '</h1><p class="muted" style="margin:6px 0 24px">' + s + '</p>' + body() +
        '<div class="errmsg form-err" style="margin-top:12px"></div>' +
        '<div class="row between" style="margin-top:22px">' + (st.step > 1 ? '<button type="button" class="btn btn-line" data-act="w-back">Voltar</button>' : '<span></span>') +
        '<button class="btn btn-primary btn-lg" type="submit">' + (st.step === TOTAL ? 'Publicar minha página' : 'Continuar') + '</button></div></form></div>');
      const f = App.$('#f-wiz');
      f.addEventListener('submit', next);
      if (st.step === 4) {
        hoursPromise.then(() => { App.$('#w-hours').innerHTML = App.hoursEditor(st.hours); });
        const inp = f.slug; let timer;
        const check = async () => {
          const v = inp.value.trim().toLowerCase(); const msg = App.$('#slug-msg');
          const local = HB.usernameError(v);
          if (local) { msg.className = 'hint errmsg'; msg.textContent = local; st.slugOk = false; return; }
          try { const r = await App.get('/api/slug-check?slug=' + encodeURIComponent(v)); st.slugOk = r.available; msg.className = r.available ? 'hint okmsg' : 'hint errmsg'; msg.textContent = r.available ? '✓ ' + App.pageUrl(v).replace(/^https?:\/\//, '') + ' está disponível' : r.message; } catch (_) { /* ignore */ }
        };
        inp.addEventListener('input', () => { inp.value = inp.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); clearTimeout(timer); timer = setTimeout(check, 300); });
        if (inp.value) check();
      }
    };

    const next = async (e) => {
      e.preventDefault();
      const f = App.$('#f-wiz'); App.showErr(f);
      await App.busy(f.querySelector('button[type=submit]'), async () => {
        try {
          if (st.step === 1) { const r = await App.put('/api/profile', { name: f.name.value, business: f.business.value, specialties: f.specialties.value, bio: f.bio.value }); Object.assign(profile, r.profile); }
          else if (st.step === 3) { const r = await App.put('/api/profile', { whatsapp: f.whatsapp.value, instagram: f.instagram.value, address: f.address.value }); Object.assign(profile, r.profile); }
          else if (st.step === 4) {
            const r = await App.put('/api/profile', { slug: f.slug.value.trim().toLowerCase(), hours: App.readHours(f), onboarded: true });
            Object.assign(profile, r.profile);
            await App.loadMe();
            App.toast('Sua página está no ar! 🎉');
            App.go('/painel/servicos?novo=1', true);
            return;
          }
          if (st.step === 3 && !profile.whatsapp) throw new Error('Informe seu WhatsApp.');
          st.step++; draw();
        } catch (err) { App.showErr(f, err); }
      });
    };

    App.acts['w-back'] = () => { st.step--; draw(); };
    App.acts['w-avatar'] = async () => {
      const url = await App.uploadImage(600).catch((e) => { App.toast(e.message, true); return null; });
      if (!url) return;
      const r = await App.put('/api/profile', { avatar: url }); Object.assign(profile, r.profile);
      App.$('#w-av').innerHTML = '<img src="' + esc(url) + '" alt="">';
    };
    App.acts['w-cover'] = async () => {
      const url = await App.uploadImage(1400).catch((e) => { App.toast(e.message, true); return null; });
      if (!url) return;
      const r = await App.put('/api/profile', { cover: url }); Object.assign(profile, r.profile);
      const c = App.$('#w-cover'); c.style.backgroundImage = 'url(' + url + ')'; c.textContent = '';
    };
    draw();
  };
})();
