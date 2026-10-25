// QR-Menu — оқу прототипі (тестілеуге арналған). Тек Node.js, сыртқы кітапханасыз.
const http = require('http'), fs = require('fs'), crypto = require('crypto'), path = require('path');
const PORT = process.env.PORT || 3000;
const LOG_DIR = path.join(__dirname, 'logs'); fs.mkdirSync(LOG_DIR, { recursive: true });
const ts = () => new Date().toISOString();
const appLog = (lvl, msg) => fs.appendFileSync(path.join(LOG_DIR, 'app.log'), `${ts()} [${lvl}] ${msg}\n`);
const errLog = (msg) => fs.appendFileSync(path.join(LOG_DIR, 'error.log'), `${ts()} [ERROR] ${msg}\n`);

const users = {
  'cook@qrmenu.kz':   { password: 'Cook12345',  role: 'cook' },
  'waiter@qrmenu.kz': { password: 'Waiter12345', role: 'waiter' },
  'admin@qrmenu.kz':  { password: 'Admin12345', role: 'admin' },
};
const fails = {}; const sessions = {};
let menu = [
  { id: 1, name: 'Бешбармақ', category: 'Ыстық тағамдар', price: 3500, available: true },
  { id: 2, name: 'Манты', category: 'Ыстық тағамдар', price: 2200, available: true },
  { id: 3, name: 'Цезарь салаты', category: 'Салаттар', price: 2800, available: true },
  { id: 4, name: 'Шай', category: 'Сусындар', price: 600, available: true },
  { id: 5, name: 'Баурсақ', category: 'Тәттілер', price: 900, available: false },
];
let nextMenuId = 6, nextOrderId = 1; const orders = {};
const FLOW = { 'Жаңа': ['Қабылданды', 'Бас тартылды'], 'Қабылданды': ['Дайындалуда', 'Бас тартылды'],
  'Дайындалуда': ['Дайын'], 'Дайын': ['Берілді'], 'Берілді': ['Жабылды'], 'Жабылды': [], 'Бас тартылды': [] };

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(data);
}
const err = (res, code, message) => send(res, code, { error: message });
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r(null); } }); }); }
function auth(req) {
  const h = req.headers.authorization || ''; let tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok) { const m = /session=([^;]+)/.exec(req.headers.cookie || ''); tok = m && m[1]; }
  return sessions[tok] || null;
}

async function route(req, res, url, body) {
  const p = url.pathname, m = req.method;
  if (m === 'GET' && p === '/') return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));

  // ---- M1 Авторизация
  if (m === 'POST' && p === '/api/auth/login') {
    const { email, password } = body || {};
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(res, 400, 'Email форматы дұрыс емес');
    if (typeof password !== 'string' || password.length < 8 || password.length > 32) return err(res, 400, 'Құпиясөз 8–32 таңба болуы тиіс');
    if ((fails[email] || 0) >= 5) return err(res, 423, 'Аккаунт уақытша бұғатталған');
    const u = users[email];
    if (!u || u.password !== password) { fails[email] = (fails[email] || 0) + 1; return err(res, 401, 'Email немесе құпиясөз қате'); }
    fails[email] = 0; const token = crypto.randomBytes(12).toString('hex'); sessions[token] = { email, role: u.role };
    return send(res, 200, { token, role: u.role }, { 'Set-Cookie': `session=${token}; HttpOnly; Path=/; Max-Age=3600` });
  }

  // ---- M2 Мәзір (GET, кэш: ETag)
  if (m === 'GET' && p === '/api/menu') {
    const t = url.searchParams.get('table');
    if (t !== null && !(/^\d+$/.test(t) && +t >= 1 && +t <= 50)) return err(res, 400, 'Үстел нөмірі 1–50 аралығында болуы тиіс');
    const cat = url.searchParams.get('category'), q = (url.searchParams.get('q') || '').toLowerCase();
    let list = menu.filter(i => i.available && (!cat || i.category === cat) && i.name.toLowerCase().includes(q));
    const body2 = JSON.stringify(list); const etag = '"' + crypto.createHash('md5').update(body2).digest('hex') + '"';
    const h = { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' };
    if (t) h['Set-Cookie'] = `table=${t}; Path=/; Max-Age=7200`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
    return send(res, 200, list, h);
  }

  // ---- M4 Тапсырыс (POST)
  if (m === 'POST' && p === '/api/orders') {
    const { table, items } = body || {};
    if (!Number.isInteger(table) || table < 1 || table > 50) return err(res, 400, 'Үстел нөмірі 1–50');
    if (!Array.isArray(items) || items.length === 0) return err(res, 422, 'Себет бос');
    let total = 0;
    for (const it of items) {
      const dish = menu.find(d => d.id === it.id);
      if (!dish || !dish.available) return err(res, 422, `Тағам қолжетімсіз: ${it.id}`);
      if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 21) return err(res, 422, 'Саны 1–20 аралығында болуы тиіс'); // BUG-01: шек 20 емес, 21
      if (it.comment && it.comment.length > 200) return err(res, 422, 'Пікір 200 таңбадан аспауы тиіс');
      total += dish.price * it.qty;
    }
    const o = { id: nextOrderId++, table, items, total, status: 'Жаңа', paid: false }; orders[o.id] = o;
    return send(res, 201, o);
  }
  let mm;
  if (m === 'GET' && (mm = /^\/api\/orders\/(\d+)$/.exec(p))) { const o = orders[mm[1]]; return o ? send(res, 200, o) : err(res, 404, 'Тапсырыс табылмады'); }
  if (m === 'PATCH' && (mm = /^\/api\/orders\/(\d+)\/status$/.exec(p))) {
    const u = auth(req); if (!u) return err(res, 401, 'Авторизация қажет');
    if (u.role !== 'cook' && u.role !== 'waiter') return err(res, 403, 'Рұқсат жоқ');
    const o = orders[mm[1]]; if (!o) return err(res, 404, 'Тапсырыс табылмады');
    const to = (body || {}).status;
    if (!(to in FLOW)) return err(res, 400, 'Белгісіз мәртебе');
    const allowed = FLOW[o.status].includes(to) || (o.status === 'Жаңа' && to === 'Берілді'); // BUG-02: «Жаңа» → «Берілді» өтіп кетеді
    if (!allowed) return err(res, 409, `Ауысу рұқсат етілмейді: ${o.status} → ${to}`);
    o.status = to; return send(res, 200, o);
  }

  // ---- M5 Төлем (POST)
  if (m === 'POST' && p === '/api/payments') {
    const { orderId, cardNumber, tipPercent } = body || {};
    const o = orders[orderId]; if (!o) return err(res, 404, 'Тапсырыс табылмады');
    appLog('INFO', `Payment request order=${orderId} card=${cardNumber} tip=${tipPercent}`); // BUG-04: карта нөмірі логқа толық жазылады
    const tip = tipPercent.toFixed(0) * 1; // BUG-03: tipPercent сан болмаса — өңделмеген TypeError → 500
    if (tip < 0 || tip > 30) return err(res, 400, 'Шайға қалдыру 0–30% аралығында болуы тиіс');
    if (!/^\d{16}$/.test(String(cardNumber))) return err(res, 422, 'Карта жарамсыз');
    if (cardNumber === '4000000000000002') return err(res, 422, 'Қаражат жеткіліксіз');
    o.paid = true; o.tip = tip; o.totalWithTip = Math.round(o.total * (1 + tip / 100));
    return send(res, 200, { orderId, paid: true, totalWithTip: o.totalWithTip });
  }

  // ---- M7 Әкімші: POST / PUT / DELETE
  if (p.startsWith('/api/menu') && ['POST', 'PUT', 'DELETE'].includes(m)) {
    const u = auth(req); if (!u) return err(res, 401, 'Авторизация қажет');
    if (u.role !== 'admin') return err(res, 403, 'Тек әкімші');
    const idm = /^\/api\/menu\/(\d+)$/.exec(p);
    const valid = b => b && typeof b.name === 'string' && b.name.length >= 1 && b.name.length <= 60 && Number.isInteger(b.price) && b.price >= 1 && b.price <= 100000;
    if (m === 'POST' && p === '/api/menu') {
      if (!valid(body)) return err(res, 422, 'Атауы 1–60 таңба, баға 1–100000');
      const d = { id: nextMenuId++, name: body.name, category: body.category || 'Ыстық тағамдар', price: body.price, available: true }; menu.push(d); return send(res, 201, d);
    }
    if (idm) {
      const d = menu.find(x => x.id === +idm[1]); if (!d) return err(res, 404, 'Тағам табылмады');
      if (m === 'PUT') { if (!valid(body)) return err(res, 422, 'Атауы 1–60 таңба, баға 1–100000'); Object.assign(d, { name: body.name, price: body.price, category: body.category || d.category, available: body.available !== false }); return send(res, 200, d); }
      if (m === 'DELETE') { menu = menu.filter(x => x.id !== d.id); res.writeHead(204); return res.end(); }
    }
  }
  return err(res, 404, 'Маршрут табылмады');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const t0 = Date.now();
  res.on('finish', () => appLog('INFO', `${req.method} ${url.pathname}${url.search} -> ${res.statusCode} (${Date.now() - t0} ms)`));
  try { const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {}; if (body === null) return err(res, 400, 'JSON форматы қате'); await route(req, res, url, body); }
  catch (e) { errLog(`${req.method} ${url.pathname}\n${e.stack}`); if (!res.headersSent) err(res, 500, 'Серверлік қате'); }
}).listen(PORT, () => appLog('INFO', `QR-Menu server started on port ${PORT}`) || console.log('QR-Menu: http://localhost:' + PORT));
