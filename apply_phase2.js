// Apply Phase 2: Lead Collection & Customer Memory
const fs = require('fs');

// ===== EDIT index.js =====
let idx = fs.readFileSync('index.js', 'utf8');

// Step 1: Add extractAndSaveLead function (before EVENT HANDLERS section)
const extractFn = `
// =================================================================
// LEAD COLLECTION
// =================================================================
async function extractAndSaveLead(sender, userText, customerName, userId) {
  try {
    const extractionPrompt = 'Ekstrak info dari pesan: {name, email, location, interest, budget}. Return JSON only. Pesan: ' + userText;
    const extracted = await getAIReply(extractionPrompt, [], customerName, userId);
    const match = extracted.match(/\{[\s\S]*\}/);
    if (!match) return;
    const info = JSON.parse(match[0]);
    const leadData = {
      phone_number: sender.replace('@s.whatsapp.net', ''),
      name: info.name || customerName || null,
      interest: info.interest || null,
      email: info.email || null,
      location: info.location || null,
      budget: info.budget || null,
    };
    const result = await db.createOrUpdateLead(userId, leadData);
    if (result && result.updated) {
      logger.info('[LEAD] Updated: ' + leadData.phone_number);
    } else if (result && result.id) {
      logger.info('[LEAD] New: ' + leadData.phone_number);
    }
    if (info.name && info.name !== customerName) await db.saveCustomerMemory(userId, sender, 'nama', info.name);
    if (info.location) await db.saveCustomerMemory(userId, sender, 'lokasi', info.location);
    if (info.interest) await db.saveCustomerMemory(userId, sender, 'minat_terakhir', info.interest);
  } catch (e) {
    // silent
  }
}
`;

idx = idx.replace(
  '// =================================================================\n// EVENT HANDLERS // =================================================================',
  extractFn + '\n// =================================================================\n// EVENT HANDLERS // ================================================================='
);

// Step 2: Wire up in the AI reply block (image path around line 346)
idx = idx.replace(
  "const question = caption || 'Saya mengirim gambar ini.';\n" +
  "const reply = await getAIReply(question, userHistory, customerName, userId);\n" +
  "if (reply) {\n" +
  "  await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n" +
  "  await db.addMessageToHistory(sender, 'user', question);\n" +
  "  await db.addMessageToHistory(sender, 'assistant', reply);\n" +
  "}",
  "const question = caption || 'Saya mengirim gambar ini.';\n" +
  "const imgMemory = await db.getCustomerMemory(userId, sender);\n" +
  "const imgName = customerName || imgMemory?.nama || null;\n" +
  "const reply = await getAIReply(question, userHistory, imgName, userId, imgMemory);\n" +
  "if (reply) {\n" +
  "  await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n" +
  "  await db.addMessageToHistory(sender, 'user', question);\n" +
  "  await db.addMessageToHistory(sender, 'assistant', reply);\n" +
  "  extractAndSaveLead(sender, question, imgName, userId).catch(() => {});\n" +
  "}"
);

// Step 3: Wire up in the text AI reply block (line 536 area)
idx = idx.replace(
  "const reply = await getAIReply(text, userHistory, customerName, userId);\n" +
  "if (reply) {\n" +
  "  await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n" +
  "  await db.addMessageToHistory(sender, 'assistant', reply);\n" +
  "}",
  "const customerMemory = await db.getCustomerMemory(userId, sender);\n" +
  "const enrichedName = customerName || customerMemory?.nama || null;\n" +
  "const reply = await getAIReply(text, userHistory, enrichedName, userId, customerMemory);\n" +
  "if (reply) {\n" +
  "  await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n" +
  "  await db.addMessageToHistory(sender, 'assistant', reply);\n" +
  "  extractAndSaveLead(sender, text, enrichedName, userId).catch(() => {});\n" +
  "}"
);

// Fix duplicate getAIReply call in initial ai reply (image path already uses it, text path does now)
// Also fix duplicate addMessageToHistory in text block - remove the one at line 524 since we now do it inside the reply block
idx = idx.replace(
  "await db.addMessageToHistory(sender, 'user', text);\n\n" +
  "// Coba Botpress terlebih dahulu",
  "// Coba Botpress terlebih dahulu"
);

fs.writeFileSync('index.js', idx);
console.log('index.js patched');

// ===== EDIT server.js =====
let srv = fs.readFileSync('server.js', 'utf8');

// Remove the broken proxy section (lines 180-209) and replace with real endpoints
const brokenSection = `// =================================================================
// TAMBAHKAN INI ke server.js
// Letakkan SEBELUM baris: db.initializeDatabase();
// =================================================================

// Proxy: status bot
app.get('/api/bot-status', async (req, res) => {
  try {
    const r = await axios.get(\`${BOT_URL}/status\`, { timeout: 2000 });
    res.json(r.data);
  } catch {
    res.json({ success: true, status: 'disconnected', qr: null, phone: null });
  }
});

// Proxy: minta pairing code
app.post('/api/bot-connect', async (req, res) => {
  try {
    const r = await axios.post(\`${BOT_URL}/connect\`, req.body, { timeout: 10000 });
    res.json(r.data);
  } catch (err) {
    res.json({ success: false, error: 'Bot tidak merespons. Jalankan: node index.js' });
  }
});

// =================================================================
// Pastikan 'axios' sudah di-require di atas file server.js
// (sudah ada di baris: const axios = require('axios'); di dalam /api/models)
// Pindahkan saja ke bagian atas bersama require lainnya.
// =================================================================`;

const realEndpoints = `// =================================================================
// LEAD ENDPOINTS
// =================================================================
app.get('/api/leads', mockAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const leads = await db.getLeads(req.user.id, filter);
    res.json({ success: true, leads });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/leads/:phone', mockAuth, async (req, res) => {
  try {
    const lead = await db.getLeadByPhone(req.user.id, req.params.phone);
    if (!lead) return res.json({ success: false, error: 'Lead tidak ditemukan' });
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/leads/:id/status', mockAuth, async (req, res) => {
  try {
    await db.updateLeadStatus(req.params.id, req.user.id, req.body.status);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/leads/:id', mockAuth, async (req, res) => {
  try {
    await db.deleteLead(req.params.id, req.user.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =================================================================
// CUSTOMER MEMORY ENDPOINTS
// =================================================================
app.get('/api/customers/:phone/memory', mockAuth, async (req, res) => {
  try {
    const memory = await db.getCustomerMemory(req.user.id, req.params.phone);
    const lead = await db.getLeadByPhone(req.user.id, req.params.phone);
    res.json({ success: true, memory, lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customers/:phone/memory', mockAuth, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.json({ success: false, error: 'Key wajib diisi' });
    const result = await db.saveCustomerMemory(req.user.id, req.params.phone, key, value);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/customers/:phone/memory/:key', mockAuth, async (req, res) => {
  try {
    await db.saveCustomerMemory(req.user.id, req.params.phone, req.params.key, req.body.value);
    res.json({ success: true, message: 'Updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/customers/:phone/memory/:key', mockAuth, async (req, res) => {
  try {
    await db.deleteCustomerMemory(req.user.id, req.params.phone, req.params.key);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});`;

// Check if axios is required (needed for bot-status endpoint which we keep)
if (!srv.includes("const axios = require('axios');")) {
  srv = "const axios = require('axios');\n" + srv;
}

srv = srv.replace(brokenSection, realEndpoints + `

app.get('/api/bot-status', async (req, res) => {
  res.json({ success: true, ...botStatus });
});

app.post('/api/bot-connect', async (req, res) => {
  try {
    if (!currentSock) return res.json({ success: false, error: 'Bot belum siap' });
    const { phone } = req.body;
    const code = await currentSock.requestPairingCode(phone);
    res.json({ success: true, pairing_code: code });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});`);

fs.writeFileSync('server.js', srv);
console.log('server.js patched');

// ===== CREATE panel-customers.html =====
const panel = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Customers - CSWA Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh}
:root{--wa:#25D366;--bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--border:#30363d;--muted:#8b949e;--text:#e6edf3;--green:#3fb950;--yellow:#d29922;--red:#f85149;--blue:#58a6ff}
.page-hdr{padding:20px;border-bottom:1px solid var(--bg3)}
.page-hdr h2{font-size:20px;font-weight:700}
.page-hdr p{color:var(--muted);font-size:13px;margin-top:4px}
.search-bar{padding:12px 20px;border-bottom:1px solid var(--bg3)}
.search-bar input{width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px}
.filter-bar{display:flex;gap:6px;padding:10px 20px;border-bottom:1px solid var(--bg3);overflow-x:auto}
.fbtn{background:var(--bg2);border:1px solid var(--border);color:var(--muted);padding:5px 13px;border-radius:16px;font-size:12px;cursor:pointer;white-space:nowrap}
.fbtn.on{background:var(--bg3);color:var(--text);border-color:var(--wa)}
.c-item{padding:14px 20px;border-bottom:1px solid var(--bg3);cursor:pointer;transition:background .15s}
.c-item:hover{background:var(--bg2)}
.c-row{display:flex;align-items:center;gap:12px}
.av{width:40px;height:40px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--wa);font-size:14px;flex-shrink:0}
.c-name{font-weight:600;font-size:14px}
.c-phone{font-size:12px;color:var(--muted);margin-top:2px}
.c-tags{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;align-items:center}
.tag{background:var(--bg);border:1px solid var(--border);padding:2px 9px;border-radius:12px;font-size:11px;color:var(--muted)}
.mem{background:rgba(88,166,255,.1);border:1px solid rgba(88,166,255,.15);padding:2px 9px;border-radius:12px;font-size:11px;color:var(--blue)}
.dov{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:none;align-items:flex-end;justify-content:center}
.dov.open{display:flex}
.dsheet{background:var(--bg2);border:1px solid var(--border);width:100%;max-width:500px;border-radius:20px 20px 0 0;max-height:90vh;overflow-y:auto;animation:su .2s ease}
@keyframes su{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
@media(min-width:480px){.dov{align-items:center;padding:16px}.dsheet{border-radius:16px}}
.dhand{width:36px;height:4px;background:var(--bg3);border-radius:2px;margin:10px auto 0}
.dhead{padding:14px 20px;display:flex;justify-content:space-between;border-bottom:1px solid var(--bg3)}
.dtitle{font-weight:700;font-size:16px}
.dclose{background:var(--bg3);border:none;color:var(--muted);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:15px}
.dbody{padding:20px}
.sec{margin-bottom:20px}
.sec-t{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.mrow{padding:8px 0;border-bottom:1px solid var(--bg3);display:flex;justify-content:space-between;align-items:center;gap:8px}
.mkey{font-family:'DM Mono',monospace;font-size:13px;color:var(--blue);flex-shrink:0}
.mval{font-size:13px;text-align:right;word-break:break-all}
.empty{padding:60px 20px;text-align:center;color:var(--muted);font-size:14px}
.finput{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:13px;width:100%}
.finput:focus{outline:none;border-color:var(--wa)}
select.finput{appearance:auto}
textarea.finput{resize:vertical;min-height:60px}
.btn{padding:7px 14px;border-radius:6px;border:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn:active{transform:scale(.97)}
.btn-p{background:var(--wa);color:#0d1117}
.btn-p:hover{background:var(--wa-dim)}
.btn-g{background:transparent;color:var(--muted);border:1px solid var(--border)}
.btn-g:hover{background:var(--bg3)}
.btn-d{background:transparent;color:var(--red);border:1px solid #3d1515}
.btn-d:hover{background:#2d0f0f}
.btn-row{display:flex;gap:8px;margin-top:8px}
</style>
</head>
<body>
<div class="page-hdr">
  <h2>Pelanggan & Leads</h2>
  <p>Lead collection &amp; memori pelanggan yang terdeteksi otomatis oleh bot</p>
</div>
<div class="search-bar">
  <input type="text" id="sinput" placeholder="Cari nama, nomor, minat...">
</div>
<div class="filter-bar">
  <button class="fbtn on" data-f="all">Semua</button>
  <button class="fbtn" data-f="new">Baru</button>
  <button class="fbtn" data-f="contacted">Dihubungi</button>
  <button class="fbtn" data-f="interested">Tertarik</button>
  <button class="fbtn" data-f="closed">Ditutup</button>
</div>
<div id="clist" style="padding-bottom:40px"><div class="empty">Memuat...</div></div>

<div class="dov" id="dov" onclick="if(event.target===this)closeD()">
 <div class="dsheet">
  <div class="dhand"></div>
  <div class="dhead">
   <div class="dtitle" id="dt">Detail</div>
   <button class="dclose" onclick="closeD()">✕</button>
  </div>
  <div class="dbody" id="db">Memuat...</div>
 </div>
</div>

<script>
const API = '/api';
let allLeads = [];
let curFilter = 'all';
let curPhone = null;

document.querySelectorAll('.fbtn').forEach(b => b.addEventListener('click', () => {
  curFilter = b.dataset.f;
  document.querySelectorAll('.fbtn').forEach(x => x.classList.toggle('on', x.dataset.f === curFilter));
  render();
}));

document.getElementById('sinput').addEventListener('input', e => {
  render(e.target.value);
});

async function load() {
  const url = curFilter === 'all' ? '/api/leads' : '/api/leads?status=' + curFilter;
  const d = await api(url);
  allLeads = d.leads || [];
  render();
}

function render(q) {
  const list = document.getElementById('clist');
  let rows = allLeads;
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(l => (l.name||'').toLowerCase().includes(ql) || l.phone_number.includes(ql) || (l.interest||'').toLowerCase().includes(ql) || (l.tags||[]).some(t => t.toLowerCase().includes(ql)));
  }
  if (!rows.length) { list.innerHTML = '<div class="empty">Belum ada leads.</div>'; return; }
  list.innerHTML = rows.map(l => {
    const ini = (l.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const sc = {new:'#58a6ff',contacted:'#d29922',interested:'#3fb950',closed:'#8b949e'};
    return '<div class="c-item" onclick="detail(\''+l.phone_number+'\')">' +
      '<div class="c-row"><div class="av">'+ini+'</div><div class="flex-1"><div class="c-name">'+esc(l.name||'Tanpa Nama')+'</div><div class="c-phone">+'+l.phone_number+'</div></div>' +
      '<span style="width:10px;height:10px;border-radius:50%;background:'+(sc[l.status]||sc.new)+';flex-shrink:0"></span></div>' +
      (l.tags&&l.tags.length ? '<div class="c-tags">'+l.tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div>' : '') +
      (l.interest ? '<div class="c-tags"><span class="mem">💡 '+esc(l.interest)+'</span></div>' : '') +
    '</div>';
  }).join('');
}

async function detail(phone) {
  curPhone = phone;
  const d = await api('/api/customers/' + phone + '/memory');
  const m = d.memory || {};
  const l = d.lead || {};
  document.getElementById('dt').textContent = l.name || ('+' + phone);
  let h = '<div class="sec"><div class="sec-t">Kontak</div>';
  h += mr('Nomor', '+' + esc(phone));
  if (l.email) h += mr('Email', esc(l.email));
  if (l.location) h += mr('Lokasi', esc(l.location));
  h += '<div class="mrow"><span class="mkey">Status</span><select id="sts" onchange="updSts(this.value)" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-size:12px">' +
    ['new','contacted','interested','closed'].map(s => '<option value="'+s+'"'+(l.status===s?' selected':'')+'>'+s+'</option>').join('')+'</select></div>';
  h += '</div>';

  h += '<div class="sec"><div class="sec-t">Memori AI</div>';
  const keys = Object.keys(m);
  if (!keys.length) h += '<div style="font-size:12px;color:var(--muted)">Belum ada memori.</div>';
  keys.forEach(k => {
    h += '<div class="mrow"><span class="mkey">'+esc(k)+'</span><span class="mval">'+esc(m[k])+' <button onclick="delMem(\''+esc(k)+'\')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;margin-left:6px">×</button></span></div>';
  });
  h += '<div style="margin-top:10px;display:flex;gap:6px"><input class="finput" id="mk" placeholder="Key (misal: preferensi)" style="flex:1"><button class="btn btn-p btn-sm" onclick="addMem()">+ Tambah</button></div>';
  h += '</div>';

  h += '<div class="sec"><div class="sec-t">Catatan</div>';
  h += '<textarea class="finput" id="nts">'+esc(l.notes||'')+'</textarea>';
  h += '<div class="btn-row"><button class="btn btn-p btn-sm" onclick="saveNotes()">Simpan Catatan</button></div>';
  h += '</div>';

  document.getElementById('db').innerHTML = h;
}

async function updSts(v) {
  const d = await api('/api/customers/'+curPhone+'/memory');
  const lid = d.lead && d.lead.id;
  if (lid) await api('/api/leads/'+lid+'/status', {method:'PUT',body:JSON.stringify({status:v}),headers:{'Content-Type':'application/json'}});
}

async function addMem() {
  const k = document.getElementById('mk').value.trim();
  if (!k) return;
  const v = prompt('Nilai untuk "'+k+'":');
  if (!v) return;
  await api('/api/customers/'+curPhone+'/memory', {method:'POST',body:JSON.stringify({key:k,value:v}),headers:{'Content-Type':'application/json'}});
  detail(curPhone);
}

async function delMem(k) {
  if (!confirm('Hapus memori "'+k+'"?')) return;
  await api('/api/customers/'+curPhone+'/memory/'+k, {method:'DELETE'});
  detail(curPhone);
}

async function saveNotes() {
  const v = document.getElementById('nts').value;
  const d = await api('/api/customers/'+curPhone+'/memory');
  const lid = d.lead && d.lead.id;
  const phone = encodeURIComponent(curPhone);
  if (lid) {
    await fetch(API+'/api/leads/'+lid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes:v})});
  }
}

function closeD() { document.getElementById('dov').classList.remove('open'); }

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function api(url, opts) {
  try {
    const r = await fetch(API + url, {signal: AbortSignal.timeout(6000), ...opts});
    return await r.json();
  } catch(e) { return {success:false}; }
}

load();
</script>
</body>
</html>`;

if (!fs.existsSync('panel-customers.html')) {
  fs.writeFileSync('panel-customers.html', panel);
  console.log('panel-customers.html created');
} else {
  console.log('panel-customers.html exists, overwriting');
  fs.writeFileSync('panel-customers.html', panel);
}

console.log('Phase 2 complete!');
