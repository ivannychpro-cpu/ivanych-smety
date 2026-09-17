#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import base64, datetime as dt, hashlib, hmac, http.cookies, http.server, json, os, secrets, sqlite3, threading, time, urllib.parse, urllib.request
from pathlib import Path

BASE=Path(__file__).resolve().parent
STATIC=BASE/'static'
DB=Path(os.environ.get('MOZG_DB_PATH', str(BASE/'mozg_pilot.db')))
CFG=Path(os.environ.get('MOZG_CONFIG_PATH', str(BASE/'config.json')))
DEFAULT={"host":"127.0.0.1","port":8080,"admin_login":"vasiliy","admin_password":"","source_url":"","source_token":"","cache_seconds":60,"session_hours":12,"cookie_secure":False,"allow_demo_fallback":True,"seed_users":[]}
ROLE_LABELS={"owner":"Собственник","business_assistant":"Бизнес-ассистент","finance":"Финансы","accounting":"Бухгалтерия","commercial":"Коммерческий блок","production_head":"Руководитель производства","foreman":"Прораб","sales":"Менеджер продаж","measure":"Замерщик","designer":"Дизайнер","hr":"HR","office":"Офис"}
ROLE_PAGES={
"owner":["org","owner","meetings","production","objects","clients","sales","finance","expenses","design","hr","office","migration","admin"],
"business_assistant":["org","owner","meetings","production","objects","clients","sales","finance","expenses","design","hr","office","migration"],
"finance":["org","finance","expenses","production","objects","clients","migration"],"accounting":["org","finance","expenses","clients"],
"commercial":["org","sales","design","production","objects","clients","meetings","expenses","migration"],
"production_head":["org","production","objects","clients","meetings","design","hr","expenses","migration"],
"foreman":["production","objects","expenses"],"sales":["sales","clients","meetings","expenses"],"measure":["sales","objects","clients","expenses"],"designer":["design","clients","meetings","expenses"],"hr":["org","hr","meetings","production"],"office":["org","office","expenses","objects","clients","finance"]}

# Порядок разделов в меню. Страница доступна роли, если у неё есть право page.<имя>.
PAGE_ORDER=["org","owner","meetings","production","objects","clients","sales","finance","expenses","design","hr","office","migration","admin"]
PAGE_LABELS={"org":"Оргструктура","owner":"Собственнику","meetings":"Совещания","production":"Производство","objects":"Объекты","clients":"Клиенты","sales":"Продажи","finance":"Финансы","expenses":"Подотчёт","design":"Дизайн","hr":"HR","office":"Офис","migration":"Переход","admin":"Пользователи"}
# Точечные права внутри разделов. Собственник всегда имеет все права (защита от блокировки доступа).
PERM_LABELS={
"clients.view":"Клиенты: видеть список",
"clients.edit":"Клиенты: создавать и править",
"clients.requisites":"Клиенты: видеть паспорт / ИНН / счёт",
"clients.archive":"Клиенты: убирать в архив",
"objects.view":"Объекты клиента: видеть",
"objects.edit":"Объекты клиента: создавать и править",
"admin.users":"Пользователи: создавать",
"admin.perms":"Права: настраивать доступы"}
PERM_DEFAULTS={
"owner":list(PERM_LABELS),
"business_assistant":["clients.view","clients.edit","clients.requisites","clients.archive","objects.view","objects.edit"],
"office":["clients.view","clients.edit","clients.requisites","clients.archive","objects.view","objects.edit"],
"commercial":["clients.view","clients.edit","clients.requisites","objects.view","objects.edit"],
"sales":["clients.view","clients.edit","objects.view","objects.edit"],
"measure":["clients.view","clients.edit","objects.view","objects.edit"],
"designer":["clients.view","objects.view"],
"production_head":["clients.view","objects.view"],
"foreman":["objects.view"],
"finance":["clients.view","clients.requisites","objects.view"],
"accounting":["clients.view","clients.requisites","objects.view"],
"hr":[]}
ORG={
"owner":{"name":"Василий Чура","role":"Собственник / генеральный директор","parent":None,"department":"Собственник"},
"polina":{"name":"Полина","role":"Финансы · аутсорс","parent":"owner","department":"Финансы"},
"olesya":{"name":"Олеся","role":"Бухгалтерия · аутсорс","parent":"owner","department":"Бухгалтерия"},
"ekaterina":{"name":"Екатерина Морозова","role":"Бизнес-ассистент","parent":"owner","department":"Собственник"},
"evgenia":{"name":"Евгения Иванова","role":"Офис-менеджер / помощник","parent":"owner","department":"Офис"},
"ksenia":{"name":"Ксения","role":"HR","parent":"owner","department":"HR"},
"darya":{"name":"Дарья Чура","role":"Маркетинг / продажи / дизайн","parent":"owner","department":"Коммерческий блок"},
"nilov":{"name":"Андрей Нилов","role":"Руководитель производства · тестовый период","parent":"owner","department":"Производство"},
"mamin":{"name":"Дмитрий Мамин","role":"Менеджер продаж","parent":"darya","department":"Продажи"},
"elvira":{"name":"Эльвира","role":"Менеджер продаж","parent":"darya","department":"Продажи"},
"arkady":{"name":"Аркадий Береснев","role":"Замерщик","parent":"darya","department":"Продажи"},
"vyacheslav":{"name":"Вячеслав Григорьев","role":"Замерщик","parent":"darya","department":"Продажи"},
"elizaveta":{"name":"Елизавета Сахарцева","role":"Дизайнер","parent":"darya","department":"Дизайн"},
"olga":{"name":"Ольга Марченко","role":"Дизайнер","parent":"darya","department":"Дизайн"},
"kibalov":{"name":"Александр Кибалов","role":"Прораб","parent":"nilov","department":"Производство"},
"dobryansky":{"name":"Дмитрий Добрянский","role":"Прораб","parent":"nilov","department":"Производство"},
"zotov":{"name":"Красс Зотов","role":"Прораб","parent":"nilov","department":"Производство"}}
DEMO={"ok":True,"version":"demo","srez":dt.date.today().isoformat(),"generated":"демо","objects":[{"foreman":"Александр Кибалов","status":"В работе","addr":"Тихорецкий пр., 25","color":"Желтый","reason":"Не успеваем","summa":1118403,"fact":688550,"ostatok":429853,"fmarj":0.296,"end":"2026-09-19","dog":"93","client":"Морев Вениамин","need":True},{"foreman":"Дмитрий Добрянский","status":"В работе","addr":"Софьи Ковалевской, 5","color":"Зеленый","reason":"Все хорошо","summa":319451,"fact":79883,"ostatok":239568,"fmarj":0.453,"end":"2026-09-22","dog":"139","client":"Шаяхметова Надежда","need":False}],"management":{"finance":{"pnl":{"current":{"revenue":2989329,"netProfit":-1736501}},"cash":{"closing":2103473,"safetyFund":66153,"safetyFundSource":"ДДС ФОНД"}},"production":{"plan":8722000,"fact":2762041,"abc":{"A":1068844,"B":0,"C":1473761,"forecastABC":5304646}},"sales":{"planFact":{"month":"Сентябрь 2026","metrics":{"leads":{"plan":None,"fact":360},"measurements":{"plan":None,"fact":11},"contracts":{"plan":None,"fact":4},"measurementToContract":{"plan":None,"fact":0.3636}}}}},"bitrix":{"recent":[]}}
DEMO_MEET={"ok":True,"kind":"bitrixMeetings","generated":"демо","meetings":[{"date":dt.date.today().isoformat()+"T09:00:00","topic":"Ежедневная планёрка по объектам","chatTitle":"ИВАНЫЧ","participants":["Василий Чура","Андрей Нилов"],"categories":["Производство"],"outcomes":["Проверить объекты с риском срыва сроков."],"tasks":["Андрей Нилов: подтвердить план выхода мастеров до 12:00"],"recommendations":[]}]}
CACHE={}; LOCK=threading.Lock()

def load_cfg():
    c=dict(DEFAULT)
    if CFG.exists(): c.update(json.loads(CFG.read_text(encoding='utf-8')))
    return c
CONFIG=load_cfg()
def now(): return dt.datetime.now().replace(microsecond=0).isoformat()
def db():
    c=sqlite3.connect(DB,timeout=10); c.row_factory=sqlite3.Row; c.execute('PRAGMA journal_mode=WAL'); return c

def hpw(p):
    salt=secrets.token_bytes(16); it=180000; h=hashlib.pbkdf2_hmac('sha256',p.encode(),salt,it)
    return f"pbkdf2${it}${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(h).decode()}"
def vpw(p,e):
    try:
        _,it,s,h=e.split('$',3); salt=base64.urlsafe_b64decode(s); exp=base64.urlsafe_b64decode(h); got=hashlib.pbkdf2_hmac('sha256',p.encode(),salt,int(it)); return hmac.compare_digest(got,exp)
    except: return False

def ensure_col(c, table, name, ddl):
    cols={r['name'] for r in c.execute(f'PRAGMA table_info({table})').fetchall()}
    if name not in cols:
        c.execute(f'ALTER TABLE {table} ADD COLUMN {name} {ddl}')

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,login TEXT UNIQUE,password_hash TEXT,name TEXT,role TEXT,scope TEXT DEFAULT '',active INTEGER DEFAULT 1,created_at TEXT);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,csrf TEXT,expires_at TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity TEXT,entity_key TEXT,payload TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS object_updates(id INTEGER PRIMARY KEY,object_key TEXT,status TEXT,reason TEXT,note TEXT,next_date TEXT,created_by INTEGER,created_at TEXT);
        CREATE TABLE IF NOT EXISTS sales_plans(month TEXT PRIMARY KEY,leads INTEGER,measurements INTEGER,contracts INTEGER,updated_by INTEGER,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS payment_requests(id INTEGER PRIMARY KEY,department TEXT,counterparty TEXT,amount REAL,due_date TEXT,reason TEXT,status TEXT,created_by INTEGER,approved_by INTEGER,created_at TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY,expense_date TEXT,direction TEXT DEFAULT 'Расход',amount REAL,source_account TEXT DEFAULT '',counterparty TEXT DEFAULT '',income_category TEXT DEFAULT '',category TEXT,payment_method TEXT,object_key TEXT DEFAULT '',employee TEXT DEFAULT '',tx_type TEXT DEFAULT 'Обычная операция',points_amount REAL DEFAULT 0,proportion REAL DEFAULT 0,payroll_adjustment REAL DEFAULT 0,note TEXT,status TEXT,created_by INTEGER,verified_by INTEGER,created_at TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY,kind TEXT DEFAULT 'person',name TEXT,phone TEXT DEFAULT '',email TEXT DEFAULT '',address TEXT DEFAULT '',passport TEXT DEFAULT '',inn TEXT DEFAULT '',kpp TEXT DEFAULT '',ogrn TEXT DEFAULT '',bank TEXT DEFAULT '',bik TEXT DEFAULT '',account TEXT DEFAULT '',signatory TEXT DEFAULT '',source TEXT DEFAULT '',manager_id INTEGER,note TEXT DEFAULT '',archived INTEGER DEFAULT 0,created_by INTEGER,created_at TEXT,updated_by INTEGER,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS client_objects(id INTEGER PRIMARY KEY,client_id INTEGER,title TEXT,address TEXT DEFAULT '',area REAL DEFAULT 0,ceiling REAL DEFAULT 0,rooms TEXT DEFAULT '[]',measurer TEXT DEFAULT '',designer TEXT DEFAULT '',foreman TEXT DEFAULT '',status TEXT DEFAULT 'Заявка',legacy_key TEXT DEFAULT '',note TEXT DEFAULT '',archived INTEGER DEFAULT 0,created_by INTEGER,created_at TEXT,updated_by INTEGER,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS role_perms(role TEXT,perm TEXT,PRIMARY KEY(role,perm));
        CREATE TABLE IF NOT EXISTS user_perms(user_id INTEGER,perm TEXT,allow INTEGER,PRIMARY KEY(user_id,perm));
        """)
        if c.execute('SELECT COUNT(*) n FROM users').fetchone()['n']==0:
            pw=CONFIG.get('admin_password') or 'CHANGE-ME-NOW'
            c.execute('INSERT INTO users(login,password_hash,name,role,scope,created_at) VALUES(?,?,?,?,?,?)',(CONFIG.get('admin_login') or 'vasiliy',hpw(pw),'Василий Чура','owner','',now()))
            print('Первый логин:',CONFIG.get('admin_login') or 'vasiliy','пароль:',pw)

        ensure_col(c,'expenses','direction',"TEXT DEFAULT 'Расход'")
        ensure_col(c,'expenses','source_account',"TEXT DEFAULT ''")
        ensure_col(c,'expenses','counterparty',"TEXT DEFAULT ''")
        ensure_col(c,'expenses','income_category',"TEXT DEFAULT ''")
        ensure_col(c,'expenses','object_key',"TEXT DEFAULT ''")
        ensure_col(c,'expenses','employee',"TEXT DEFAULT ''")
        ensure_col(c,'expenses','tx_type',"TEXT DEFAULT 'Обычная операция'")
        ensure_col(c,'expenses','points_amount',"REAL DEFAULT 0")
        ensure_col(c,'expenses','proportion',"REAL DEFAULT 0")
        ensure_col(c,'expenses','payroll_adjustment',"REAL DEFAULT 0")

        if c.execute('SELECT COUNT(*) n FROM role_perms').fetchone()['n']==0:
            for role,pages in ROLE_PAGES.items():
                for pg in pages:c.execute('INSERT OR IGNORE INTO role_perms(role,perm) VALUES(?,?)',(role,'page.'+pg))
                for pm in PERM_DEFAULTS.get(role,[]):c.execute('INSERT OR IGNORE INTO role_perms(role,perm) VALUES(?,?)',(role,pm))

        for su in CONFIG.get('seed_users') or []:
            login=str(su.get('login') or '').strip()
            password=str(su.get('password') or '')
            name=str(su.get('name') or '').strip()
            role=str(su.get('role') or '')
            scope=str(su.get('scope') or '').strip()
            if not login or not password or password.startswith('CHANGE_') or not name or role not in ROLE_PAGES:
                continue
            if not c.execute('SELECT 1 FROM users WHERE login=?',(login,)).fetchone():
                c.execute('INSERT INTO users(login,password_hash,name,role,scope,created_at) VALUES(?,?,?,?,?,?)',(login,hpw(password),name,role,scope,now()))

def audit(uid,action,entity,key,payload):
    with db() as c:c.execute('INSERT INTO audit(user_id,action,entity,entity_key,payload,created_at) VALUES(?,?,?,?,?,?)',(uid,action,entity,key,json.dumps(payload,ensure_ascii=False),now()))
def perms_for(u):
    role=u.get('role') or ''
    with db() as c:
        base={r['perm'] for r in c.execute('SELECT perm FROM role_perms WHERE role=?',(role,)).fetchall()}
        ov=[(r['perm'],r['allow']) for r in c.execute('SELECT perm,allow FROM user_perms WHERE user_id=?',(u.get('user_id'),)).fetchall()]
    if not base:
        base={'page.'+p for p in ROLE_PAGES.get(role,[])}|set(PERM_DEFAULTS.get(role,[]))
    for p,a in ov:
        if a:base.add(p)
        else:base.discard(p)
    return base
def pages_for(u,ps=None):
    if u.get('role')=='owner':return list(PAGE_ORDER)
    ps=perms_for(u) if ps is None else ps
    return [p for p in PAGE_ORDER if 'page.'+p in ps]
def has(u,perm,ps=None):
    if u.get('role')=='owner':return True
    return perm in (perms_for(u) if ps is None else ps)
def client_row(r,show_req):
    d=dict(r)
    if not show_req:
        for k in ('passport','inn','kpp','ogrn','bank','bik','account'):
            if d.get(k):d[k]='•••'
        d['_masked']=True
    return d

def okey(o): return 'dog:'+str(o.get('dog')).strip() if o.get('dog') else 'addr:'+' '.join(str(o.get('addr') or '').lower().split())

def fetch(kind='main',fresh=False):
    url=(CONFIG.get('source_url') or '').strip(); tok=(CONFIG.get('source_token') or '').strip(); key=kind; ttl=int(CONFIG.get('cache_seconds') or 60)
    if not url or not tok: return DEMO_MEET if kind=='meetings' else DEMO
    with LOCK:
        r=CACHE.get(key)
        if r and not fresh and time.time()-r[0]<ttl:return r[1]
    q={'token':tok}
    if kind=='meetings':q['meetings']='1'
    if fresh:q['fresh']='1'
    try:
        with urllib.request.urlopen(url+('&' if '?' in url else '?')+urllib.parse.urlencode(q),timeout=75) as r:d=json.loads(r.read().decode())
        with LOCK:CACHE[key]=(time.time(),d)
        return d
    except Exception:
        if CONFIG.get('allow_demo_fallback',True):return DEMO_MEET if kind=='meetings' else DEMO
        raise

def latest_updates():
    with db() as c:rows=c.execute('SELECT ou.*,u.name creator FROM object_updates ou JOIN users u ON u.id=ou.created_by ORDER BY ou.id DESC').fetchall()
    out={}
    for r in rows:
        if r['object_key'] not in out:out[r['object_key']]=dict(r)
    return out

def session(headers):
    ck=http.cookies.SimpleCookie()
    try:ck.load(headers.get('Cookie',''))
    except:return None
    if 'mozg_session' not in ck:return None
    t=ck['mozg_session'].value
    with db() as c:r=c.execute('SELECT s.*,u.login,u.name,u.role,u.scope,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?',(t,)).fetchone()
    if not r or not r['active'] or r['expires_at']<now():return None
    return dict(r)
def new_session(uid):
    t=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(20); exp=(dt.datetime.now()+dt.timedelta(hours=float(CONFIG.get('session_hours') or 12))).replace(microsecond=0).isoformat()
    with db() as c:c.execute('INSERT INTO sessions(token,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)',(t,uid,csrf,exp,now()))
    return t

def live_for(u):
    d=json.loads(json.dumps(fetch('main'),ensure_ascii=False)); up=latest_updates(); objs=[]; scope=(u.get('scope') or '').lower()
    for o in d.get('objects',[]):
        if u['role']=='foreman' and (not scope or scope not in str(o.get('foreman') or '').lower()):continue
        o['_key']=okey(o); x=up.get(o['_key'])
        if x:o['pilotUpdate']={'status':x['status'],'reason':x['reason'],'note':x['note'],'next_date':x['next_date'],'creator':x['creator'],'created_at':x['created_at']}
        objs.append(o)
    d['objects']=objs; d['pilot']={'mode':'hybrid','legacyBridge':'Apps Script → Google Sheets + Bitrix24','internalDb':'SQLite pilot'}; return d

LOGIN='''<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Вход</title><style>body{font-family:Arial;background:#f7f6f2;display:grid;place-items:center;min-height:100vh}form{width:340px;background:#fff;border:1px solid #ddd;border-radius:14px;padding:24px}input,button{width:100%;box-sizing:border-box;padding:10px;margin:5px 0 12px;border-radius:8px;border:1px solid #ddd}button{background:#171b20;color:#fff}.e{color:#a33}</style><form method=post action=/login><h2>Мозг Иваныча</h2><p>Pilot v0.2</p>{err}<input name=login placeholder=Логин required><input type=password name=password placeholder=Пароль required><button>Войти</button></form>'''
class H(http.server.BaseHTTPRequestHandler):
    def sendb(self,b,ct='text/plain; charset=utf-8',st=200,h=None):
        if isinstance(b,str):b=b.encode()
        self.send_response(st); self.send_header('Content-Type',ct); self.send_header('Content-Length',str(len(b))); self.send_header('X-Frame-Options','SAMEORIGIN')
        if h:
            for k,v in h.items():self.send_header(k,v)
        self.end_headers(); self.wfile.write(b)
    def js(self,d,st=200):self.sendb(json.dumps(d,ensure_ascii=False),'application/json; charset=utf-8',st)
    def redir(self,p,c=None):self.sendb(b'',st=302,h={'Location':p,**({'Set-Cookie':c} if c else {})})
    def body(self):return self.rfile.read(int(self.headers.get('Content-Length','0') or 0))
    def user(self):return session(self.headers)
    def need(self):
        u=self.user()
        if not u:self.js({'ok':False,'error':'UNAUTHORIZED'},401)
        return u
    def csrf(self,u):
        if not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),u['csrf']):self.js({'ok':False,'error':'CSRF'},403);return False
        return True
    def do_GET(self):
        path,_,qs=self.path.partition('?')
        if path=='/login':return self.sendb(LOGIN.replace('{err}',''),'text/html; charset=utf-8')
        if path=='/logout':return self.redir('/login','mozg_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
        if path=='/':
            if not self.user():return self.redir('/login')
            return self.sendb((STATIC/'app.html').read_bytes(),'text/html; charset=utf-8')
        u=self.need()
        if not u:return
        if path=='/api/me':
            ps=perms_for(u)
            return self.js({'ok':True,'user':{'id':u['user_id'],'name':u['name'],'login':u['login'],'role':u['role'],'roleLabel':ROLE_LABELS.get(u['role'],u['role']),'scope':u['scope'],'pages':pages_for(u,ps),'perms':sorted(ps),'csrf':u['csrf']},'roles':ROLE_LABELS,'pageLabels':PAGE_LABELS,'permLabels':PERM_LABELS})
        if path=='/api/org':return self.js({'ok':True,'org':ORG})
        if path=='/api/live':return self.js(live_for(u))
        if path=='/api/meetings':return self.js(fetch('meetings'))
        if path=='/api/object-history':
            q=urllib.parse.parse_qs(qs); k=(q.get('object_key') or [''])[0]
            with db() as c:r=c.execute('SELECT ou.*,u.name creator FROM object_updates ou JOIN users u ON u.id=ou.created_by WHERE ou.object_key=? ORDER BY ou.id DESC LIMIT 100',(k,)).fetchall()
            return self.js({'ok':True,'rows':[dict(x) for x in r]})
        if path=='/api/payment-requests':
            with db() as c:r=c.execute('SELECT p.*,u.name creator FROM payment_requests p JOIN users u ON u.id=p.created_by ORDER BY p.id DESC').fetchall()
            return self.js({'ok':True,'rows':[dict(x) for x in r]})
        if path=='/api/expenses':
            with db() as c:
                sql='SELECT e.*,u.name creator FROM expenses e JOIN users u ON u.id=e.created_by '
                args=()
                if u['role'] not in ('owner','finance','business_assistant'):sql+='WHERE e.created_by=? ';args=(u['user_id'],)
                r=c.execute(sql+'ORDER BY e.id DESC',args).fetchall()
            return self.js({'ok':True,'rows':[dict(x) for x in r]})
        if path=='/api/staff':
            with db() as c:r=c.execute('SELECT id,name,role FROM users WHERE active=1 ORDER BY name').fetchall()
            return self.js({'ok':True,'rows':[{'id':x['id'],'name':x['name'],'role':ROLE_LABELS.get(x['role'],x['role'])} for x in r]})
        if path=='/api/clients':
            ps=perms_for(u)
            if not has(u,'clients.view',ps):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            q=urllib.parse.parse_qs(qs); term=(q.get('q') or [''])[0].strip().lower(); arch=1 if (q.get('archived') or ['0'])[0]=='1' else 0
            sql=('SELECT c.*,(SELECT COUNT(*) FROM client_objects o WHERE o.client_id=c.id AND o.archived=0) obj_count,'
                 'mu.name manager_name FROM clients c LEFT JOIN users mu ON mu.id=c.manager_id WHERE c.archived=? ')
            args=[arch]
            if term:
                sql+='AND (lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(c.email) LIKE ? OR lower(c.address) LIKE ?) '
                like='%'+term+'%'; args+=[like,like,like,like]
            with db() as c:rows=c.execute(sql+'ORDER BY c.id DESC LIMIT 500',args).fetchall()
            show=has(u,'clients.requisites',ps)
            return self.js({'ok':True,'rows':[client_row(r,show) for r in rows],'canEdit':has(u,'clients.edit',ps),'canArchive':has(u,'clients.archive',ps),'showRequisites':show,'canObjects':has(u,'objects.edit',ps)})
        if path=='/api/client':
            ps=perms_for(u)
            if not has(u,'clients.view',ps):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            cid=int((urllib.parse.parse_qs(qs).get('id') or [0])[0] or 0)
            with db() as c:
                r=c.execute('SELECT c.*,mu.name manager_name FROM clients c LEFT JOIN users mu ON mu.id=c.manager_id WHERE c.id=?',(cid,)).fetchone()
                if not r:return self.js({'ok':False,'error':'NOT_FOUND'},404)
                objs=[dict(x) for x in c.execute('SELECT * FROM client_objects WHERE client_id=? AND archived=0 ORDER BY id DESC',(cid,)).fetchall()] if has(u,'objects.view',ps) else []
            for o in objs:
                try:o['rooms']=json.loads(o.get('rooms') or '[]')
                except Exception:o['rooms']=[]
            return self.js({'ok':True,'client':client_row(r,has(u,'clients.requisites',ps)),'objects':objs})
        if path=='/api/perms':
            if not has(u,'admin.perms'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            with db() as c:
                rp={}
                for r in c.execute('SELECT role,perm FROM role_perms').fetchall():rp.setdefault(r['role'],[]).append(r['perm'])
                up={}
                for r in c.execute('SELECT user_id,perm,allow FROM user_perms').fetchall():up.setdefault(str(r['user_id']),{})[r['perm']]=r['allow']
            allp=['page.'+x for x in PAGE_ORDER]+list(PERM_LABELS)
            labels={**{'page.'+k:'Раздел: '+v for k,v in PAGE_LABELS.items()},**PERM_LABELS}
            return self.js({'ok':True,'rolePerms':rp,'userPerms':up,'all':allp,'labels':labels,'roles':ROLE_LABELS})
        if path=='/api/users':
            if not has(u,'admin.users'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            with db() as c:r=c.execute('SELECT id,login,name,role,scope,active,created_at FROM users ORDER BY id').fetchall()
            return self.js({'ok':True,'rows':[dict(x) for x in r]})
        return self.sendb('not found',st=404)
    def do_POST(self):
        path=self.path.split('?',1)[0]
        if path=='/login':
            f=urllib.parse.parse_qs(self.body().decode()); login=(f.get('login')or[''])[0]; pw=(f.get('password')or[''])[0]
            with db() as c:r=c.execute('SELECT * FROM users WHERE login=? AND active=1',(login,)).fetchone()
            if not r or not vpw(pw,r['password_hash']):return self.sendb(LOGIN.replace('{err}','<p class=e>Неверный логин или пароль</p>'),'text/html; charset=utf-8',401)
            t=new_session(r['id']); sec='; Secure' if CONFIG.get('cookie_secure') else ''; return self.redir('/','mozg_session='+t+'; Path=/; HttpOnly; SameSite=Lax'+sec)
        u=self.need()
        if not u or not self.csrf(u):return
        try:d=json.loads(self.body().decode() or '{}')
        except:d={}
        if path=='/api/object-update':
            if u['role'] not in ('owner','production_head','foreman'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            k=str(d.get('object_key') or '')
            if u['role']=='foreman':
                scope=(u.get('scope') or '').lower(); obj=next((o for o in fetch('main').get('objects',[]) if okey(o)==k),None)
                if not obj or not scope or scope not in str(obj.get('foreman') or '').lower():return self.js({'ok':False,'error':'OBJECT_FORBIDDEN'},403)
            with db() as c:c.execute('INSERT INTO object_updates(object_key,status,reason,note,next_date,created_by,created_at) VALUES(?,?,?,?,?,?,?)',(k,d.get('status',''),d.get('reason',''),d.get('note',''),d.get('next_date',''),u['user_id'],now()))
            audit(u['user_id'],'update','object',k,d);return self.js({'ok':True})
        if path=='/api/sales-plan':
            if u['role'] not in ('owner','commercial'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            m=d.get('month') or dt.date.today().strftime('%Y-%m'); vals=[d.get(x) for x in ('leads','measurements','contracts')]; vals=[None if v in ('',None) else int(v) for v in vals]
            with db() as c:c.execute('INSERT INTO sales_plans(month,leads,measurements,contracts,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(month) DO UPDATE SET leads=excluded.leads,measurements=excluded.measurements,contracts=excluded.contracts,updated_by=excluded.updated_by,updated_at=excluded.updated_at',(m,*vals,u['user_id'],now()))
            audit(u['user_id'],'upsert','sales_plan',m,d);return self.js({'ok':True})
        if path=='/api/payment-requests':
            if u['role'] not in ('owner','finance','office','commercial','production_head','foreman'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            with db() as c:cur=c.execute('INSERT INTO payment_requests(department,counterparty,amount,due_date,reason,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',(ROLE_LABELS.get(u['role'],u['role']),d.get('counterparty',''),float(d.get('amount') or 0),d.get('due_date',''),d.get('reason',''),'На проверке',u['user_id'],now(),now()));rid=cur.lastrowid
            audit(u['user_id'],'create','payment_request',str(rid),d);return self.js({'ok':True})
        if path=='/api/payment-approve':
            if u['role'] not in ('owner','finance'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            with db() as c:c.execute("UPDATE payment_requests SET status='Подтверждено к оплате',approved_by=?,updated_at=? WHERE id=?",(u['user_id'],now(),int(d.get('id') or 0)))
            return self.js({'ok':True})
        if path=='/api/expenses':
            with db() as c:
                cur=c.execute('INSERT INTO expenses(expense_date,direction,amount,source_account,counterparty,income_category,category,payment_method,object_key,employee,tx_type,points_amount,proportion,payroll_adjustment,note,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (d.get('expense_date') or dt.date.today().isoformat(),d.get('direction') or 'Расход',float(d.get('amount') or 0),d.get('source_account',''),d.get('counterparty',''),d.get('income_category',''),d.get('category',''),d.get('payment_method',''),d.get('object_key',''),d.get('employee',''),d.get('tx_type') or 'Обычная операция',float(d.get('points_amount') or 0),float(d.get('proportion') or 0),float(d.get('payroll_adjustment') or 0),d.get('note',''),'На проверке',u['user_id'],now(),now()))
                rid=cur.lastrowid
            audit(u['user_id'],'create','expense',str(rid),d);return self.js({'ok':True})
        if path=='/api/expense-verify':
            if u['role'] not in ('owner','finance'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            with db() as c:c.execute("UPDATE expenses SET status='Проверено',verified_by=?,updated_at=? WHERE id=?",(u['user_id'],now(),int(d.get('id') or 0)))
            return self.js({'ok':True})
        if path=='/api/client-save':
            if not has(u,'clients.edit'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            name=str(d.get('name') or '').strip()
            if not name:return self.js({'ok':False,'error':'NAME_REQUIRED'},400)
            f=['kind','name','phone','email','address','passport','inn','kpp','ogrn','bank','bik','account','signatory','source','note']
            vals={k:str(d.get(k) or '').strip() for k in f}
            vals['kind']=vals['kind'] if vals['kind'] in ('person','company') else 'person'
            mid=d.get('manager_id'); mid=int(mid) if str(mid or '').isdigit() else None
            cid=int(d.get('id') or 0)
            with db() as c:
                if cid:
                    keep=c.execute('SELECT * FROM clients WHERE id=?',(cid,)).fetchone()
                    if not keep:return self.js({'ok':False,'error':'NOT_FOUND'},404)
                    if not has(u,'clients.requisites'):
                        for k in ('passport','inn','kpp','ogrn','bank','bik','account'):vals[k]=keep[k] or ''
                    c.execute('UPDATE clients SET kind=?,name=?,phone=?,email=?,address=?,passport=?,inn=?,kpp=?,ogrn=?,bank=?,bik=?,account=?,signatory=?,source=?,note=?,manager_id=?,updated_by=?,updated_at=? WHERE id=?',
                        (*[vals[k] for k in f],mid,u['user_id'],now(),cid))
                else:
                    cur=c.execute('INSERT INTO clients(kind,name,phone,email,address,passport,inn,kpp,ogrn,bank,bik,account,signatory,source,note,manager_id,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (*[vals[k] for k in f],mid,u['user_id'],now(),u['user_id'],now()))
                    cid=cur.lastrowid
            audit(u['user_id'],'save','client',str(cid),{'name':name})
            return self.js({'ok':True,'id':cid})
        if path=='/api/client-archive':
            if not has(u,'clients.archive'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            cid=int(d.get('id') or 0); back=1 if d.get('restore') else 0
            with db() as c:c.execute('UPDATE clients SET archived=?,updated_by=?,updated_at=? WHERE id=?',(0 if back else 1,u['user_id'],now(),cid))
            audit(u['user_id'],'restore' if back else 'archive','client',str(cid),{})
            return self.js({'ok':True})
        if path=='/api/object-save':
            if not has(u,'objects.edit'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            cid=int(d.get('client_id') or 0); oid=int(d.get('id') or 0)
            title=str(d.get('title') or '').strip()
            if not cid or not title:return self.js({'ok':False,'error':'TITLE_REQUIRED'},400)
            rooms=d.get('rooms')
            if not isinstance(rooms,list):rooms=[]
            clean=[]
            for r in rooms[:60]:
                if not isinstance(r,dict):continue
                clean.append({'name':str(r.get('name') or '')[:80],'length':float(r.get('length') or 0),'width':float(r.get('width') or 0),
                              'height':float(r.get('height') or 0),'doors':int(float(r.get('doors') or 0)),'windows':int(float(r.get('windows') or 0))})
            txt=['address','measurer','designer','foreman','status','legacy_key','note']
            vals={k:str(d.get(k) or '').strip() for k in txt}
            area=float(d.get('area') or 0); ceil=float(d.get('ceiling') or 0); rj=json.dumps(clean,ensure_ascii=False)
            with db() as c:
                if oid:
                    c.execute('UPDATE client_objects SET title=?,address=?,area=?,ceiling=?,rooms=?,measurer=?,designer=?,foreman=?,status=?,legacy_key=?,note=?,updated_by=?,updated_at=? WHERE id=? AND client_id=?',
                        (title,vals['address'],area,ceil,rj,vals['measurer'],vals['designer'],vals['foreman'],vals['status'] or 'Заявка',vals['legacy_key'],vals['note'],u['user_id'],now(),oid,cid))
                else:
                    cur=c.execute('INSERT INTO client_objects(client_id,title,address,area,ceiling,rooms,measurer,designer,foreman,status,legacy_key,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (cid,title,vals['address'],area,ceil,rj,vals['measurer'],vals['designer'],vals['foreman'],vals['status'] or 'Заявка',vals['legacy_key'],vals['note'],u['user_id'],now(),u['user_id'],now()))
                    oid=cur.lastrowid
            audit(u['user_id'],'save','client_object',str(oid),{'title':title,'client_id':cid})
            return self.js({'ok':True,'id':oid})
        if path=='/api/object-archive':
            if not has(u,'objects.edit'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            oid=int(d.get('id') or 0)
            with db() as c:c.execute('UPDATE client_objects SET archived=1,updated_by=?,updated_at=? WHERE id=?',(u['user_id'],now(),oid))
            audit(u['user_id'],'archive','client_object',str(oid),{})
            return self.js({'ok':True})
        if path=='/api/role-perms':
            if not has(u,'admin.perms'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            role=str(d.get('role') or '')
            if role not in ROLE_LABELS:return self.js({'ok':False,'error':'BAD_ROLE'},400)
            allowed=set(['page.'+x for x in PAGE_ORDER]+list(PERM_LABELS))
            sel=[x for x in (d.get('perms') or []) if x in allowed]
            with db() as c:
                c.execute('DELETE FROM role_perms WHERE role=?',(role,))
                for x in sel:c.execute('INSERT OR IGNORE INTO role_perms(role,perm) VALUES(?,?)',(role,x))
            audit(u['user_id'],'save','role_perms',role,{'count':len(sel)})
            return self.js({'ok':True})
        if path=='/api/user-perms':
            if not has(u,'admin.perms'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            uid=int(d.get('user_id') or 0)
            allowed=set(['page.'+x for x in PAGE_ORDER]+list(PERM_LABELS))
            ov={k:v for k,v in (d.get('overrides') or {}).items() if k in allowed and v in ('allow','deny')}
            with db() as c:
                c.execute('DELETE FROM user_perms WHERE user_id=?',(uid,))
                for k,v in ov.items():c.execute('INSERT OR IGNORE INTO user_perms(user_id,perm,allow) VALUES(?,?,?)',(uid,k,1 if v=='allow' else 0))
            audit(u['user_id'],'save','user_perms',str(uid),{'count':len(ov)})
            return self.js({'ok':True})
        if path=='/api/users':
            if not has(u,'admin.users'):return self.js({'ok':False,'error':'FORBIDDEN'},403)
            try:
                with db() as c:c.execute('INSERT INTO users(login,password_hash,name,role,scope,created_at) VALUES(?,?,?,?,?,?)',(d.get('login',''),hpw(d.get('password','')),d.get('name',''),d.get('role',''),d.get('scope',''),now()))
            except sqlite3.IntegrityError:return self.js({'ok':False,'error':'LOGIN_EXISTS'},409)
            return self.js({'ok':True})
        return self.js({'ok':False,'error':'NOT_FOUND'},404)

def main():
    init_db();host=CONFIG.get('host') or '127.0.0.1';port=int(CONFIG.get('port') or 8080);s=http.server.ThreadingHTTPServer((host,port),H);print(f'Мозг Иваныча Pilot: http://{host}:{port}');s.serve_forever()
if __name__=='__main__':main()
