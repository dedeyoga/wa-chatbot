const express = require('express');
const path = require('path');
const axios = require('axios');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_PORT = process.env.BOT_PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const mockAuth = (req, res, next) => { req.user = { id: 'admin' }; next(); };

// --- AI CONFIG ---
app.get('/api/ai-config', mockAuth, async (req, res) => {
  try { res.json({ success: true, config: await db.getAIConfig(req.user.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/ai-config', mockAuth, async (req, res) => {
  try { await db.updateAIConfig(req.user.id, req.body); res.json({ success: true, message: 'Tersimpan' }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- PRODUCTS ---
app.get('/api/products', mockAuth, async (req, res) => {
  try { res.json({ success: true, products: await db.getProducts(req.user.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/products', mockAuth, async (req, res) => {
  try { const r = await db.addProduct(req.user.id, req.body); res.json({ success: true, id: r.id }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.put('/api/products/:id', mockAuth, async (req, res) => {
  try { await db.updateProduct(req.params.id, req.user.id, req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.delete('/api/products/:id', mockAuth, async (req, res) => {
  try { await db.deleteProduct(req.params.id, req.user.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- FAQS ---
app.get('/api/faqs', mockAuth, async (req, res) => {
  try { res.json({ success: true, faqs: await db.getFaqs(req.user.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/faqs', mockAuth, async (req, res) => {
  try { const r = await db.addFaq(req.user.id, req.body); res.json({ success: true, id: r.id }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.put('/api/faqs/:id', mockAuth, async (req, res) => {
  try { await db.updateFaq(req.params.id, req.user.id, req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.delete('/api/faqs/:id', mockAuth, async (req, res) => {
  try { await db.deleteFaq(req.params.id, req.user.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- MODELS ---
app.post('/api/models', mockAuth, async (req, res) => {
  const { provider, api_key } = req.body;
  try {
    let models = [];
    if (provider === 'groq') {
      const r = await axios.get('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${api_key}` } });
      models = r.data.data.map(m => m.id);
    } else if (provider === 'openai') {
      const r = await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${api_key}` } });
      models = r.data.data.map(m => m.id).filter(id => id.includes('gpt'));
    } else if (provider === 'openrouter') {
      const r = await axios.get('https://openrouter.ai/api/v1/models');
      models = r.data.data.map(m => m.id);
    } else if (provider === 'gemini') {
      const r = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${api_key}`);
      models = r.data.models.map(m => m.name.replace('models/', '')).filter(n => n.includes('gemini'));
    } else {
      return res.json({ success: false, error: 'Provider tidak didukung.' });
    }
    models.sort();
    res.json({ success: true, models });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal mengambil model.' });
  }
});

// --- ALERTS ---
app.get('/api/alerts', mockAuth, async (req, res) => {
  try {
    const alerts = await db.getSystemAlerts(req.user.id);
    res.json({ success: true, alerts, unreadCount: alerts.filter(a => a.is_read === 0).length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/alerts/read', mockAuth, async (req, res) => {
  try { await db.markAlertsAsRead(req.user.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- QUICK REPLIES ---
app.get('/api/quick-replies/local', mockAuth, async (req, res) => {
  try { res.json({ success: true, quickReplies: await db.getQuickReplies(req.user.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/quick-replies/local', mockAuth, async (req, res) => {
  try { const r = await db.addQuickReply(req.user.id, req.body); res.json({ success: true, id: r.id }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.put('/api/quick-replies/local/:id', mockAuth, async (req, res) => {
  try { await db.updateQuickReply(req.params.id, req.user.id, req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.delete('/api/quick-replies/local/:id', mockAuth, async (req, res) => {
  try { await db.deleteQuickReply(req.params.id, req.user.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- LEADS ---
app.get('/api/leads', mockAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const leads = await db.getLeads(req.user.id, filter);
    res.json({ success: true, leads });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.get('/api/leads/:phone', mockAuth, async (req, res) => {
  try {
    const lead = await db.getLeadByPhone(req.user.id, req.params.phone);
    if (!lead) return res.json({ success: false, error: 'Lead tidak ditemukan' });
    res.json({ success: true, lead });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.put('/api/leads/:id/status', mockAuth, async (req, res) => {
  try { await db.updateLeadStatus(req.params.id, req.user.id, req.body.status); res.json({ success: true, message: 'Status updated' }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.delete('/api/leads/:id', mockAuth, async (req, res) => {
  try { await db.deleteLead(req.params.id, req.user.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- CUSTOMER MEMORY ---
app.get('/api/customers/:phone/memory', mockAuth, async (req, res) => {
  try {
    const memory = await db.getCustomerMemory(req.user.id, req.params.phone);
    const lead = await db.getLeadByPhone(req.user.id, req.params.phone);
    res.json({ success: true, memory, lead });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/customers/:phone/memory', mockAuth, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.json({ success: false, error: 'Key wajib diisi' });
    const result = await db.saveCustomerMemory(req.user.id, req.params.phone, key, value);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.put('/api/customers/:phone/memory/:key', mockAuth, async (req, res) => {
  try { await db.saveCustomerMemory(req.user.id, req.params.phone, req.params.key, req.body.value); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.delete('/api/customers/:phone/memory/:key', mockAuth, async (req, res) => {
  try { await db.deleteCustomerMemory(req.user.id, req.params.phone, req.params.key); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- BOT STATUS & CONNECT (real implementation) ---
let currentSock = null;

app.get('/api/bot-status', (req, res) => res.json({ success: true, ...botStatus }));
app.post('/api/bot-connect', async (req, res) => {
  try {
    if (!currentSock) return res.json({ success: false, error: 'Bot belum siap. Jalankan: node index.js' });
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Nomor tidak boleh kosong' });
    const code = await currentSock.requestPairingCode(phone);
    res.json({ success: true, pairing_code: code });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --- CHAT ---
app.post('/api/chat', mockAuth, async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ success: false, error: 'to & message wajib diisi' });
    if (!currentSock) return res.status(503).json({ success: false, error: 'Bot belum terhubung' });
    const jid = to.endsWith('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    const result = await currentSock.sendMessage(jid, { text: message });
    res.json({ success: true, messageId: result.key.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { app };
