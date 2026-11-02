/* Landing page — aquisição de profissionais (nada de vitrine de profissionais) */
(function () {
  const App = window.App, esc = App.esc, ic = App.icon;

  App.views.landing = () => {
    const u = App.me && App.me.user;
    const panel = u ? (u.role === 'admin' ? '/admin' : '/painel') : null;
    const cta = panel ? '<a class="btn btn-primary btn-lg" href="' + panel + '" data-link>Ir para o meu painel</a>' : '<a class="btn btn-primary btn-lg" href="/cadastro" data-link>Criar minha página grátis</a>';
    const plans = App.cfg.plans.map((p) => {
      const price = p.priceCents ? HB.brl(p.priceCents).replace('R$ ', '') : '0';
      return '<div class="plan' + (p.highlight ? ' hl' : '') + '">' + (p.highlight ? '<span class="badge">Mais escolhido</span>' : '') +
        '<div><h3>' + esc(p.name) + '</h3><p class="muted small" style="margin-top:4px">' + esc(p.tagline) + '</p></div>' +
        '<div class="price"><small>R$</small> ' + esc(price) + ' <small>' + (p.priceCents ? '/mês' : 'para sempre') + '</small></div>' +
        '<ul>' + p.features.map((f) => '<li>' + ic('check') + '<span>' + esc(f) + '</span></li>').join('') + '</ul>' +
        '<a class="btn ' + (p.highlight ? 'btn-primary' : 'btn-line') + ' btn-block" href="' + (panel || '/cadastro') + '" data-link>' + (p.priceCents ? 'Começar grátis e fazer upgrade depois' : 'Criar minha página grátis') + '</a></div>';
    }).join('');

    App.mount(`
<header class="nav"><div class="wrap">${App.logo('/')}
  <nav class="nav-links"><a href="#como-funciona">Como funciona</a><a href="#beneficios">Benefícios</a><a href="#recursos">Funcionalidades</a><a href="#planos">Planos</a><a href="#faq">Dúvidas</a></nav>
  <div class="row">${u ? '<a class="btn btn-primary btn-sm" href="' + panel + '" data-link>Meu painel</a>' : '<a class="btn btn-ghost btn-sm" href="/entrar" data-link>Entrar</a><a class="btn btn-primary btn-sm" href="/cadastro" data-link>Criar conta</a>'}</div>
</div></header>

<section class="hero"><div class="wrap">
  <div>
    <span class="eyebrow">${ic('sparkle')} Feito para profissionais da beleza</span>
    <h1>Sua agenda de beleza, <em>organizada em um só lugar.</em></h1>
    <p class="lead">Crie sua página de agendamento em minutos e compartilhe o link no Instagram, TikTok e WhatsApp. Suas clientes escolhem o procedimento e o horário, e você confirma pelo WhatsApp.</p>
    <div class="cta">${cta}<a class="btn btn-line btn-lg" href="#como-funciona">Ver como funciona</a></div>
    <div class="checks"><span>${ic('check')} Sem cartão de crédito</span><span>${ic('check')} Cliente não precisa de conta</span><span>${ic('check')} Funciona no celular</span></div>
  </div>
  <div aria-hidden="true">
    <div class="phone"><div class="phone-in">
      <div class="mock-cover"></div><div class="mock-av">M</div>
      <div class="mock-body">
        <div style="font-family:var(--serif);font-size:1.25rem">Maria Beauty</div>
        <div class="muted tiny">Design de sobrancelhas · Studio na Vila Mariana</div>
        <div class="mock-svc"><div><b>Design de sobrancelhas</b><span class="muted tiny">30 min · R$ 40,00</span></div><span class="mock-go">Agendar</span></div>
        <div class="mock-svc"><div><b>Design com henna</b><span class="muted tiny">45 min · R$ 55,00</span></div><span class="mock-go">Agendar</span></div>
        <div class="mock-svc"><div><b>Brow lamination</b><span class="muted tiny">1 hora · R$ 120,00</span></div><span class="mock-go">Agendar</span></div>
        <div class="mock-wa">Confirmar pelo WhatsApp</div>
      </div>
    </div></div>
    <p class="tiny muted" style="text-align:center;margin-top:34px">Exemplo ilustrativo de página de agendamento</p>
  </div>
</div></section>

<section class="sec" id="como-funciona"><div class="wrap">
  <div class="sec-head"><h2>Do cadastro ao primeiro agendamento em 4 passos</h2><p>Sem site para criar, sem desenvolvedor para contratar.</p></div>
  <div class="steps">
    <div class="step"><div class="n">1</div><h3>Crie sua conta</h3><p>Cadastre-se grátis e responda ao assistente: seu nome, fotos, WhatsApp e horários.</p></div>
    <div class="step"><div class="n">2</div><h3>Cadastre seus serviços</h3><p>Nome, preço e duração de cada procedimento. Tudo aparece na sua página na hora.</p></div>
    <div class="step"><div class="n">3</div><h3>Compartilhe seu link</h3><p>Coloque o endereço exclusivo na bio do Instagram, TikTok ou mande no WhatsApp.</p></div>
    <div class="step"><div class="n">4</div><h3>Confirme pelo WhatsApp</h3><p>A cliente escolhe o horário livre e abre a conversa já com a mensagem pronta. Você confirma no painel.</p></div>
  </div>
</div></section>

<section class="sec band" id="beneficios"><div class="wrap">
  <div class="sec-head"><h2>Menos mensagens para organizar. Mais tempo para atender.</h2><p>Chega de ficar perguntando “qual horário fica bom?” durante o expediente.</p></div>
  <div class="feat">
    <div class="it"><div class="ic">${ic('clock')}</div><h3>Sem conflito de horários</h3><p>A agenda considera a duração de cada procedimento e nunca oferece um horário ocupado.</p></div>
    <div class="it"><div class="ic">${ic('smartphone')}</div><h3>Pensada para o celular</h3><p>A página abre rápido direto do Instagram ou WhatsApp, sem baixar app nem criar senha.</p></div>
    <div class="it"><div class="ic">${ic('whatsapp')}</div><h3>Do jeito que você já trabalha</h3><p>A conversa continua no seu WhatsApp, com nome, serviço, data e valor já preenchidos.</p></div>
    <div class="it"><div class="ic">${ic('link')}</div><h3>Seu link, sua marca</h3><p>Um endereço só seu, como <b>${esc(location.host)}/maria-beleza</b>. Sem vitrine de outras profissionais.</p></div>
    <div class="it"><div class="ic">${ic('shield')}</div><h3>Você no controle</h3><p>Nada é confirmado sem a sua resposta. Folgas, férias e pausas bloqueiam a agenda automaticamente.</p></div>
    <div class="it"><div class="ic">${ic('users')}</div><h3>Histórico de clientes</h3><p>Veja quem já foi atendida, quantas vezes e quando foi a última visita.</p></div>
  </div>
</div></section>

<section class="sec" id="recursos"><div class="wrap">
  <div class="sec-head"><h2>Tudo que você precisa para a agenda, nada além.</h2></div>
  <div class="feat">
    <div class="it"><div class="ic">${ic('page')}</div><h3>Página pública personalizada</h3><p>Foto, capa, descrição, galeria de trabalhos, endereço e políticas de cancelamento e atraso.</p></div>
    <div class="it"><div class="ic">${ic('scissors')}</div><h3>Serviços e preços</h3><p>Cadastre, edite, pause ou exclua procedimentos. As mudanças aparecem na página automaticamente.</p></div>
    <div class="it"><div class="ic">${ic('calendar')}</div><h3>Agenda por dia, semana e mês</h3><p>Visualize os atendimentos do jeito que preferir e agende clientes manualmente quando precisar.</p></div>
    <div class="it"><div class="ic">${ic('lock')}</div><h3>Reserva temporária</h3><p>Quando a cliente solicita, o horário fica reservado por um tempo configurável até você confirmar.</p></div>
    <div class="it"><div class="ic">${ic('share')}</div><h3>Compartilhe com um toque</h3><p>Copie o link, envie no WhatsApp e gere textos prontos para a bio do Instagram.</p></div>
    <div class="it"><div class="ic">${ic('list')}</div><h3>Status do atendimento</h3><p>Pendente, confirmado, remarcado, cancelado ou concluído. Você atualiza em um toque.</p></div>
  </div>
</div></section>

<section class="sec band" id="planos"><div class="wrap">
  <div class="sec-head"><h2>Planos simples, que crescem com você</h2><p>Comece grátis. Faça upgrade quando precisar de mais recursos.</p></div>
  <div class="plans">${plans}</div>
</div></section>

<section class="sec" id="faq"><div class="wrap">
  <div class="sec-head"><h2>Perguntas frequentes</h2></div>
  <div class="faq">
    <details><summary>O ${esc(App.cfg.siteName)} é um marketplace?</summary><p>Não. É uma ferramenta de agenda individual. Cada profissional tem apenas a sua página e a sua agenda. Não existe busca, catálogo ou comparação entre profissionais: a cliente chega pelo link que você divulgar.</p></details>
    <details><summary>A cliente precisa criar conta?</summary><p>Não. Ela escolhe o serviço, o dia e o horário, informa nome e telefone e confirma pelo WhatsApp.</p></details>
    <details><summary>Como funciona a confirmação pelo WhatsApp?</summary><p>Ao tocar em “Confirmar pelo WhatsApp”, a solicitação é registrada na sua agenda como pendente e o WhatsApp abre com a mensagem pronta. A cliente precisa apertar enviar. O horário só é considerado confirmado quando você aprova no painel.</p></details>
    <details><summary>E se duas clientes escolherem o mesmo horário?</summary><p>Assim que uma solicitação é registrada, o horário fica reservado por um tempo que você define (por padrão, 2 horas). Depois disso, se você não confirmar, ele volta a ficar livre.</p></details>
    <details><summary>Posso usar no Instagram e TikTok?</summary><p>Sim. Basta colocar o link da sua página na bio. Ela foi feita para abrir bem no navegador do próprio Instagram.</p></details>
    <details><summary>Quanto custa?</summary><p>Você pode começar no plano grátis, sem cartão de crédito. Os planos pagos liberam serviços ilimitados, bloqueios de agenda e personalização.</p></details>
  </div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap"><div class="cta-final">
  <h2>Sua próxima cliente está a um link de distância.</h2><p>Crie sua página de agendamento agora. Leva menos de 5 minutos.</p>
  <a class="btn btn-rose btn-lg" href="${panel || '/cadastro'}" data-link>${panel ? 'Ir para o meu painel' : 'Criar minha página grátis'}</a>
</div></div></section>

<footer class="foot"><div class="wrap row between wrap-row">${App.logo('/')}<span>© ${new Date().getFullYear()} ${esc(App.cfg.siteName)} · Agenda online para profissionais da beleza</span></div></footer>`);
  };
})();
