/* Roteador principal */
(function () {
  const App = window.App;
  App.route = async () => {
    App.closeModals();
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const parts = path.split('/').filter(Boolean);
    document.title = App.cfg.siteName + ' — Sua agenda de beleza, organizada em um só lugar';
    if (!App.me) await App.loadMe();
    const u = App.me.user;
    const head = parts[0];
    if (path === '/') return App.views.landing();
    if (head === 'entrar') return u ? App.go(u.role === 'admin' ? '/admin' : '/painel', true) : App.views.login();
    if (head === 'cadastro') return u ? App.go(u.role === 'admin' ? '/admin' : '/painel', true) : App.views.register();
    if (head === 'configurar') { if (!u) return App.go('/entrar', true); if (u.role !== 'pro') return App.go('/admin', true); if (App.me.profile.onboarded) return App.go('/painel', true); return App.views.wizard(); }
    if (head === 'painel') return App.views.dash(parts[1] || '', parts[2]);
    if (head === 'admin') return App.views.admin(parts[1] || '');
    if (parts.length === 1 && !HB.RESERVED.includes(head)) return App.views.book(head.toLowerCase());
    return App.views.book('__none__');
  };

  (async () => {
    try { Object.assign(App.cfg, await App.get('/api/config')); } catch (_) { /* ignore */ }
    App.route();
  })();
})();
