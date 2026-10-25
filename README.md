# QR-Menu · тестілеуге арналған оқу прототипі

Мейрамхана қонағы үстелдегі QR-код арқылы мәзірді ашып, тапсырыс беретін және төлейтін қосымшаның
**оқу прототипі**. Жоба бағдарламалық қамтамасыз етуді тестілеу курсында қолданылады:
функционалдық тестілеу, API тестілеу (Postman) және жүктемелік тестілеу (Locust).

> Прототип Node.js-те сыртқы кітапханасыз жазылған. Деректер жадта сақталады (деректер қоры жоқ),
> сервер өшірілгенде тапсырыстар жойылады. Төлем нақты емес, тест картасымен эмуляцияланады.
> Кейбір дефектілер **әдейі** қалдырылған (`server.js` ішінде `BUG-0X` комментарийлерімен белгіленген) — тестілеу барысында табу үшін.

## Мүмкіндіктері

| Модуль | Эндпоинт | Әдіс |
|---|---|---|
| Авторизация | `/api/auth/login` | POST |
| Мәзір | `/api/menu?table=12`, `/api/menu`, `/api/menu/{id}` | GET, POST, PUT, DELETE |
| Тапсырыс | `/api/orders`, `/api/orders/{id}`, `/api/orders/{id}/status` | POST, GET, PATCH |
| Төлем | `/api/payments` | POST |
| Қонақ беті | `/?table=12` | GET |

Тест аккаунттары: `cook@qrmenu.kz / Cook12345`, `waiter@qrmenu.kz / Waiter12345`, `admin@qrmenu.kz / Admin12345`.
Тест карталары: `4242424242424242` (сәтті), `4000000000000002` (қаражат жеткіліксіз).

## Талаптар

- [Node.js](https://nodejs.org) 18 немесе одан жоғары (тексерілген нұсқа: v22)
- [Python](https://www.python.org) 3.9+ (тек жүктемелік тестілеу үшін)
- [Postman](https://www.postman.com/downloads) (қалауыңызша, API тесттері үшін)

## Жобаны іске қосу

```bash
git clone https://github.com/Alihan-afk/qr-menu-testing.git
cd qr-menu-testing
node server.js
```

Терминалда `QR-Menu: http://localhost:3000` жазуы шығады. Браузерде ашыңыз: <http://localhost:3000/?table=12>.
Порт өзгерту: `PORT=4000 node server.js` (Windows PowerShell: `$env:PORT=4000; node server.js`).
Сервер жұмысының логтары `logs/app.log` және `logs/error.log` файлдарына жазылады.

## API тесттері

**Postman:** `postman/QR-Menu_Postman_Collection.json` файлын импорттаңыз (File → Import), алдымен `0. Auth` папкасындағы екі Login сұранысын орындаңыз, содан кейін коллекцияны Run collection арқылы іске қосыңыз.
Күтілетін нәтиже: 44 тексерудің 41-і өтеді, 3-еуі сәтсіз (BUG-01, BUG-02, BUG-03 — әдейі қалдырылған дефектілер).

**Консольде:** сервер іске қосулы кезде басқа терминалда `node tests/run_tests.js`.

## Жүктемелік тестілеу (Locust)

```bash
pip install -r requirements.txt
node server.js                                   # бір терминалда
locust -f load-test/locustfile.py                # екінші терминалда, содан кейін http://localhost:8089 ашыңыз
```

Консольде (Web UI-сіз) сатылап өсетін жүктеме, 180 с:

```bash
locust -f load-test/locustfile.py --headless --csv load-test/results/qr --csv-full-history --html load-test/results/report.html
python load-test/make_charts.py qr
```

Шекті жүктемені іздеу (стресс-тест, 2000 қолданушыға дейін, 150 с):

```bash
# Linux / macOS
LOAD_PROFILE=stress locust -f load-test/locustfile.py --headless --csv load-test/results/stress --csv-full-history
# Windows PowerShell
$env:LOAD_PROFILE="stress"; locust -f load-test/locustfile.py --headless --csv load-test/results/stress --csv-full-history
python load-test/make_charts.py stress
```

**Сценарий:** әр виртуалды қонақ мәзірді қарайды (GET /api/menu, салмағы 6), тапсырыс береді (POST /api/orders, 3),
тапсырысты тексереді (GET /api/orders/{id}, 2) және төлейді (POST /api/payments, 1). Әрекеттер арасындағы кідіріс — 0,5–1 с.

### Нәтижелер (қысқаша)

| Қолданушылар | RPS | Медиана, мс | 95%, мс | Қате, % |
|---:|---:|---:|---:|---:|
| 100 | 133 | 1 | 3 | 0 |
| 400 | 529 | 3 | 11 | 0 |
| 600 | 778 | 8 | 70 | 0 |
| 1000 | 954 | 216 | 397 | 0 |
| 2000 | 1005 | 822 | 1270 | 0 |

600 қолданушыға дейін жүйе тұрақты; 1000-нан бастап өткізу қабілеті ~1000 сұраныс/с-та шектеледі, жауап уақыты күрт өседі, бірақ қателер жоқ.
Толық талдау — `load-test/results/` ішіндегі CSV, графиктер және `report.html` файлдары. (Өлшеу ортасы: 1 vCPU, 4 ГБ RAM, сервер мен Locust бір машинада; басқа компьютерде сандар өзгереді.)

## Жоба құрылымы

```
qr-menu-testing/
├── server.js              # REST API сервері (Node.js, сыртқы тәуелділіксіз)
├── index.html             # қонақ беті (мәзір, себет, тапсырыс)
├── package.json
├── tests/                 # API тесттерінің скрипттері (node tests/run_tests.js)
├── postman/               # Postman коллекциясы (34 сұраныс)
├── load-test/
│   ├── locustfile.py      # жүктемелік тест сценарийі
│   ├── make_charts.py     # CSV-ден графиктер жасау
│   └── results/           # CSV, графиктер, HTML-есеп
├── requirements.txt       # Python тәуелділіктері (locust, matplotlib)
└── README.md
```

## Лицензия

MIT. Жоба тек оқу мақсатында жасалған.
