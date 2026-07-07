// Script to apply Phase 2 edits to index.js and server.js
// Run: node edit_script_final.js

const fs = require('fs');
const path = require('path');

// ===== EDIT index.js =====
let indexSrc = fs.readFileSync('index.js', 'utf8');

// 1. Add extractAndSaveLead after forwardToBotpress (before the closing })
const extractFn = `
// =================================================================
// LEAD COLLECTION — Auto-extract lead info via AI (fire-and-forget)
// =================================================================
async function extractAndSaveLead(sender, userText, customerName, userId, customerMemory) {
  try {
    const extractionPrompt = 'Ekstrak info dari pesan pelanggan sebagai JSON (hanya JSON). Return object dengan key yang relevan: {name, email, location, interest, budget}. Jika tidak ada, isi null. Pesan: ' + userText;
    const extracted = await getAIReply(extractionPrompt, [], customerName, userId, customerMemory);
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
    if (result && result.id && result.updated) {
      logger.info('[LEAD] Updated lead: ' + leadData.phone_number);
    } else if (result && result.id) {
      logger.info('[LEAD] New lead: ' + leadData.phone_number);
    }
    // Save known info to customer memory for AI context
    if (info.name && info.name !== customerMemory?.nama) {
      await db.saveCustomerMemory(userId, sender, 'nama', info.name);
    }
    if (info.location) await db.saveCustomerMemory(userId, sender, 'lokasi', info.location);
    if (info.interest) await db.saveCustomerMemory(userId, sender, 'minat_terakhir', info.interest);
  } catch (e) {
    // Silent fail — don't block user reply
  }
}
`;

// Find the position after forwardToBotpress function's closing brace
// forwardToBotpress ends at: } (line 269)
// We insert after the forwardToBotpress function + blank line
const insertAfter = "return null;\n }\n}\n\n// =================================================================\n// EVENT HANDLERS";
if (!indexSrc.includes(insertAfter)) {
  console.error('ERROR: Could not find insertion point for extractAndSaveLead');
  console.log('Looking for forwardToBotpress end...');
  const idx = indexSrc.indexOf('return null;\n }\n}\n\n// =================================================================');
  console.log('Found at index:', idx);
} else {
  indexSrc = indexSrc.replace(insertAfter, "return null;\n }\n}\n" + extractFn + "\n// =================================================================\n// EVENT HANDLERS");
  console.log('Step 1: extractAndSaveLead function added');
}

// 2. Wire up in message handler — find the reply block and add memory loading + lead extraction
const oldReplyBlock = `const reply = await getAIReply(text, userHistory, customerName, userId);
if (reply) {
  await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });
  await db.addMessageToHistory(sender, 'assistant', reply);
}`;

const newReplyBlock = `const customerMemory = await db.getCustomerMemory(userId, sender);
const enrichedName = customerName || customerMemory?.nama || null;
const reply = await getAIReply(text, userHistory, enrichedName, userId, customerMemory);
if (reply) {
  await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });
  await db.addMessageToHistory(sender, 'assistant', reply);
  extractAndSaveLead(sender, text, enrichedName, userId, customerMemory).catch(() => {});
}`;

if (!indexSrc.includes(oldReplyBlock)) {
  console.error('ERROR: Could not find reply block to replace');
} else {
  indexSrc = indexSrc.replace(oldReplyBlock, newReplyBlock);
  console.log('Step 2: message handler wired up');
}

fs.writeFileSync('index.js', indexSrc);

// ===== EDIT server.js =====
let serverSrc = fs.readFileSync('server.js', 'utf8');

// Add Leads + Customer Memory endpoints before "Initialize DB and start server"
const leadsEndpoints = `
// === LEAD ENDPOINTS ===
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

app.put('/api/leads/:id/tags', mockAuth, async (req, res) => {
  try {
    await db.addLeadTag(req.params.id, req.user.id, req.body.tag);
    res.json({ success: true, message: 'Tag added' });
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

// === CUSTOMER MEMORY ENDPOINTS ===
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

app.delete('/api/customers/:phone/memory/:key', mockAuth, async (req, res) => {
  try {
    await db.deleteCustomerMemory(req.user.id, req.params.phone, req.params.key);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
`;

// Remove broken proxy section and replace with proper endpoints
const brokenProxySection = `// =================================================================
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
// =================================================================

`;

if (serverSrc.includes('TAMBAHKAN INI ke server.js')) {
  serverSrc = serverSrc.replace(brokenProxySection, leadsEndpoints);
  console.log('Step 3: server.js endpoints replaced');
} else {
  // If proxy section wasn't there, just append leads endpoints before db.initializeDatabase
  serverSrc = serverSrc.replace(
    '// Initialize DB and start server',
    leadsEndpoints + '\n// Initialize DB and start server'
  );
  console.log('Step 3: server.js endpoints appended');
}

fs.writeFileSync('server.js', serverSrc);

// ===== CREATE panel-customers.html =====
const panelHtml = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Customers - CSWA Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh}
:root{--wa:#25D366;--wa-dim:#1a9e4a;--bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--border:#30363d;--muted:#8b949e;--text:#e6edf3;--green:#3fb950;--yellow:#d29922;--red:#f85149;--blue:#58a6ff}
.page-hdr{padding:20px;border-bottom:1px solid var(--bg3)}
.page-hdr h2{font-size:20px;font-weight:700}
.page-hdr p{color:var(--muted);font-size:13px;margin-top:4px}
.search-bar{padding:12px 20px;display:flex;gap:10px;border-bottom:1px solid var(--bg3)}
.search-bar input{flex:1;padding:10px 14px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px}
.filter-bar{display:flex;gap:8px;padding:10px 20px;border-bottom:1px solid var(--bg3);overflow-x:auto}
.filter-btn{background:var(--bg2);border:1px solid var(--border);color:var(--muted);padding:6px 14px;border-radius:20px;font-size:12px;cursor:pointer;white-space:nowrap}
.filter-btn.active{background:var(--bg3);color:var(--text);border-color:var(--wa)}
.filter-btn .count{margin-left:4px;opacity:.6}
.customer-item{padding:14px 20px;border-bottom:1px solid var(--bg3);cursor:pointer;transition:background .15s}
.customer-item:hover{background:var(--bg2)}
.customer-item:active{background:var(--bg3)}
.c-header{display:flex;align-items:center;gap:12px}
.avatar{width:42px;height:42px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--wa);font-size:16px}
.c-info{flex:1;min-width:0}
.c-name{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c-phone{font-size:12px;color:var(--muted);margin-top:2px}
.c-meta{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.tag{background:var(--bg);border:1px solid var(--border);padding:2px 10px;border-radius:100px;font-size:11px;color:var(--muted)}
.mem-chip{background:rgba(88,166,255,.1);border:1px solid rgba(88,166,255,.2);padding:2px 10px;border-radius:100px;font-size:11px;color:var(--blue)}
.detail-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:none;align-items:flex-end;justify-content:center}
.detail-overlay.open{display:flex}
.detail-sheet{background:var(--bg2);border:1px solid var(--border);width:100%;max-width:500px;border-radius:20px 20px 0 0;max-height:90vh;overflow-y:auto;animation:su .2s ease}
@keyframes su{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
@media(min-width:480px){.detail-overlay{align-items:center;padding:16px}.detail-sheet{border-radius:16px}}
.detail-handle{width:36px;height:4px;background:var(--bg3);border-radius:2px;margin:10px auto 0}
.detail-head{padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--bg3)}
.detail-title{font-weight:700;font-size:16px}
.d-close{background:var(--bg3);border:none;color:var(--muted);width:28px;height:28px;border-radius:50%;cursor:pointer}
.d-body{padding:20px}
.section{margin-bottom:20px}
.section-title{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.mem-row{padding:8px 0;border-bottom:1px solid var(--bg3);display:flex;justify-content:space-between;align-items:center}
.mem-key{font-family:'DM Mono',monospace;font-size:13px;color:var(--blue)}
.mem-val{font-size:13px;color:var(--text);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty-state{padding:60px 20px;text-align:center;color:var(--muted)}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--wa);border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.btn{padding:8px 14px;border-radius:6px;border:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer}
.btn-primary{background:var(--wa);color:#000}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
.status-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.status-new{background:var(--blue)}
.status-contacted{background:var(--yellow)}
.status-interested{background:var(--green)}
.status-closed{background:var(--muted)}
</style>
</head>
<body>
<div class="page-hdr">
  <h2>Pelanggan & Leads</h2>
  <p>Memori pelanggan &amp; leads yang terdeteksi otomatis</p>
</div>
<div class="search-bar">
  <input type="text" id="searchInput" placeholder="Cari nama, nomor, atau minat...">
</div>
<div class="filter-bar">
  <button class="filter-btn active" onclick="setFilter('all')">Semua<span class="count" id="cnt-all"></span></button>
  <button class="filter-btn" onclick="setFilter('new')">Baru<span class="count" id="cnt-new"></span></button>
  <button class="filter-btn" onclick="setFilter('contacted')">Dihubungi<span class="count" id="cnt-contacted"></span></button>
  <button class="filter-btn" onclick="setFilter('interested')">Tertarik<span class="count" id="cnt-interested"></span></button>
</div>
<div id="customerList"><div class="empty-state">Memuat...</div></div>

<div class="detail-overlay" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-sheet">
    <div class="detail-handle"></div>
    <div class="detail-head">
      <div class="detail-title" id="d-title">Detail</div>
      <button class="d-close" onclick="closeDetail()">✕</button>
    </div>
    <div class="d-body" id="d-body">Memuat...</div>
  </div>
</div>

<script>
const API = '/api';
let allLeads = [];
let currentFilter = 'all';
let currentPhone = null;
let searchQuery = '';

async function loadLeads() {
  const url = currentFilter === 'all' ? '/api/leads' : '/api/leads?status=' + currentFilter;
  const d = await fetch(API + url, headers).then(r => r.json());
  allLeads = d.leads || [];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    allLeads = allLeads.filter(l =>
      (l.name || '').toLowerCase().includes(q) ||
      l.phone_number.includes(q) ||
      (l.interest || '').toLowerCase().includes(q) ||
      (l.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  updateCounts();
  renderList();
}

async function loadCounts() {
  const d = await fetch(API + '/api/leads', headers).then(r => r.json());
  const leads = d.leads || [];
  document.getElementById('cnt-all').textContent = leads.length;
  document.getElementById('cnt-new').textContent = leads.filter(l => l.status === 'new').length;
  document.getElementById('cnt-contacted').textContent = leads.filter(l => l.status === 'contacted').length;
  document.getElementById('cnt-interested').textContent = leads.filter(l => l.status === 'interested').length;
}

function updateCounts() {
  document.getElementById('cnt-all').textContent = allLeads.length;
  document.getElementById('cnt-new').textContent = allLeads.filter(l => l.status === 'new').length;
  document.getElementById('cnt-contacted').textContent = allLeads.filter(l => l.status === 'contacted').length;
  document.getElementById('cnt-interested').textContent = allLeads.filter(l => l.status === 'interested').length;
}

function renderList() {
  const el = document.getElementById('customerList');
  if (!allLeads.length) {
    el.innerHTML = '<div class="empty-state">Belum ada leads.<br>Leads akan terdeteksi otomatis saat pelanggan ngobrol dengan bot.</div>';
    return;
  }
  el.innerHTML = allLeads.map(l => {
    const initials = (l.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const statusColors = { new: 'status-new', contacted: 'status-contacted', interested: 'status-interested', closed: 'status-closed' };
    return '<div class="customer-item" onclick="openDetail(\'' + l.phone_number + '\')">' +
      '<div class="c-header">' +
        '<div class="avatar">' + initials + '</div>' +
        '<div class="c-info">' +
          '<div class="c-name">' + esc(l.name || 'Tanpa Nama') + '</div>' +
          '<div class="c-phone">+' + l.phone_number + '</div>' +
        '</div>' +
        '<span class="status-dot ' + (statusColors[l.status] || 'status-new') + '" title="' + (l.status || 'new') + '"></span>' +
      '</div>' +
      (l.tags && l.tags.length ? '<div class="c-meta">' + l.tags.map(t => '<span class="tag">' + escHtml(t) + '</span>').join('') + '</div>' : '') +
      (l.interest ? '<div class="c-meta"><span class="mem-chip">💡 ' + escHtml(l.interest) + '</span></div>' : '') +
    '</div>';
  }).join('');
}

async function openDetail(phone) {
  currentPhone = phone;
  const r = await fetch(API + '/api/customers/' + phone + '/memory').then(r => r.json());
  const lead = r.lead || {};
  const memory = r.memory || {};
  document.getElementById('d-title').textContent = lead.name || ('+' + phone);
  let html = '<div class="section"><div class="section-title">Kontak</div>';
  html += '<div class="mem-row"><span class="mem-key">Nomor</span><span class="mem-val">+' + escHtml(phone) + '</span></div>';
  if (lead.email) html += '<div class="mem-row"><span class="mem-key">Email</span><span class="mem-val">' + escHtml(lead.email) + '</span></div>';
  if (lead.location) html += '<div class="mem-row"><span class="mem-key">Lokasi</span><span class="mem-val">' + escHtml(lead.location) + '</span></div>';
  html += '<div class="mem-row"><span class="mem-key">Status</span><select id="statusSel" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;font-size:12px">' +
    ['new','contacted','interested','closed'].map(s => '<option value="' + s + '"' + (lead.status===s?' selected':'') + '>' + s + '</option>').join('') +
    '</select></div>';
  html += '</div>';

  html += '<div class="section"><div class="section-title">Memori AI (key-value)</div>';
  const memKeys = Object.keys(memory);
  if (memKeys.length === 0) {
    html += '<div style="font-size:12px;color:var(--muted)">Belum ada memori. Pelanggan perlu ngobrol dulu agar bot mencatat.</div>';
  } else {
    memKeys.forEach(k => {
      html += '<div class="mem-row"><span class="mem-key">' + escHtml(k) + '</span>' +
        '<span class="mem-val">' + escHtml(memory[k]) +
        ' <button onclick="deleteMem(\'' + escHtml(k) + '\')" style="background:none;border:none;color:var(--red);cursor:pointer;margin-left:8px;font-size:12px">×</button>' +
        '</span></div>';
    });
  }
  html += '<div style="margin-top:10px;display:flex;gap:6px">' +
    '<input id="newMemKey" class="finput" placeholder="Key (misal: preferensi)" style="flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:13px">' +
    '<button onclick="addMem()" class="btn btn-primary btn-sm">+ Tambah</button></div>';
  html += '</div>';

  html += '<div class="section"><div class="section-title">Catatan / Interaksi</div>';
  html += '<textarea id="leadNotes" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:8px;font-family:inherit;font-size:13px;min-height:60px">' + escHtml(lead.notes || '') + '</textarea>';
  html += '<button onclick="saveNotes()" class="btn btn-primary btn-sm" style="margin-top:8px">Simpan Catatan</button>';
  html += '</div>';
  document.getElementById('d-body').innerHTML = html;

  document.getElementById('statusSel').addEventListener('change', async (e) => {
    await fetch(API + '/api/leads/' + lead.id + '/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.target.value })
    });
  });
}

async function addMem() {
  const key = document.getElementById('newMemKey').value.trim();
  const val = prompt('Nilai untuk "' + key + '":');
  if (!key || !val) return;
  await fetch(API + '/api/customers/' + currentPhone + '/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: val })
  });
  openDetail(currentPhone);
}

async function deleteMem(key) {
  if (!confirm('Hapus memori "' + key + '"?')) return;
  await fetch(API + '/api/customers/' + currentPhone + '/memory/' + key, { method: 'DELETE' });
  openDetail(currentPhone);
}

async function saveNotes() {
  const notes = document.getElementById('leadNotes').value;
  await fetch(API + '/api/leads/' + currentPhone, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes })
  });
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(f === 'all' ? 'semua' : f === 'contacted' ? 'hubungi' : f)));
  loadLeads();
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderList();
});

loadLeads();
loadCounts();
</script>
</body>
</html>`;

if (!fs.existsSync('panel-customers.html')) {
  fs.writeFileSync('panel-customers.html', panelHtml);
  console.log('Step 4: panel-customers.html created');
} else {
  console.log('Step 4: panel-customers.html already exists, skipping');
}

console.log('All edits applied!');
