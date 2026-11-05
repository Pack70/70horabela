'use strict';
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const HB = require('./logic.js');
const D = require('./db.js');
const { all, get, run, tx } = D;

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 30;
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

class HttpError extends Error { constructor(status, msg, field) { super(msg); this.status = status; this.field = field; } }
const bad = (msg, field) => new HttpError(400, msg, field);

/* ---------- Utilitários ---------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const buckets = new Map();
const rateLimit = (key, max, windowMs) => {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (b.n > max) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
};
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60000).unref();

const str = (v, max, field, { required = false, min = 0 } = {}) => {
  v = String(v == null ? '' : v).replace(/\r/g, '').trim();
  if (required && !v) throw bad('Campo obrigatório.', field);
  if (v.length < min) throw bad('Texto muito curto.', field);
  if (v.length > max) throw bad('Texto muito longo (máx. ' + max + ' caracteres).', field);
  return v;
};
const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && HB.dstr(HB.parseD(s)) === s;
const validTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const monthStartMs = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

const okUpload = (url, userId) => url === '' || (typeof url === 'string' && new RegExp('^/uploads/' + userId + '/[a-f0-9]{16}\\.(jpg|png|webp)$').test(url));

/* ---------- Mapeamentos ---------- */
const profileOut = (p) => p && ({
  slug: p.slug, name: p.name, business: p.business, bio: p.bio, specialties: p.specialties, address: p.address,
  whatsapp: p.whatsapp, instagram: p.instagram, avatar: p.avatar, cover: p.cover, policies: p.policies, color: p.color,
  minNoticeHours: p.min_notice_hours, maxAdvanceDays: p.max_advance_days, slotStep: p.slot_step, holdMinutes: p.hold_minutes,
  onboarded: !!p.onboarded,
});
const settingsOf = (p) => ({ minNoticeHours: p.min_notice_hours, maxAdvanceDays: p.max_advance_days, slotStep: p.slot_step, holdMinutes: p.hold_minutes });
const hoursOf = (p) => { try { return JSON.parse(p.hours); } catch (_) { return HB.defaultHours(); } };
const serviceOut = (s) => ({ id: s.id, name: s.name, priceCents: s.price_cents, duration: s.duration, description: s.description, photo: s.photo, active: !!s.active });
const blockOut = (b) => ({ id: b.id, startDate: b.start_date, endDate: b.end_date, allDay: !!b.all_day, startTime: b.start_time, endTime: b.end_time, reason: b.reason });
const bookingOut = (b, now) => ({
  id: b.id, serviceId: b.service_id, serviceName: b.service_name, priceCents: b.price_cents, duration: b.duration,
  date: b.date, time: b.time, status: b.status, clientName: b.client_name, clientPhone: b.client_phone, clientId: b.client_id,
  holdExpiresAt: b.hold_expires_at, expired: HB.holdExpired({ status: b.status, holdExpiresAt: b.hold_expires_at }, now),
  source: b.source, createdAt: b.created_at,
});
const logicB = (b) => ({ id: b.id, date: b.date, time: b.time, duration: b.duration, status: b.status, holdExpiresAt: b.hold_expires_at });
const logicBlock = (b) => ({ startDate: b.start_date, endDate: b.end_date, allDay: !!b.all_day, startTime: b.start_time, endTime: b.end_time });

const planOf = async (userId) => {
  const row = await get('SELECT p.* FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ?', userId) || await get("SELECT * FROM plans WHERE id='free'");
  const data = JSON.parse(row.data || '{}');
  return { id: row.id, name: row.name, priceCents: row.price_cents, limits: data.limits || {}, features: data.features || [] };
};
const planPublic = (p) => { const d = JSON.parse(p.data || '{}'); return { id: p.id, name: p.name, priceCents: p.price_cents, tagline: d.tagline || '', highlight: !!d.highlight, features: d.features || [], limits: d.limits || {} }; };

/* ---------- Sessões ---------- */
const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const startSession = async (res, userId) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  addCookie(res, 'hb_sid=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 + (SECURE_COOKIE ? '; Secure' : ''));
};
const addCookie = (res, c) => res.setHeader('Set-Cookie', [].concat(res.getHeader('Set-Cookie') || [], c));
const userFromReq = async (req) => {
  const t = parseCookies(req).hb_sid;
  if (!t) return null;
  const s = await get('SELECT * FROM sessions WHERE token_hash = ?', sha(t));
  if (!s || s.expires_at < Date.now()) return null;
  const u = await get('SELECT * FROM users WHERE id = ?', s.user_id);
  return u ? { ...u, _tokenHash: s.token_hash } : null;
};

/* ---------- Roteador ---------- */
const routes = [];
const route = (method, pattern, auth, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, handler });
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 6 * 1024 * 1024) { reject(new HttpError(413, 'Arquivo muito grande.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (!size) return resolve({});
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_) { reject(bad('JSON inválido.')); }
  });
  req.on('error', reject);
});

const send = (res, status, data, headers = {}) => {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
};

const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'ip';

async function handleApi(req, res, url) {
  const m = req.method;
  let found = null;
  for (const r of routes) {
    if (r.method !== m) continue;
    const mm = r.re.exec(url.pathname);
    if (mm) { found = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(mm[i + 1])])) }; break; }
  }
  if (!found) throw new HttpError(404, 'Rota não encontrada.');
  const { r, params } = found;
  let body = {};
  if (m !== 'GET') {
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Content-Type inválido.');
    body = await readBody(req);
  }
  const user = await userFromReq(req);
  if (r.auth) {
    if (!user) throw new HttpError(401, 'Faça login para continuar.');
    if (user.status !== 'active') throw new HttpError(403, 'Esta conta está suspensa. Fale com o suporte.');
    if (r.auth === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Acesso restrito.');
    if (r.auth === 'pro' && user.role !== 'pro') throw new HttpError(403, 'Acesso restrito às profissionais.');
  }
  const out = await r.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, user, ip: clientIp(req) });
  send(res, 200, out === undefined ? { ok: true } : out);
}

/* =================== AUTENTICAÇÃO =================== */
route('GET', '/api/config', null, async () => {
  const s = await D.getSettings();
  return { siteName: s.siteName, baseUrl: s.baseUrl, supportWhatsapp: s.supportWhatsapp, registrationOpen: s.registrationOpen === '1', plans: (await all('SELECT * FROM plans WHERE active=1 ORDER BY position')).map(planPublic) };
});

route('POST', '/api/auth/register', null, async ({ body, res, ip }) => {
  rateLimit('reg:' + ip, 10, 3600e3);
  if ((await D.getSettings()).registrationOpen !== '1') throw new HttpError(403, 'Os cadastros estão temporariamente fechados.');
  const email = str(body.email, 120, 'email', { required: true }).toLowerCase();
  if (!HB.validEmail(email)) throw bad('E-mail inválido.', 'email');
  const pw = String(body.password || '');
  if (pw.length < 8) throw bad('A senha precisa ter ao menos 8 caracteres.', 'password');
  if (pw.length > 200) throw bad('Senha muito longa.', 'password');
  const name = HB.cleanName(body.name);
  const ne = HB.nameError(name); if (ne) throw bad(ne, 'name');
  if (await get('SELECT 1 FROM users WHERE email = ?', email)) throw bad('Já existe uma conta com esse e-mail.', 'email');
  const id = HB.uid('usr');
  await tx(async () => {
    await run('INSERT INTO users (id,email,pass_hash,role,created_at,last_login_at) VALUES (?,?,?,?,?,?)', id, email, D.hashPassword(pw), 'pro', Date.now(), Date.now());
    await run('INSERT INTO profiles (user_id,name,hours) VALUES (?,?,?)', id, name, JSON.stringify(HB.defaultHours()));
    await run("INSERT INTO subscriptions (user_id,plan_id,started_at) VALUES (?,'free',?)", id, Date.now());
  });
  await startSession(res, id);
  return { ok: true };
});

route('POST', '/api/auth/login', null, async ({ body, res, ip }) => {
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  rateLimit('login:' + ip, 30, 15 * 60e3);
  rateLimit('loginE:' + email, 8, 15 * 60e3);
  const u = await get('SELECT * FROM users WHERE email = ?', email);
  const okPw = D.checkPassword(String(body.password || '').slice(0, 200), u ? u.pass_hash : D.DUMMY_HASH);
  if (!u || !okPw) throw new HttpError(401, 'E-mail ou senha incorretos.');
  if (u.status !== 'active') throw new HttpError(403, 'Esta conta está suspensa. Fale com o suporte.');
  await run('UPDATE users SET last_login_at = ? WHERE id = ?', Date.now(), u.id);
  await startSession(res, u.id);
  return { ok: true, role: u.role };
});

route('POST', '/api/auth/logout', null, async ({ req, res }) => {
  const t = parseCookies(req).hb_sid;
  if (t) await run('DELETE FROM sessions WHERE token_hash = ?', sha(t));
  addCookie(res, 'hb_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
});

route('GET', '/api/me', null, async ({ user }) => {
  if (!user || user.status !== 'active') return { user: null };
  const base = { id: user.id, email: user.email, role: user.role };
  if (user.role === 'admin') return { user: base };
  const p = await get('SELECT * FROM profiles WHERE user_id = ?', user.id);
  const plan = await planOf(user.id);
  const used = (await get('SELECT COUNT(*) n FROM bookings WHERE user_id = ? AND created_at >= ?', user.id, monthStartMs())).n;
  const services = (await get('SELECT COUNT(*) n FROM services WHERE user_id = ?', user.id)).n;
  return { user: base, profile: profileOut(p), plan, usage: { bookingsThisMonth: used, services } };
});

route('POST', '/api/account/password', 'any', async ({ body, user }) => {
  if (!D.checkPassword(String(body.current || ''), user.pass_hash)) throw bad('Senha atual incorreta.', 'current');
  const pw = String(body.next || '');
  if (pw.length < 8 || pw.length > 200) throw bad('A nova senha precisa ter ao menos 8 caracteres.', 'next');
  await run('UPDATE users SET pass_hash = ? WHERE id = ?', D.hashPassword(pw), user.id);
  await run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, user._tokenHash);
});
route('POST', '/api/account/email', 'any', async ({ body, user }) => {
  if (!D.checkPassword(String(body.password || ''), user.pass_hash)) throw bad('Senha incorreta.', 'password');
  const email = str(body.email, 120, 'email', { required: true }).toLowerCase();
  if (!HB.validEmail(email)) throw bad('E-mail inválido.', 'email');
  if (await get('SELECT 1 FROM users WHERE email = ? AND id <> ?', email, user.id)) throw bad('Esse e-mail já está em uso.', 'email');
  await run('UPDATE users SET email = ? WHERE id = ?', email, user.id);
});

/* =================== PERFIL / PÁGINA =================== */
route('GET', '/api/slug-check', 'pro', async ({ query, user }) => {
  const slug = String(query.slug || '').toLowerCase();
  const err = HB.usernameError(slug);
  if (err) return { available: false, message: err };
  const taken = await get('SELECT user_id FROM profiles WHERE slug = ?', slug);
  if (taken && taken.user_id !== user.id) return { available: false, message: 'Esse endereço já está em uso. Tente outro.' };
  return { available: true, message: 'Disponível!' };
});

route('PUT', '/api/profile', 'pro', async ({ body, user }) => {
  const cur = await get('SELECT * FROM profiles WHERE user_id = ?', user.id);
  const plan = await planOf(user.id);
  const f = {};
  if ('slug' in body) {
    const slug = String(body.slug || '').toLowerCase();
    const err = HB.usernameError(slug); if (err) throw bad(err, 'slug');
    const taken = await get('SELECT user_id FROM profiles WHERE slug = ?', slug);
    if (taken && taken.user_id !== user.id) throw bad('Esse endereço já está em uso. Tente outro.', 'slug');
    f.slug = slug;
  }
  if ('name' in body) { const n = HB.cleanName(body.name); const e = HB.nameError(n); if (e) throw bad(e, 'name'); f.name = n; }
  if ('business' in body) f.business = str(body.business, 80, 'business');
  if ('bio' in body) f.bio = str(body.bio, 500, 'bio');
  if ('specialties' in body) f.specialties = str(body.specialties, 200, 'specialties');
  if ('address' in body) f.address = str(body.address, 300, 'address');
  if ('policies' in body) f.policies = str(body.policies, 800, 'policies');
  if ('whatsapp' in body) {
    const raw = String(body.whatsapp || '').trim();
    if (raw === '') f.whatsapp = '';
    else { const ph = HB.normPhone(raw); if (!ph) throw bad('Informe um WhatsApp válido com DDD, ex.: (11) 91234-5678.', 'whatsapp'); f.whatsapp = ph; }
  }
  if ('instagram' in body) { const ig = HB.normInstagram(body.instagram); if (ig === null) throw bad('Instagram inválido.', 'instagram'); f.instagram = ig; }
  for (const k of ['avatar', 'cover']) if (k in body) { if (!okUpload(body[k], user.id)) throw bad('Imagem inválida.', k); f[k] = body[k]; }
  if ('color' in body) {
    const c = String(body.color || '');
    if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw bad('Cor inválida.', 'color');
    if (c && !plan.limits.customColor) throw new HttpError(403, 'A cor personalizada faz parte do plano Premium.');
    f.color = c;
  }
  const num = (k, col, min, max) => { if (k in body) { const v = Number(body[k]); if (!Number.isInteger(v) || v < min || v > max) throw bad('Valor inválido.', k); f[col] = v; } };
  num('minNoticeHours', 'min_notice_hours', 0, 720);
  num('maxAdvanceDays', 'max_advance_days', 1, 365);
  num('holdMinutes', 'hold_minutes', 5, 4320);
  if ('slotStep' in body) { const v = Number(body.slotStep); if (![10, 15, 20, 30, 45, 60].includes(v)) throw bad('Intervalo inválido.', 'slotStep'); f.slot_step = v; }
  if ('hours' in body) f.hours = JSON.stringify(validateHours(body.hours));
  if (body.onboarded === true) {
    const next = { ...cur, ...f };
    if (!next.slug) throw bad('Escolha o endereço da sua página.', 'slug');
    if (!next.whatsapp) throw bad('Informe seu WhatsApp para receber as solicitações.', 'whatsapp');
    f.onboarded = 1;
  }
  const keys = Object.keys(f);
  if (keys.length) await run('UPDATE profiles SET ' + keys.map((k) => k + ' = ?').join(', ') + ' WHERE user_id = ?', ...keys.map((k) => f[k]), user.id);
  return { profile: profileOut(await get('SELECT * FROM profiles WHERE user_id = ?', user.id)) };
});

function validateHours(h) {
  if (!h || typeof h !== 'object') throw bad('Horários inválidos.');
  const out = {};
  for (let i = 0; i < 7; i++) {
    const d = h[i]; if (!d) throw bad('Horários inválidos.');
    const open = !!d.open;
    const o = { open, start: d.start, end: d.end, breakStart: d.breakStart || '', breakEnd: d.breakEnd || '' };
    if (!validTime(o.start) || !validTime(o.end)) throw bad('Horário inválido em ' + HB.WEEKDAYS[i] + '.');
    if (open && HB.toMin(o.start) >= HB.toMin(o.end)) throw bad('Em ' + HB.WEEKDAYS[i] + ', o início precisa ser antes do término.');
    if (o.breakStart || o.breakEnd) {
      if (!validTime(o.breakStart) || !validTime(o.breakEnd)) throw bad('Intervalo inválido em ' + HB.WEEKDAYS[i] + '.');
      if (open && (HB.toMin(o.breakStart) >= HB.toMin(o.breakEnd) || HB.toMin(o.breakStart) < HB.toMin(o.start) || HB.toMin(o.breakEnd) > HB.toMin(o.end))) throw bad('O intervalo de ' + HB.WEEKDAYS[i] + ' precisa estar dentro do expediente.');
    }
    out[i] = o;
  }
  return out;
}

/* ---------- Upload e galeria ---------- */
const MAGIC = [['jpg', [0xff, 0xd8, 0xff]], ['png', [0x89, 0x50, 0x4e, 0x47]], ['webp', null]];
async function saveImage(userId, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad('Envie uma imagem JPG, PNG ou WebP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1.5 * 1024 * 1024) throw bad('Imagem muito grande (máx. 1,5 MB).');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const okMagic = ext === 'webp' ? buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP'
    : MAGIC.find((x) => x[0] === ext)[1].every((b, i) => buf[i] === b);
  if (!okMagic) throw bad('Arquivo de imagem inválido.');
  const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
  await run('INSERT INTO images (path,user_id,mime,data,created_at) VALUES (?,?,?,?,?)', userId + '/' + name, userId, 'image/' + m[1], m[2], Date.now());
  return '/uploads/' + userId + '/' + name;
}
route('POST', '/api/upload', 'pro', async ({ body, user, ip }) => {
  rateLimit('up:' + user.id, 60, 3600e3);
  return { url: await saveImage(user.id, body.dataUrl) };
});
route('POST', '/api/gallery', 'pro', async ({ body, user }) => {
  const plan = await planOf(user.id);
  const n = (await get('SELECT COUNT(*) n FROM gallery WHERE user_id = ?', user.id)).n;
  if (plan.limits.gallery != null && n >= plan.limits.gallery) throw new HttpError(403, 'Seu plano permite até ' + plan.limits.gallery + ' fotos na galeria.');
  const url = await saveImage(user.id, body.dataUrl);
  const id = HB.uid('gal');
  await run('INSERT INTO gallery (id,user_id,url,position) VALUES (?,?,?,?)', id, user.id, url, n);
  return { id, url };
});
route('GET', '/api/gallery', 'pro', async ({ user }) => ({ items: await all('SELECT id,url FROM gallery WHERE user_id = ? ORDER BY position, rowid', user.id) }));
route('DELETE', '/api/gallery/:id', 'pro', async ({ params, user }) => {
  const g = await get('SELECT * FROM gallery WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!g) throw new HttpError(404, 'Foto não encontrada.');
  await run('DELETE FROM gallery WHERE id = ?', g.id);
  await removeUpload(g.url);
});
async function removeUpload(url) { try { if (url && url.startsWith('/uploads/')) await run('DELETE FROM images WHERE path = ?', url.slice(9)); } catch (_) { /* ignore */ } }

/* =================== SERVIÇOS =================== */
function parseService(body, userId) {
  const name = str(body.name, 60, 'name', { required: true, min: 2 });
  const price = Number.isInteger(body.priceCents) ? body.priceCents : null;
  if (price === null || price < 0 || price > 9999900) throw bad('Informe um preço válido.', 'price');
  const duration = Number(body.duration);
  if (!Number.isInteger(duration) || duration < 5 || duration > 720) throw bad('A duração deve ficar entre 5 minutos e 12 horas.', 'duration');
  const photo = body.photo || '';
  if (!okUpload(photo, userId)) throw bad('Imagem inválida.', 'photo');
  return { name, price, duration, description: str(body.description, 300, 'description'), photo, active: body.active === false ? 0 : 1 };
}
route('GET', '/api/services', 'pro', async ({ user }) => ({ items: (await all('SELECT * FROM services WHERE user_id = ? ORDER BY position, created_at', user.id)).map(serviceOut) }));
route('POST', '/api/services', 'pro', async ({ body, user }) => {
  const s = parseService(body, user.id);
  const plan = await planOf(user.id);
  const n = (await get('SELECT COUNT(*) n FROM services WHERE user_id = ?', user.id)).n;
  if (plan.limits.services != null && n >= plan.limits.services) throw new HttpError(403, 'Seu plano permite até ' + plan.limits.services + ' serviços. Faça upgrade para cadastrar mais.');
  const id = HB.uid('svc');
  await run('INSERT INTO services (id,user_id,name,price_cents,duration,description,photo,active,position,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, user.id, s.name, s.price, s.duration, s.description, s.photo, s.active, n, Date.now());
  return { item: serviceOut(await get('SELECT * FROM services WHERE id = ?', id)) };
});
route('PUT', '/api/services/:id', 'pro', async ({ params, body, user }) => {
  const cur = await get('SELECT * FROM services WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!cur) throw new HttpError(404, 'Serviço não encontrado.');
  const s = parseService({ ...serviceOut(cur), ...body }, user.id);
  await run('UPDATE services SET name=?,price_cents=?,duration=?,description=?,photo=?,active=? WHERE id=?', s.name, s.price, s.duration, s.description, s.photo, s.active, cur.id);
  if (cur.photo && cur.photo !== s.photo) await removeUpload(cur.photo);
  return { item: serviceOut(await get('SELECT * FROM services WHERE id = ?', cur.id)) };
});
route('DELETE', '/api/services/:id', 'pro', async ({ params, user }) => {
  const cur = await get('SELECT * FROM services WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!cur) throw new HttpError(404, 'Serviço não encontrado.');
  await run('DELETE FROM services WHERE id = ?', cur.id);
  await removeUpload(cur.photo);
});

/* =================== DISPONIBILIDADE =================== */
route('GET', '/api/availability', 'pro', async ({ user }) => {
  const p = await get('SELECT * FROM profiles WHERE user_id = ?', user.id);
  const today = HB.dstr(new Date());
  return { hours: hoursOf(p), settings: settingsOf(p), blocks: (await all('SELECT * FROM blocks WHERE user_id = ? AND end_date >= ? ORDER BY start_date', user.id, today)).map(blockOut) };
});
route('POST', '/api/blocks', 'pro', async ({ body, user }) => {
  const plan = await planOf(user.id);
  if (plan.id === 'free') throw new HttpError(403, 'Folgas, férias e bloqueios fazem parte do plano Profissional.');
  if (!validDate(body.startDate) || !validDate(body.endDate)) throw bad('Datas inválidas.');
  if (body.endDate < body.startDate) throw bad('A data final precisa ser igual ou posterior à inicial.');
  const allDay = body.allDay !== false;
  let st = '', et = '';
  if (!allDay) {
    if (body.startDate !== body.endDate) throw bad('Bloqueio por horário vale para um único dia.');
    if (!validTime(body.startTime) || !validTime(body.endTime) || HB.toMin(body.startTime) >= HB.toMin(body.endTime)) throw bad('Horários inválidos.');
    st = body.startTime; et = body.endTime;
  }
  const id = HB.uid('blk');
  await run('INSERT INTO blocks (id,user_id,start_date,end_date,all_day,start_time,end_time,reason) VALUES (?,?,?,?,?,?,?,?)', id, user.id, body.startDate, body.endDate, allDay ? 1 : 0, st, et, str(body.reason, 80, 'reason'));
  return { item: blockOut(await get('SELECT * FROM blocks WHERE id = ?', id)) };
});
route('DELETE', '/api/blocks/:id', 'pro', async ({ params, user }) => {
  if (!await get('SELECT 1 FROM blocks WHERE id = ? AND user_id = ?', params.id, user.id)) throw new HttpError(404, 'Bloqueio não encontrado.');
  await run('DELETE FROM blocks WHERE id = ?', params.id);
});

/* =================== AGENDAMENTOS (profissional) =================== */
const slotCtx = async (userId) => {
  const p = await get('SELECT * FROM profiles WHERE user_id = ?', userId);
  return {
    p, hours: hoursOf(p), settings: settingsOf(p),
    bookings: (await all("SELECT * FROM bookings WHERE user_id = ? AND status <> 'cancelled' AND date >= ?", userId, HB.addDays(HB.dstr(new Date()), -1))).map(logicB),
    blocks: (await all('SELECT * FROM blocks WHERE user_id = ?', userId)).map(logicBlock),
  };
};
const ownBooking = async (id, userId) => { const b = await get('SELECT * FROM bookings WHERE id = ? AND user_id = ?', id, userId); if (!b) throw new HttpError(404, 'Agendamento não encontrado.'); return b; };
const upsertClient = async (userId, name, phone) => {
  const c = await get('SELECT * FROM clients WHERE user_id = ? AND phone = ?', userId, phone);
  if (c) { await run('UPDATE clients SET name = ? WHERE id = ?', name, c.id); return c.id; }
  const id = HB.uid('cli');
  await run('INSERT INTO clients (id,user_id,name,phone,created_at) VALUES (?,?,?,?,?)', id, userId, name, phone, Date.now());
  return id;
};

route('GET', '/api/bookings', 'pro', async ({ query, user }) => {
  const now = Date.now();
  const where = ['user_id = ?']; const args = [user.id];
  if (query.from && validDate(query.from)) { where.push('date >= ?'); args.push(query.from); }
  if (query.to && validDate(query.to)) { where.push('date <= ?'); args.push(query.to); }
  if (query.status && HB.STATUS[query.status]) { where.push('status = ?'); args.push(query.status); }
  const rows = await all('SELECT * FROM bookings WHERE ' + where.join(' AND ') + ' ORDER BY date, time LIMIT 1000', ...args);
  return { items: rows.map((b) => bookingOut(b, now)) };
});

route('POST', '/api/bookings', 'pro', async ({ body, user }) => {
  // Agendamento manual feito pela própria profissional (já entra como confirmado).
  const svc = await get('SELECT * FROM services WHERE id = ? AND user_id = ?', String(body.serviceId || ''), user.id);
  if (!svc) throw bad('Escolha um serviço.', 'serviceId');
  if (!validDate(body.date) || !validTime(body.time)) throw bad('Data ou horário inválido.');
  const name = HB.cleanName(body.name); const ne = HB.nameError(name); if (ne) throw bad(ne, 'name');
  const phone = HB.normPhone(body.phone); if (!phone) throw bad('Informe um telefone válido com DDD.', 'phone');
  return await tx(async () => {
    const c = await slotCtx(user.id);
    const slots = HB.computeSlots({ date: body.date, duration: svc.duration, hours: c.hours, settings: c.settings, bookings: c.bookings, blocks: c.blocks, nowMs: Date.now(), ignoreRules: true });
    if (!slots.includes(body.time)) throw bad('Esse horário não está livre na sua agenda.');
    const id = HB.uid('bkg'); const now = Date.now();
    await run('INSERT INTO bookings (id,user_id,client_id,service_id,service_name,price_cents,duration,date,time,status,token,client_name,client_phone,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, user.id, await upsertClient(user.id, name, phone), svc.id, svc.name, svc.price_cents, svc.duration, body.date, body.time, 'confirmed', crypto.randomBytes(12).toString('base64url'), name, phone, 'manual', now, now);
    return { item: bookingOut(await get('SELECT * FROM bookings WHERE id = ?', id), now) };
  });
});

route('PATCH', '/api/bookings/:id/status', 'pro', async ({ params, body, user }) => {
  const status = String(body.status || '');
  if (!HB.STATUS[status] || status === 'rescheduled') throw bad('Status inválido.');
  return await tx(async () => {
    const b = await ownBooking(params.id, user.id);
    const now = Date.now();
    if (status === 'confirmed') {
      const c = await slotCtx(user.id);
      const conflict = HB.hasConflict(logicB(b), c.bookings, c.blocks, c.hours, now);
      if (conflict) throw new HttpError(409, conflict);
    }
    await run('UPDATE bookings SET status = ?, hold_expires_at = ?, updated_at = ? WHERE id = ?', status, status === 'pending' ? now + settingsOf(await get('SELECT * FROM profiles WHERE user_id = ?', user.id)).holdMinutes * 60e3 : null, now, b.id);
    return { item: bookingOut(await get('SELECT * FROM bookings WHERE id = ?', b.id), now) };
  });
});

route('POST', '/api/bookings/:id/reschedule', 'pro', async ({ params, body, user }) => {
  if (!validDate(body.date) || !validTime(body.time)) throw bad('Data ou horário inválido.');
  return await tx(async () => {
    const b = await ownBooking(params.id, user.id);
    const c = await slotCtx(user.id);
    const slots = HB.computeSlots({ date: body.date, duration: b.duration, hours: c.hours, settings: c.settings, bookings: c.bookings, blocks: c.blocks, nowMs: Date.now(), excludeId: b.id, ignoreRules: true });
    if (!slots.includes(body.time)) throw new HttpError(409, 'Esse horário não está livre na sua agenda.');
    const now = Date.now();
    await run("UPDATE bookings SET date = ?, time = ?, status = 'rescheduled', hold_expires_at = NULL, updated_at = ? WHERE id = ?", body.date, body.time, now, b.id);
    return { item: bookingOut(await get('SELECT * FROM bookings WHERE id = ?', b.id), now) };
  });
});

route('GET', '/api/slots', 'pro', async ({ query, user }) => {
  // Horários livres para a profissional remarcar/agendar manualmente (ignora antecedência mínima).
  if (!validDate(query.date)) throw bad('Data inválida.');
  const dur = Number(query.duration);
  if (!Number.isInteger(dur) || dur < 5) throw bad('Duração inválida.');
  const c = await slotCtx(user.id);
  return { slots: HB.computeSlots({ date: query.date, duration: dur, hours: c.hours, settings: c.settings, bookings: c.bookings, blocks: c.blocks, nowMs: Date.now(), excludeId: query.exclude || undefined, ignoreRules: true }) };
});

route('GET', '/api/dashboard', 'pro', async ({ user }) => {
  const now = Date.now(); const today = HB.dstr(new Date());
  const rows = (await all("SELECT * FROM bookings WHERE user_id = ? AND date >= ? AND status <> 'cancelled' ORDER BY date, time", user.id, today)).map((b) => bookingOut(b, now));
  const live = rows.filter((b) => !b.expired && b.status !== 'completed');
  const todayList = rows.filter((b) => b.date === today && !b.expired);
  return {
    today: todayList,
    upcoming: live.filter((b) => b.date > today).slice(0, 6),
    pending: (await all("SELECT * FROM bookings WHERE user_id = ? AND status = 'pending' AND date >= ? ORDER BY date, time", user.id, today)).map((b) => bookingOut(b, now)),
    counts: {
      pending: rows.filter((b) => b.status === 'pending' && !b.expired).length,
      expiredPending: rows.filter((b) => b.expired).length,
      confirmed: rows.filter((b) => b.status === 'confirmed' || b.status === 'rescheduled').length,
      clientsServed: (await get("SELECT COUNT(DISTINCT client_id) n FROM bookings WHERE user_id = ? AND status = 'completed'", user.id)).n,
    },
  };
});

/* =================== CLIENTES =================== */
route('GET', '/api/clients', 'pro', async ({ user }) => ({
  items: (await all(`SELECT c.id, c.name, c.phone, c.notes, c.created_at,
      COUNT(b.id) AS total,
      SUM(CASE WHEN b.status='completed' THEN 1 ELSE 0 END) AS completed,
      MAX(b.date) AS last_date
    FROM clients c LEFT JOIN bookings b ON b.client_id = c.id AND b.status <> 'cancelled'
    WHERE c.user_id = ? GROUP BY c.id ORDER BY last_date DESC, c.name`, user.id))
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, notes: c.notes, total: c.total, completed: c.completed || 0, lastDate: c.last_date })),
}));
route('GET', '/api/clients/:id', 'pro', async ({ params, user }) => {
  const c = await get('SELECT * FROM clients WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!c) throw new HttpError(404, 'Cliente não encontrada.');
  const now = Date.now();
  return { client: { id: c.id, name: c.name, phone: c.phone, notes: c.notes }, bookings: (await all('SELECT * FROM bookings WHERE client_id = ? AND user_id = ? ORDER BY date DESC, time DESC', c.id, user.id)).map((b) => bookingOut(b, now)) };
});
route('PUT', '/api/clients/:id', 'pro', async ({ params, body, user }) => {
  if (!await get('SELECT 1 FROM clients WHERE id = ? AND user_id = ?', params.id, user.id)) throw new HttpError(404, 'Cliente não encontrada.');
  await run('UPDATE clients SET notes = ? WHERE id = ?', str(body.notes, 500, 'notes'), params.id);
});

/* =================== PÁGINA PÚBLICA =================== */
const publicProfile = async (slug) => {
  const p = await get('SELECT p.*, u.status AS ustatus FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.slug = ? AND p.onboarded = 1', String(slug).toLowerCase());
  if (!p || p.ustatus !== 'active') throw new HttpError(404, 'Página não encontrada.');
  return p;
};
route('GET', '/api/public/:slug', null, async ({ params }) => {
  const p = await publicProfile(params.slug);
  const plan = await planOf(p.user_id);
  return {
    profile: { slug: p.slug, name: p.name, business: p.business, bio: p.bio, specialties: p.specialties, address: p.address, instagram: p.instagram, avatar: p.avatar, cover: p.cover, policies: p.policies, color: plan.limits.customColor ? p.color : '', hideBrand: !!plan.limits.hideBrand, minNoticeHours: p.min_notice_hours, maxAdvanceDays: p.max_advance_days },
    services: (await all('SELECT * FROM services WHERE user_id = ? AND active = 1 ORDER BY position, created_at', p.user_id)).map(serviceOut),
    gallery: (await all('SELECT url FROM gallery WHERE user_id = ? ORDER BY position, rowid', p.user_id)).map((g) => g.url),
    hours: Object.fromEntries(Object.entries(hoursOf(p)).map(([k, v]) => [k, { open: v.open, start: v.start, end: v.end }])),
    siteName: (await D.getSettings()).siteName,
  };
});

route('GET', '/api/public/:slug/slots', null, async ({ params, query, ip }) => {
  rateLimit('slots:' + ip, 240, 600e3);
  const p = await publicProfile(params.slug);
  const svc = await get('SELECT * FROM services WHERE id = ? AND user_id = ? AND active = 1', String(query.service || ''), p.user_id);
  if (!svc) throw bad('Serviço indisponível.');
  const c = await slotCtx(p.user_id);
  const now = Date.now(); const today = HB.dstr(new Date(now));
  const days = {};
  for (let i = 0; i <= c.settings.maxAdvanceDays; i++) {
    const date = HB.addDays(today, i);
    const s = HB.computeSlots({ date, duration: svc.duration, hours: c.hours, settings: c.settings, bookings: c.bookings, blocks: c.blocks, nowMs: now });
    if (s.length) days[date] = s;
  }
  return { days, today, maxAdvanceDays: c.settings.maxAdvanceDays };
});

route('POST', '/api/public/:slug/bookings', null, async ({ params, body, ip }) => {
  rateLimit('book:' + ip, 15, 3600e3);
  if (body.website) return { ok: true }; // honeypot
  const p = await publicProfile(params.slug);
  const svc = await get('SELECT * FROM services WHERE id = ? AND user_id = ? AND active = 1', String(body.serviceId || ''), p.user_id);
  if (!svc) throw bad('Esse serviço não está mais disponível.', 'serviceId');
  if (!validDate(body.date) || !validTime(body.time)) throw bad('Escolha uma data e um horário.');
  const name = HB.cleanName(body.name); const ne = HB.nameError(name); if (ne) throw bad(ne, 'name');
  const phone = HB.normPhone(body.phone); if (!phone) throw bad('Informe seu telefone com DDD, ex.: (11) 91234-5678.', 'phone');
  const plan = await planOf(p.user_id);
  if (plan.limits.bookingsPerMonth != null && (await get('SELECT COUNT(*) n FROM bookings WHERE user_id = ? AND created_at >= ?', p.user_id, monthStartMs())).n >= plan.limits.bookingsPerMonth)
    throw new HttpError(409, 'Esta agenda não está recebendo novas solicitações no momento. Fale diretamente com a profissional.');
  if ((await get("SELECT COUNT(*) n FROM bookings WHERE user_id = ? AND client_phone = ? AND status = 'pending' AND hold_expires_at > ?", p.user_id, phone, Date.now())).n >= 3)
    throw new HttpError(429, 'Você já tem solicitações aguardando confirmação com esta profissional.');
  const result = await tx(async () => {
    const c = await slotCtx(p.user_id);
    const now = Date.now();
    const slots = HB.computeSlots({ date: body.date, duration: svc.duration, hours: c.hours, settings: c.settings, bookings: c.bookings, blocks: c.blocks, nowMs: now });
    if (!slots.includes(body.time)) throw new HttpError(409, 'Ops! Esse horário acabou de ser ocupado. Escolha outro, por favor.');
    const id = HB.uid('bkg'); const token = crypto.randomBytes(12).toString('base64url');
    await run('INSERT INTO bookings (id,user_id,client_id,service_id,service_name,price_cents,duration,date,time,status,hold_expires_at,token,client_name,client_phone,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, p.user_id, await upsertClient(p.user_id, name, phone), svc.id, svc.name, svc.price_cents, svc.duration, body.date, body.time, 'pending', now + c.settings.holdMinutes * 60e3, token, name, phone, 'link', now, now);
    return { token, holdMinutes: c.settings.holdMinutes };
  });
  const message = HB.requestMessage({ proName: p.name, clientName: name, serviceName: svc.name, date: body.date, time: body.time, price: svc.price_cents });
  return { token: result.token, holdMinutes: result.holdMinutes, whatsappUrl: HB.waLink(p.whatsapp, message), message };
});

route('GET', '/api/public/:slug/booking/:token', null, async ({ params, ip }) => {
  rateLimit('bk:' + ip, 120, 600e3);
  const p = await publicProfile(params.slug);
  const b = await get('SELECT * FROM bookings WHERE token = ? AND user_id = ?', params.token, p.user_id);
  if (!b) throw new HttpError(404, 'Solicitação não encontrada.');
  const o = bookingOut(b, Date.now());
  const message = HB.requestMessage({ proName: p.name, clientName: b.client_name, serviceName: b.service_name, date: b.date, time: b.time, price: b.price_cents });
  return { booking: { serviceName: o.serviceName, priceCents: o.priceCents, date: o.date, time: o.time, status: o.status, expired: o.expired, clientName: o.clientName }, whatsappUrl: HB.waLink(p.whatsapp, message) };
});

/* =================== ADMIN =================== */
route('GET', '/api/admin/stats', 'admin', async () => {
  const day = Date.now() - 864e5 * 30;
  return {
    professionals: (await get("SELECT COUNT(*) n FROM users WHERE role='pro'")).n,
    active: (await get("SELECT COUNT(*) n FROM users WHERE role='pro' AND status='active'")).n,
    suspended: (await get("SELECT COUNT(*) n FROM users WHERE role='pro' AND status='suspended'")).n,
    newLast30: (await get("SELECT COUNT(*) n FROM users WHERE role='pro' AND created_at >= ?", day)).n,
    published: (await get('SELECT COUNT(*) n FROM profiles WHERE onboarded = 1')).n,
    bookingsTotal: (await get('SELECT COUNT(*) n FROM bookings')).n,
    bookingsMonth: (await get('SELECT COUNT(*) n FROM bookings WHERE created_at >= ?', monthStartMs())).n,
    byPlan: await all("SELECT plan_id, COUNT(*) n FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.role='pro' GROUP BY plan_id"),
    errors24h: (await get('SELECT COUNT(*) n FROM error_logs WHERE at >= ?', Date.now() - 864e5)).n,
  };
});
route('GET', '/api/admin/users', 'admin', async ({ query }) => {
  const q = '%' + String(query.q || '').toLowerCase().replace(/[%_]/g, '') + '%';
  // Somente dados de conta e contagens agregadas: nunca agendas ou clientes.
  return { items: await all(`SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, p.slug, p.name, p.onboarded, s.plan_id,
      (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS bookings,
      (SELECT COUNT(*) FROM services v WHERE v.user_id = u.id) AS services
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id
    WHERE u.role = 'pro' AND (lower(u.email) LIKE ? OR lower(p.name) LIKE ? OR lower(coalesce(p.slug,'')) LIKE ?)
    ORDER BY u.created_at DESC LIMIT 500`, q, q, q) };
});
route('PATCH', '/api/admin/users/:id', 'admin', async ({ params, body }) => {
  const u = await get("SELECT * FROM users WHERE id = ? AND role = 'pro'", params.id);
  if (!u) throw new HttpError(404, 'Conta não encontrada.');
  if (body.status) {
    if (!['active', 'suspended'].includes(body.status)) throw bad('Status inválido.');
    await run('UPDATE users SET status = ? WHERE id = ?', body.status, u.id);
    if (body.status === 'suspended') await run('DELETE FROM sessions WHERE user_id = ?', u.id);
  }
  if (body.planId) {
    if (!await get('SELECT 1 FROM plans WHERE id = ?', body.planId)) throw bad('Plano inexistente.');
    await run('INSERT INTO subscriptions (user_id,plan_id,started_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_id = excluded.plan_id, started_at = excluded.started_at', u.id, body.planId, Date.now());
  }
});
route('GET', '/api/admin/plans', 'admin', async () => ({ items: (await all('SELECT * FROM plans ORDER BY position')).map((p) => ({ ...planPublic(p), active: !!p.active })) }));
route('PUT', '/api/admin/plans/:id', 'admin', async ({ params, body }) => {
  const p = await get('SELECT * FROM plans WHERE id = ?', params.id);
  if (!p) throw new HttpError(404, 'Plano não encontrado.');
  const d = JSON.parse(p.data);
  const price = Number.isInteger(body.priceCents) && body.priceCents >= 0 && body.priceCents <= 9999900 ? body.priceCents : null;
  if (price === null) throw bad('Preço inválido.');
  if (p.id === 'free' && price !== 0) throw bad('O plano gratuito deve custar R$ 0,00.');
  const lim = (v) => (v === null || v === '' || v === undefined ? null : Math.max(0, Math.floor(Number(v)) || 0));
  d.tagline = str(body.tagline, 120, 'tagline');
  d.highlight = !!body.highlight;
  d.features = (Array.isArray(body.features) ? body.features : []).map((f) => str(f, 120, 'features')).filter(Boolean).slice(0, 12);
  d.limits = { ...d.limits, services: lim(body.limits && body.limits.services), bookingsPerMonth: lim(body.limits && body.limits.bookingsPerMonth), gallery: lim(body.limits && body.limits.gallery), customColor: !!(body.limits && body.limits.customColor), hideBrand: !!(body.limits && body.limits.hideBrand) };
  await run('UPDATE plans SET name = ?, price_cents = ?, active = ?, data = ? WHERE id = ?', str(body.name, 40, 'name', { required: true }), price, p.id === 'free' ? 1 : (body.active === false ? 0 : 1), JSON.stringify(d), p.id);
});
route('GET', '/api/admin/logs', 'admin', async () => ({ items: await all('SELECT * FROM error_logs ORDER BY id DESC LIMIT 100') }));
route('DELETE', '/api/admin/logs', 'admin', async () => { await run('DELETE FROM error_logs'); });
route('GET', '/api/admin/settings', 'admin', async () => await D.getSettings());
route('PUT', '/api/admin/settings', 'admin', async ({ body }) => {
  if ('siteName' in body) await D.setSetting('siteName', str(body.siteName, 40, 'siteName', { required: true }));
  if ('registrationOpen' in body) await D.setSetting('registrationOpen', body.registrationOpen ? '1' : '0');
  if ('baseUrl' in body) { const u = str(body.baseUrl, 120, 'baseUrl').replace(/\/+$/, ''); if (u && !/^https?:\/\/[^\s]+$/.test(u)) throw bad('Use o formato https://seudominio.com', 'baseUrl'); await D.setSetting('baseUrl', u); }
  if ('supportWhatsapp' in body) await D.setSetting('supportWhatsapp', str(body.supportWhatsapp, 20, 'supportWhatsapp'));
});

/* =================== ESTÁTICOS E SPA =================== */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function serveFile(res, file, cache) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache, ...SEC });
    res.end(buf);
  });
}
async function serveIndex(res, url) {
  let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const s = await D.getSettings();
  let og = '<title>' + esc(s.siteName) + ' — Sua agenda de beleza, organizada em um só lugar</title><meta name="description" content="Crie sua página de agendamento, compartilhe o link no Instagram e confirme pelo WhatsApp.">';
  const m = /^\/([a-z0-9-]{3,30})\/?$/.exec(url.pathname);
  if (m && !HB.RESERVED.includes(m[1])) {
    const p = await get('SELECT p.* FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.slug = ? AND p.onboarded = 1 AND u.status = \'active\'', m[1]);
    if (p) {
      const title = esc((p.business || p.name) + ' — Agende seu horário');
      const desc = esc(p.bio ? p.bio.slice(0, 160) : 'Escolha seu procedimento e horário online.');
      const base = s.baseUrl || '';
      og = '<title>' + title + '</title><meta name="description" content="' + desc + '"><meta property="og:title" content="' + title + '"><meta property="og:description" content="' + desc + '"><meta property="og:type" content="website">' + (p.avatar ? '<meta property="og:image" content="' + esc(base + p.avatar) + '">' : '');
    }
  }
  html = html.replace('<!--HEAD-->', og);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...SEC });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método não permitido.' });
    if (url.pathname.startsWith('/uploads/')) {
      const img = await get('SELECT mime, data FROM images WHERE path = ?', url.pathname.slice(9));
      if (!img) return send(res, 404, { error: 'Imagem não encontrada.' });
      const buf = Buffer.from(img.data, 'base64');
      res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      return res.end(buf);
    }
    if (url.pathname === '/logic.js') return serveFile(res, path.join(__dirname, 'logic.js'), 'no-cache');
    if (/^\/[\w.-]+\.(js|css|svg|png|ico|txt|webmanifest)$/.test(url.pathname)) return serveFile(res, path.join(PUBLIC_DIR, url.pathname.slice(1)), 'no-cache');
    return await serveIndex(res, url);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) { await D.logError(req.method + ' ' + url.pathname, e); console.error(e); }
    if (!res.headersSent) send(res, status, { error: status >= 500 ? 'Algo deu errado. Tente novamente em instantes.' : e.message, field: e.field });
  }
});

if (require.main === module) {
  (async () => {
    await D.init();
    const admin = await D.seedAdmin();
    server.listen(PORT, () => {
      console.log('Hora Bela rodando em http://localhost:' + PORT + ' (banco: ' + D.MODE + ')');
      if (admin) console.log('Admin criado: ' + admin.email + (admin.generated ? '  senha: ' + admin.password + '  (anote e troque depois)' : ''));
    });
  })().catch((e) => { console.error('Falha ao iniciar:', e); process.exit(1); });
}
module.exports = { server };
