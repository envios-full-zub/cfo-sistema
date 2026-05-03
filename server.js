const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cfo-sistema-secret-2026';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// DB
const DB_PATH = process.env.DB_PATH || './data/cfo.db';
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meses (
    id TEXT PRIMARY KEY,
    comp TEXT NOT NULL,
    canal TEXT NOT NULL,
    fat REAL DEFAULT 0,
    custo REAL DEFAULT 0,
    mc REAL DEFAULT 0,
    imp REAL DEFAULT 0,
    tar REAL DEFAULT 0,
    frC REAL DEFAULT 0,
    frV REAL DEFAULT 0,
    encargos REAL DEFAULT 0,
    vendas REAL DEFAULT 0,
    nPed INTEGER DEFAULT 0,
    qtd INTEGER DEFAULT 0,
    cancelados INTEGER DEFAULT 0,
    ajuste_imp_original REAL DEFAULT 0,
    ajuste_imp_corrigido REAL DEFAULT 0,
    ajuste_imp_economia REAL DEFAULT 0,
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(comp, canal)
  );
  CREATE TABLE IF NOT EXISTS lancamentos (
    id TEXT PRIMARY KEY,
    mes_id TEXT NOT NULL,
    descricao TEXT NOT NULL,
    linha_dre TEXT NOT NULL,
    categoria TEXT DEFAULT '',
    subcategoria TEXT DEFAULT '',
    valor REAL NOT NULL,
    recorrencia TEXT DEFAULT 'variavel',
    competencia TEXT DEFAULT '',
    obs TEXT DEFAULT '',
    bloqueado INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mes_id) REFERENCES meses(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// Seed usuários padrão
const seed = db.prepare('SELECT COUNT(*) as n FROM usuarios').get();
if (seed.n === 0) {
  const senha = bcrypt.hashSync('cfo2026', 10);
  db.prepare("INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, ?)").run('Daniel (CEO)', 'daniel@empresa.com', senha, 'admin');
  db.prepare("INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, ?)").run('Rafaela (CEO)', 'rafaela@empresa.com', senha, 'admin');
  db.prepare("INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, ?)").run('Amauri (Gestão)', 'amauri@empresa.com', senha, 'viewer');
  console.log('Usuários criados: daniel@empresa.com / rafaela@empresa.com / amauri@empresa.com — senha: cfo2026');
}

app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// AUTH MIDDLEWARE
function auth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  next();
}

// ── AUTH ROUTES ──
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(senha, user.senha)) return res.status(401).json({ error: 'Email ou senha incorretos' });
  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
  res.json({ ok: true, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json(req.user);
});

// ── MESES ──
app.get('/api/meses', auth, (req, res) => {
  const meses = db.prepare('SELECT * FROM meses ORDER BY comp DESC').all();
  res.json(meses);
});

app.get('/api/meses/:id/lancamentos', auth, (req, res) => {
  const lancs = db.prepare('SELECT * FROM lancamentos WHERE mes_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(lancs);
});

app.post('/api/meses', auth, adminOnly, (req, res) => {
  const m = req.body;
  try {
    db.prepare(`INSERT OR REPLACE INTO meses (id,comp,canal,fat,custo,mc,imp,tar,frC,frV,encargos,vendas,nPed,qtd,cancelados,ajuste_imp_original,ajuste_imp_corrigido,ajuste_imp_economia,obs)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      m.id, m.comp, m.canal, m.fat||0, m.custo||0, m.mc||0, m.imp||0, m.tar||0,
      m.frC||0, m.frV||0, m.encargos||0, m.vendas||0, m.nPed||0, m.qtd||0, m.cancelados||0,
      m.ajusteImposto?.impOriginal||0, m.ajusteImposto?.impCorrigido||0, m.ajusteImposto?.economiaImposto||0, m.obs||''
    );
    // Salvar lançamentos
    if (m.lancamentos?.length) {
      db.prepare('DELETE FROM lancamentos WHERE mes_id = ?').run(m.id);
      const ins = db.prepare(`INSERT INTO lancamentos (id,mes_id,descricao,linha_dre,categoria,subcategoria,valor,recorrencia,competencia,obs,bloqueado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const insMany = db.transaction((lancs) => { for (const l of lancs) ins.run(l.id,m.id,l.descricao||l.desc,l.linha_dre||l.dre,l.categoria||l.cat||'',l.subcategoria||l.subcat||'',l.valor||l.val||0,l.recorrencia||l.rec||'variavel',l.competencia||l.comp||m.comp,l.obs||'',l.bloqueado?1:0); });
      insMany(m.lancamentos);
    }
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/meses/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM lancamentos WHERE mes_id = ?').run(req.params.id);
  db.prepare('DELETE FROM meses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── LANÇAMENTOS ──
app.post('/api/lancamentos', auth, adminOnly, (req, res) => {
  const l = req.body;
  try {
    db.prepare(`INSERT INTO lancamentos (id,mes_id,descricao,linha_dre,categoria,subcategoria,valor,recorrencia,competencia,obs,bloqueado)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(l.id,l.mes_id,l.descricao,l.linha_dre,l.categoria||'',l.subcategoria||'',l.valor,l.recorrencia||'variavel',l.competencia||'',l.obs||'',l.bloqueado?1:0);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/lancamentos/:id', auth, adminOnly, (req, res) => {
  const l = req.body;
  db.prepare(`UPDATE lancamentos SET descricao=?,linha_dre=?,categoria=?,subcategoria=?,valor=?,recorrencia=?,obs=? WHERE id=?`)
    .run(l.descricao,l.linha_dre,l.categoria||'',l.subcategoria||'',l.valor,l.recorrencia||'variavel',l.obs||'',req.params.id);
  res.json({ ok: true });
});

app.delete('/api/lancamentos/:id', auth, adminOnly, (req, res) => {
  const l = db.prepare('SELECT bloqueado FROM lancamentos WHERE id=?').get(req.params.id);
  if (l?.bloqueado) return res.status(403).json({ error: 'Lançamento bloqueado' });
  db.prepare('DELETE FROM lancamentos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── IMPORT EXCEL ──
const SHOPEE_ALIQ = 0.03;

function nNum(v) { return parseFloat(String(v||0).replace(/[^\d.-]/g,''))||0; }
function sumF(arr,k) { return arr.reduce((s,r)=>s+(r[k]||0),0); }

function parseML(rows) {
  const ap = rows.filter(r=>['Pago','Devolução Parcial'].includes(r['Status Pedido']));
  const nc = ['Faturamento ML','Custo (-)','Imposto (-)','Tarifa de Venda (-)','Frete Comprador (-)','Frete Vendedor (-)','Margem Contrib. (=)','Qtd.'];
  ap.forEach(r=>nc.forEach(c=>{if(r[c]!==undefined)r[c]=nNum(r[c]);}));
  const fat=sumF(ap,'Faturamento ML'),custo=sumF(ap,'Custo (-)'),imp=sumF(ap,'Imposto (-)');
  const tar=sumF(ap,'Tarifa de Venda (-)'),frC=sumF(ap,'Frete Comprador (-)'),frV=sumF(ap,'Frete Vendedor (-)');
  const mc=sumF(ap,'Margem Contrib. (=)'),qtd=Math.round(sumF(ap,'Qtd.')),nPed=ap.length;
  return {fat,custo,imp,tar,frC,frV,mc,qtd,nPed,vendas:fat-frC,encargos:imp+tar+frV-frC,cancelados:rows.filter(r=>r['Status Pedido']==='Cancelado').length,ajusteImposto:null};
}

function parseSH(rows) {
  const nc = ['Faturamento SHP','Valor Unit.','Custo (-)','Imposto (-)','Cupom (-)','Comissão Afiliado (-)','Tarifa de Venda (-)','Ajustes da Shopee (-/+)','Rebate Shopee (+)','Frete Comprador (-)','Frete Vendedor (-)','Margem Contrib. (=)','Qtde.'];
  rows.forEach(r=>nc.forEach(c=>{if(r[c]!==undefined)r[c]=nNum(r[c]);}));
  let impOrig=0,impCorr=0;
  rows.forEach(r=>{
    const vu=r['Valor Unit.']||0,ia=r['Imposto (-)']||0,i3=vu*SHOPEE_ALIQ;
    r['Imposto (-)']=i3; r['Margem Contrib. (=)']=(r['Margem Contrib. (=)']||0)+(ia-i3);
    impOrig+=ia; impCorr+=i3;
  });
  const fat=sumF(rows,'Faturamento SHP'),custo=sumF(rows,'Custo (-)'),imp=sumF(rows,'Imposto (-)');
  const cupom=sumF(rows,'Cupom (-)'),afiliado=sumF(rows,'Comissão Afiliado (-)');
  const tar=sumF(rows,'Tarifa de Venda (-)'),ajustes=sumF(rows,'Ajustes da Shopee (-/+)'),rebate=sumF(rows,'Rebate Shopee (+)');
  const frC=sumF(rows,'Frete Comprador (-)'),frV=sumF(rows,'Frete Vendedor (-)'),mc=sumF(rows,'Margem Contrib. (=)');
  const qtd=Math.round(sumF(rows,'Qtde.')),nPed=rows.length;
  return {fat,custo,imp,tar,frC,frV,mc,qtd,nPed,vendas:fat,encargos:imp+cupom+afiliado+tar-ajustes-rebate+frV,cancelados:0,ajusteImposto:{impOriginal:impOrig,impCorrigido:impCorr,economiaImposto:impOrig-impCorr}};
}

app.post('/api/import', auth, adminOnly, upload.single('file'), (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, {type:'buffer', cellDates:true});
    const ws = wb.Sheets['table-pedidos1'];
    if (!ws) return res.status(400).json({ error: 'Aba "table-pedidos1" não encontrada' });
    const rows = XLSX.utils.sheet_to_json(ws, {raw:false});
    const canal = req.body.canal || 'ml';
    const parsed = canal === 'sh' ? parseSH(rows) : parseML(rows);
    res.json({ ok: true, parsed, canal });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── USUARIOS (admin) ──
app.get('/api/usuarios', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id,nome,email,role,created_at FROM usuarios').all();
  res.json(users);
});

app.put('/api/usuarios/:id/senha', auth, adminOnly, (req, res) => {
  const hash = bcrypt.hashSync(req.body.senha, 10);
  db.prepare('UPDATE usuarios SET senha=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

// ── HEALTH ──
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`CFO Sistema rodando em http://localhost:${PORT}`));
