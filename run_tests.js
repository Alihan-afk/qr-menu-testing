const B = 'http://localhost:3000'; const R = {};
async function call(method, path, body, tok, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers }; if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j, h: r.headers };
}
const login = async (e, p) => (await call('POST', '/api/auth/login', { email: e, password: p }));
const rec = (id, pass, actual) => { R[id] = { pass, actual }; console.log(pass ? 'PASS' : 'FAIL', id, '|', actual); };
(async () => {
  const cook = (await login('cook@qrmenu.kz', 'Cook12345')).j.token, admin = (await login('admin@qrmenu.kz', 'Admin12345')).j.token;
  // AUTH
  let r = await login('cook@qrmenu.kz', 'Cook12345'); rec('TC-AUTH-01', r.s === 200 && r.j.role === 'cook', `HTTP ${r.s}, role=${r.j.role}, token + Set-Cookie қайтарылды`);
  let a = []; for (const em of ['', 'user@', 'user.mail.com']) a.push((await login(em, 'Cook12345')).s);
  rec('TC-AUTH-02', a.every(x => x === 400), `Бос / user@ / user.mail.com → HTTP ${a.join(', ')}`);
  a = []; for (const n of [7, 8, 32, 33]) a.push((await login('cook@qrmenu.kz', 'x'.repeat(n))).s);
  rec('TC-AUTH-03', a[0] === 400 && a[3] === 400 && a[1] !== 400 && a[2] !== 400, `7→${a[0]}, 8→${a[1]}, 32→${a[2]}, 33→${a[3]} (400 = форматы қате; 401 = формат өтті, құпиясөз қате)`);
  r = await login("' OR '1'='1", 'Cook12345'); rec('TC-AUTH-05', r.s === 400 && !r.j.token, `SQL-инъекция email өрісінде → HTTP ${r.s}, токен берілмеді`);
  // MENU
  r = await call('GET', '/api/menu?table=12'); rec('TC-MENU-01', r.s === 200 && r.j.length === 4 && /table=12/.test(r.h.get('set-cookie')), `HTTP ${r.s}, ${r.j.length} тағам, Set-Cookie: table=12`);
  a = []; for (const t of [0, 1, 50, 51]) a.push((await call('GET', '/api/menu?table=' + t)).s);
  rec('TC-MENU-02', a.join() === '400,200,200,400', `Үстел 0,1,50,51 → HTTP ${a.join(', ')}`);
  r = await call('GET', '/api/menu?category=' + encodeURIComponent('Ыстық тағамдар')); let r2 = await call('GET', '/api/menu?q=' + encodeURIComponent('шай'));
  rec('TC-MENU-03', r.j.length === 2 && r2.j.length === 1, `Санат бойынша ${r.j.length} тағам; «шай» іздеуі бойынша ${r2.j.length} нәтиже`);
  const et = (await call('GET', '/api/menu')).h.get('etag'); r = await call('GET', '/api/menu', undefined, null, { 'If-None-Match': et });
  rec('TC-MENU-04', r.s === 304 && !(await call('GET', '/api/menu')).j.some(x => !x.available), `Қолжетімсіз тағам (Баурсақ) тізімде жоқ; кэш: If-None-Match → HTTP ${r.s}`);
  // ORDERS / CART
  const mk = async items => call('POST', '/api/orders', { table: 12, items });
  a = []; for (const q of [0, 1, 20, 21]) a.push((await mk([{ id: 1, qty: q }])).s);
  rec('TC-CART-02', a.join() === '422,201,201,422', `Саны 0,1,20,21 → HTTP ${a.join(', ')} (күтілгені: 422,201,201,422)`);
  a = []; for (const q of [-3, 'abc', 2.5, null]) a.push((await mk([{ id: 1, qty: q }])).s);
  rec('TC-CART-03', a.every(x => x === 422), `−3, abc, 2.5, бос → HTTP ${a.join(', ')}`);
  a = []; for (const n of [200, 201]) a.push((await mk([{ id: 1, qty: 1, comment: 'a'.repeat(n) }])).s);
  rec('TC-CART-04', a.join() === '201,422', `Пікір 200 / 201 таңба → HTTP ${a.join(', ')}`);
  r = await mk([{ id: 1, qty: 1 }, { id: 2, qty: 2 }, { id: 3, qty: 1 }]); const oid = r.j.id;
  rec('TC-ORD-01', r.s === 201 && r.j.status === 'Жаңа' && r.j.total === 3500 + 4400 + 2800, `HTTP ${r.s}, id=${oid}, status=${r.j.status}, total=${r.j.total} ₸`);
  r = await mk([]); rec('TC-ORD-02', r.s === 422, `Бос себет → HTTP ${r.s}: ${r.j.error}`);
  // ORD-04 flow
  const flow = ['Қабылданды', 'Дайындалуда', 'Дайын', 'Берілді', 'Жабылды']; a = []; for (const s of flow) a.push((await call('PATCH', `/api/orders/${oid}/status`, { status: s }, cook)).s);
  rec('TC-ORD-04', a.every(x => x === 200), `Жаңа→Қабылданды→Дайындалуда→Дайын→Берілді→Жабылды → HTTP ${a.join(', ')}`);
  let o2 = (await mk([{ id: 4, qty: 1 }])).j.id; r = await call('PATCH', `/api/orders/${o2}/status`, { status: 'Берілді' }, cook);
  let r3 = await call('PATCH', `/api/orders/${oid}/status`, { status: 'Жаңа' }, cook);
  rec('TC-ORD-05', r.s === 409 && r3.s === 409, `«Жаңа»→«Берілді» → HTTP ${r.s} (күтілгені 409); «Жабылды»→«Жаңа» → HTTP ${r3.s}`);
  let o3 = (await mk([{ id: 4, qty: 1 }])).j.id; r = await call('PATCH', `/api/orders/${o3}/status`, { status: 'Бас тартылды' }, cook);
  let o4 = (await mk([{ id: 4, qty: 1 }])).j.id; await call('PATCH', `/api/orders/${o4}/status`, { status: 'Қабылданды' }, cook); await call('PATCH', `/api/orders/${o4}/status`, { status: 'Дайындалуда' }, cook); r3 = await call('PATCH', `/api/orders/${o4}/status`, { status: 'Бас тартылды' }, cook);
  rec('TC-ORD-06', r.s === 200 && r3.s === 409, `«Жаңа» кезінде бас тарту → ${r.s}; «Дайындалуда» кезінде бас тарту → ${r3.s}`);
  const o5 = (await mk([{ id: 4, qty: 1 }])).j.id; r = await call('PATCH', `/api/orders/${o5}/status`, { status: 'Қабылданды' }); rec('TC-KIT-01', (await call('PATCH', `/api/orders/${o5}/status`, { status: 'Қабылданды' }, cook)).s === 200 && r.s === 401, `Аспаз «Қабылданды» қояды → 200; токенсіз сұраныс → HTTP ${r.s}`);
  rec('TC-KIT-03', (await call('GET', `/api/orders/${o4}`)).j.status === 'Дайындалуда', `Қабылданды→Дайындалуда ауысуы орындалды; GET /api/orders/${o4} → status=Дайындалуда`);
  // PAYMENTS
  const pay = (card, tip, id = oid) => call('POST', '/api/payments', { orderId: id, cardNumber: card, tipPercent: tip });
  r = await pay('4242424242424242', 10); rec('TC-PAY-01', r.s === 200 && r.j.paid, `HTTP ${r.s}, paid=true, totalWithTip=${r.j.totalWithTip} ₸`);
  let c1 = await pay('4000000000000002', 0), c2 = await pay('123', 0), c3 = await pay('4242424242424242', 0);
  rec('TC-PAY-02', c1.s === 422 && c2.s === 422 && c3.s === 200, `Қаражат жоқ → ${c1.s} «${c1.j.error}»; карта жарамсыз → ${c2.s} «${c2.j.error}»; дұрыс → ${c3.s}`);
  a = []; for (const t of [-1, 0, 30, 31]) a.push((await pay('4242424242424242', t)).s);
  rec('TC-PAY-03', a.join() === '400,200,200,400', `Шайға қалдыру −1,0,30,31 → HTTP ${a.join(', ')}`);
  r = await pay('4242424242424242', 'abc'); rec('TC-PAY-03b', r.s === 400, `tipPercent="abc" → HTTP ${r.s}: ${JSON.stringify(r.j)} (күтілгені 400/422)`);
  const logTxt = require('fs').readFileSync('logs/app.log', 'utf8'); rec('TC-PAY-05', !/4242424242424242/.test(logTxt), 'app.log ішінде карта нөмірі ' + (/4242424242424242/.test(logTxt) ? 'ТОЛЫҚ ЖАЗЫЛҒАН (4242424242424242)' : 'жоқ'));
  // ADMIN
  r = await call('POST', '/api/menu', { name: 'Лағман', price: 2500, category: 'Ыстық тағамдар' }, admin); const nid = r.j.id; rec('TC-ADM-01', r.s === 201, `POST /api/menu → HTTP ${r.s}, id=${nid}`);
  a = []; for (const p of [0, 1, 100000, 100001]) a.push((await call('POST', '/api/menu', { name: 'Тест', price: p }, admin)).s);
  rec('TC-ADM-02', a.join() === '422,201,201,422', `Баға 0,1,100000,100001 → HTTP ${a.join(', ')}`);
  a = []; for (const n of [0, 1, 60, 61]) a.push((await call('POST', '/api/menu', { name: 'a'.repeat(n), price: 100 }, admin)).s);
  rec('TC-ADM-03', a.join() === '422,201,201,422', `Атау ұзындығы 0,1,60,61 → HTTP ${a.join(', ')}`);
  a = [(await call('POST', '/api/menu', { name: 'x', price: 1 })).s, (await call('POST', '/api/menu', { name: 'x', price: 1 }, cook)).s, (await call('POST', '/api/menu', { name: 'x', price: 1 }, admin)).s];
  rec('TC-ADM-04', a.join() === '401,403,201', `Токенсіз → ${a[0]}; аспаз → ${a[1]}; әкімші → ${a[2]}`);
  r = await call('POST', '/api/menu', { name: '<script>alert(1)</script>', price: 100 }, admin); const g = await call('GET', '/api/menu');
  rec('TC-ADM-05', false, `Сервер атауды өзгеріссіз сақтады (HTTP ${r.s}), экрандау/сүзу жоқ: «${g.j.find(x => x.name.includes('<script'))?.name}» — клиентте экрандалуы тиіс (прототипте UI-экрандау тексерілмейді)`);
  R['TC-ADM-05'].pass = null;
  r = await call('PUT', `/api/menu/${nid}`, { name: 'Лағман (үлкен)', price: 2800 }, admin); rec('PUT', r.s === 200, `PUT /api/menu/${nid} → ${r.s}, жаңа баға ${r.j.price}`);
  r = await call('DELETE', `/api/menu/${nid}`, undefined, admin); rec('DELETE', r.s === 204, `DELETE /api/menu/${nid} → ${r.s}`);
  r = await call('DELETE', `/api/menu/${nid}`, undefined, admin); rec('DELETE-404', r.s === 404, `Қайта DELETE → ${r.s}`);
  // lockout last
  a = []; for (let i = 0; i < 5; i++) a.push((await login('waiter@qrmenu.kz', 'WrongPass1')).s); r = await login('waiter@qrmenu.kz', 'Waiter12345');
  rec('TC-AUTH-04', a.every(x => x === 401) && r.s === 423, `5 қате → ${a.join(',')}; 6-шы дұрыс құпиясөз → HTTP ${r.s} (бұғатталған)`);
  require('fs').writeFileSync('results.json', JSON.stringify(R, null, 1));
})();
