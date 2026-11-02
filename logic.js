/* Hora Bela — regras de negócio puras (sem DOM). Testadas em test/logic.test.js */
(function (root) {
  'use strict';
  const HB = {};

  const pad = (n) => String(n).padStart(2, '0');
  HB.pad = pad;
  HB.toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  HB.fromMin = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  HB.timeLabel = (t) => { const [h, m] = String(t).split(':'); return h + 'h' + m; };
  HB.durLabel = (min) => {
    if (min < 60) return min + ' minutos';
    const h = Math.floor(min / 60), m = min % 60;
    if (!m) return h === 1 ? '1 hora' : h + ' horas';
    return h + 'h' + pad(m);
  };
  HB.dstr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  HB.parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  HB.addDays = (s, n) => { const d = HB.parseD(s); d.setDate(d.getDate() + n); return HB.dstr(d); };
  HB.weekday = (s) => HB.parseD(s).getDay();
  HB.dateBR = (s) => { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
  HB.WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  HB.WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  HB.MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  HB.brl = (cents) => {
    const v = (Math.round(cents) / 100).toFixed(2);
    const [i, d] = v.split('.');
    return 'R$ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
  };
  HB.parsePrice = (txt) => {
    let s = String(txt).replace(/[^\d.,]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    if (!isFinite(n) || n < 0 || n > 99999) return null;
    return Math.round(n * 100);
  };
  HB.priceInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');

  /* ---------- Validação ---------- */
  HB.RESERVED = ['admin', 'entrar', 'cadastro', 'painel', 'agenda', 'servicos', 'pagina', 'disponibilidade', 'agendamentos', 'clientes', 'configuracoes', 'link', 'mais', 'configurar', 'planos', 'termos', 'privacidade', 'api', 'app', 'login', 'logout', 'www', 'suporte', 'ajuda', 'sobre', 'como-funciona', 'recursos', 'faq', 'home', 'inicio', 'hora-bela', 'horabela', 'comment', 'settings', 'sidebar', 'customize', 'upgrade', 'downloads'];
  HB.slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
  HB.usernameError = (u) => {
    if (!u) return 'Escolha um nome de usuário.';
    if (u.length < 3) return 'Use ao menos 3 caracteres.';
    if (u.length > 30) return 'Use no máximo 30 caracteres.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(u)) return 'Use apenas letras minúsculas, números e hífen.';
    if (HB.RESERVED.includes(u)) return 'Esse nome é reservado. Escolha outro.';
    return null;
  };
  HB.normPhone = (txt) => {
    let d = String(txt || '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) return null;
    const ddd = Number(d.slice(0, 2));
    if (ddd < 11 || ddd > 99) return null;
    if (d.length === 11 && d[2] !== '9') return null;
    return d;
  };
  HB.fmtPhone = (d) => {
    if (!d) return '';
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  };
  HB.waLink = (nationalPhone, text) => 'https://wa.me/55' + nationalPhone + (text ? '?text=' + encodeURIComponent(text) : '');
  HB.validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
  HB.normInstagram = (v) => {
    let s = String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : (s === '' ? '' : null);
  };
  HB.cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim();
  HB.nameError = (n) => {
    n = HB.cleanName(n);
    if (n.length < 2) return 'Informe o nome.';
    if (n.length > 60) return 'Nome muito longo.';
    return null;
  };

  /* ---------- Planos e padrões ---------- */
  HB.DEFAULT_PLANS = [
    { id: 'free', name: 'Grátis', priceCents: 0, active: true, tagline: 'Para começar a organizar sua agenda.',
      limits: { services: 5, bookingsPerMonth: 30, gallery: 6, customColor: false, hideBrand: false },
      features: ['Página de agendamento com link próprio', 'Até 5 serviços', 'Até 30 solicitações por mês', 'Confirmação pelo WhatsApp', 'Galeria com 6 fotos'] },
    { id: 'pro', name: 'Profissional', priceCents: 2990, active: true, highlight: true, tagline: 'Agenda completa para o dia a dia.',
      limits: { services: null, bookingsPerMonth: null, gallery: 12, customColor: false, hideBrand: false },
      features: ['Serviços ilimitados', 'Solicitações ilimitadas', 'Folgas, férias e bloqueios', 'Histórico de clientes', 'Galeria com 12 fotos'] },
    { id: 'premium', name: 'Premium', priceCents: 5990, active: true, tagline: 'Sua página com a sua cara.',
      limits: { services: null, bookingsPerMonth: null, gallery: 30, customColor: true, hideBrand: true },
      features: ['Tudo do Profissional', 'Cor personalizada na página', 'Sem a marca Hora Bela', 'Galeria com 30 fotos', 'Prioridade no suporte'] },
  ];
  HB.defaultHours = () => {
    const h = {};
    for (let i = 0; i < 7; i++) h[i] = { open: i >= 1 && i <= 5, start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' };
    h[6] = { open: false, start: '09:00', end: '14:00', breakStart: '', breakEnd: '' };
    return h;
  };
  HB.defaultSettings = () => ({ minNoticeHours: 2, maxAdvanceDays: 60, slotStep: 30, holdMinutes: 120 });
  HB.HOLD_OPTIONS = [30, 60, 120, 360, 720, 1440];
  HB.holdLabel = (m) => m < 60 ? m + ' minutos' : m === 60 ? '1 hora' : m < 1440 ? (m / 60) + ' horas' : '24 horas';

  HB.STATUS = {
    pending: { label: 'Pendente de confirmação', short: 'Pendente', tone: 'warn' },
    confirmed: { label: 'Confirmado', short: 'Confirmado', tone: 'ok' },
    cancelled: { label: 'Cancelado', short: 'Cancelado', tone: 'bad' },
    rescheduled: { label: 'Remarcado', short: 'Remarcado', tone: 'rose' },
    completed: { label: 'Concluído', short: 'Concluído', tone: 'ink' },
  };

  /* ---------- Agenda ---------- */
  // Um agendamento ocupa o horário se estiver confirmado/remarcado/concluído
  // ou se estiver pendente com o bloqueio temporário ainda válido.
  HB.isBlocking = (b, nowMs) => {
    if (b.status === 'pending') return (b.holdExpiresAt || 0) > nowMs;
    return b.status === 'confirmed' || b.status === 'rescheduled' || b.status === 'completed';
  };
  HB.holdExpired = (b, nowMs) => b.status === 'pending' && (b.holdExpiresAt || 0) <= nowMs;
  HB.overlaps = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;

  HB.blockCoversDate = (blk, date) => date >= blk.startDate && date <= blk.endDate;

  // opts: { date, duration, hours, settings, bookings, blocks, nowMs, excludeId, ignoreRules }
  HB.computeSlots = (o) => {
    const { date, duration, hours, settings, bookings, blocks, nowMs, excludeId, ignoreRules } = o;
    if (!duration || duration < 5) return [];
    const day = hours && hours[HB.weekday(date)];
    if (!day || !day.open) return [];
    const today = HB.dstr(new Date(nowMs));
    if (!ignoreRules && date > HB.addDays(today, settings.maxAdvanceDays)) return [];
    if (date < today) return [];
    const busy = [];
    for (const blk of blocks || []) {
      if (!HB.blockCoversDate(blk, date)) continue;
      if (blk.allDay) return [];
      busy.push([HB.toMin(blk.startTime), HB.toMin(blk.endTime)]);
    }
    for (const b of bookings || []) {
      if (b.date !== date || b.id === excludeId || !HB.isBlocking(b, nowMs)) continue;
      const s = HB.toMin(b.time);
      busy.push([s, s + b.duration]);
    }
    if (day.breakStart && day.breakEnd) busy.push([HB.toMin(day.breakStart), HB.toMin(day.breakEnd)]);
    const start = HB.toMin(day.start), end = HB.toMin(day.end), step = settings.slotStep || 30;
    const out = [];
    const earliest = nowMs + (ignoreRules ? 0 : settings.minNoticeHours * 3600e3);
    const [y, mo, d] = date.split('-').map(Number);
    for (let t = start; t + duration <= end; t += step) {
      if (busy.some(([b0, b1]) => HB.overlaps(t, t + duration, b0, b1))) continue;
      if (new Date(y, mo - 1, d, Math.floor(t / 60), t % 60).getTime() < earliest) continue;
      out.push(HB.fromMin(t));
    }
    return out;
  };

  // Confirmar uma solicitação cujo bloqueio expirou exige que o horário ainda esteja livre.
  HB.hasConflict = (booking, bookings, blocks, hours, nowMs) => {
    const day = hours && hours[HB.weekday(booking.date)];
    const s = HB.toMin(booking.time), e = s + booking.duration;
    for (const blk of blocks || []) {
      if (!HB.blockCoversDate(blk, booking.date)) continue;
      if (blk.allDay || HB.overlaps(s, e, HB.toMin(blk.startTime), HB.toMin(blk.endTime))) return 'Esse horário está bloqueado na sua agenda.';
    }
    for (const b of bookings) {
      if (b.id === booking.id || b.date !== booking.date || !HB.isBlocking(b, nowMs)) continue;
      const bs = HB.toMin(b.time);
      if (HB.overlaps(s, e, bs, bs + b.duration)) return 'Esse horário já está ocupado por outro agendamento.';
    }
    return null;
  };

  /* ---------- Mensagens ---------- */
  HB.firstName = (n) => HB.cleanName(n).split(' ')[0] || '';
  HB.requestMessage = (p) =>
    'Olá, ' + HB.firstName(p.proName) + '! Gostaria de solicitar um agendamento.\n\n' +
    'Nome: ' + p.clientName + '\n' +
    'Procedimento: ' + p.serviceName + '\n' +
    'Data: ' + HB.dateBR(p.date) + '\n' +
    'Horário: ' + HB.timeLabel(p.time) + '\n' +
    'Valor: ' + HB.brl(p.price) + '\n\n' +
    'Aguardo a confirmação. Obrigada!';
  HB.confirmMessage = (p) =>
    'Olá, ' + HB.firstName(p.clientName) + '! Seu horário de ' + p.serviceName + ' está confirmado para ' +
    HB.WEEKDAYS_SHORT[HB.weekday(p.date)] + ', ' + HB.dateBR(p.date) + ', às ' + HB.timeLabel(p.time) + '. Te espero! 💗';
  HB.rescheduleMessage = (p) =>
    'Olá, ' + HB.firstName(p.clientName) + '! Precisei remarcar seu horário de ' + p.serviceName + ' para ' +
    HB.dateBR(p.date) + ', às ' + HB.timeLabel(p.time) + '. Pode me confirmar se fica bom pra você?';
  HB.cancelMessage = (p) =>
    'Olá, ' + HB.firstName(p.clientName) + '! Infelizmente não vou conseguir atender seu horário de ' + p.serviceName +
    ' em ' + HB.dateBR(p.date) + ', às ' + HB.timeLabel(p.time) + '. Podemos escolher outro dia?';
  HB.bioTexts = (name) => [
    'Agende seu horário online 💗\nEscolha seu procedimento e horário no link abaixo.',
    name + ' ✨ Beleza com hora marcada\nAgende pelo link e receba a confirmação no WhatsApp.',
    'Agenda aberta 🗓️\nToque no link, escolha o serviço e o melhor horário pra você.',
  ];
  HB.shareText = (name, url) => 'Agende seu horário com ' + name + ' pelo link: ' + url;

  HB.contrastOn = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.42 ? '#1b1517' : '#ffffff';
  };

  HB.uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  if (typeof module !== 'undefined' && module.exports) module.exports = HB; else root.HB = HB;
})(typeof window !== 'undefined' ? window : globalThis);
