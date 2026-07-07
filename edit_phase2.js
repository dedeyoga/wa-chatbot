// Edit script for Phase 2: Lead Collection & Customer Memory
// Run with: node edit_phase2.js

const fs = require('fs');
let src = fs.readFileSync('index.js', 'utf8');

// ========== STEP 1: Add extractAndSaveLead function ==========
const fn = `// =================================================================
// LEAD COLLECTION
// =================================================================
async function extractAndSaveLead(sender, userText, customerName, userId) {
 try {
  const extractionPrompt = 'Ekstrak info dari pesan pelanggan sebagai JSON dengan key: {name, email, location, interest, budget}. Hanya JSON. Pesan: ' + userText;
  const extracted = await getAIReply(extractionPrompt, [], customerName, userId);
  const jsonMatch = extracted.match(/\u0060\u0060\u0060(?:json)?\s*(\{.*?\})\s*\u0060\u0060\u0060|(\{[^`]+\})/s);
  if (!jsonMatch) return;
  const info = JSON.parse(jsonMatch[1] || jsonMatch[2]);
  const leadData = {
   phone_number: sender.replace('@s.whatsapp.net', ''),
   name: info.name || customerName || null,
   interest: info.interest || null,
   email: info.email || null,
   location: info.location || null,
   budget: info.budget || null,
  };
  const result = await db.createOrUpdateLead(userId, leadData);
  logger.info(result.updated ? '[LEAD] Updated: ' + leadData.phone_number : '[LEAD] New: ' + leadData.phone_number);
  if (info.name && info.name !== customerName) await db.saveCustomerMemory(userId, sender, 'nama', info.name);
  if (info.location) await db.saveCustomerMemory(userId, sender, 'lokasi', info.location);
 } catch (e) { /* silent */ }
}

`;

src = src.replace(
  '// =================================================================\n// HELPERS // =================================================================',
  fn + '// =================================================================\n// HELPERS // ================================================================='
);

// ========== STEP 2: Wire up customer memory + lead extraction in message handler ==========
src = src.replace(
  "const reply = await getAIReply(text, userHistory, customerName, userId);",
  "const customerMemory = await db.getCustomerMemory(userId, sender);\n" +
  "const enrichedName = customerName || customerMemory?.nama || null;\n" +
  "const reply = await getAIReply(text, userHistory, enrichedName, userId, customerMemory);"
);

src = src.replace(
  "if (reply) {\n await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n await db.addMessageToHistory(sender, 'assistant', reply);\n}",
  "if (reply) {\n await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n await db.addMessageToHistory(sender, 'assistant', reply);\n extractAndSaveLead(sender, text, enrichedName, userId).catch(() => {});\n}"
);

fs.writeFileSync('index.js', src);
console.log('Done! index.js updated for Phase 2');
