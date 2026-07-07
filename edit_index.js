const fs = require('fs');
let src = fs.readFileSync('index.js', 'utf8');

// Add extractAndSaveLead before HELPERS section
const fn = '// =================================================================\n' +
'// LEAD COLLECTION\n' +
'// =================================================================\n' +
'async function extractAndSaveLead(sender, userText, customerName, userId, customerMemory) {\n' +
' const extractionPrompt = \'Ekstrak info dari pesan pelanggan sebagai JSON: {name, email, location, interest, budget}. Hanya JSON, tanpa penjelasan. Pesan: \' + userText;\n' +
' try {\n' +
'  const extracted = await getAIReply(extractionPrompt, [], customerName, userId, customerMemory);\n' +
'  const jsonMatch = extracted.match(/`{3}(?:json)?\\s*(\\{.*?\\})\\s*`{3}|(\\{[^`]+\\})/s);\n' +
'  if (!jsonMatch) return;\n' +
'  const jsonStr = jsonMatch[1] || jsonMatch[2];\n' +
'  const info = JSON.parse(jsonStr);\n' +
'  const leadData = {\n' +
'   phone_number: sender.replace(\'@s.whatsapp.net\', \'\'),\n' +
'   name: info.name || customerName || null,\n' +
'   interest: info.interest || null,\n' +
'   email: info.email || null,\n' +
'   location: info.location || null,\n' +
'   budget: info.budget || null,\n' +
'  };\n' +
'  const leadResult = await db.createOrUpdateLead(userId, leadData);\n' +
'  if (leadResult.updated) logger.info(\'[LEAD] Updated: \' + leadData.phone_number);\n' +
'  else logger.info(\'[LEAD] New: \' + leadData.phone_number);\n' +
'  if (info.name && info.name !== customerMemory?.nama) await db.saveCustomerMemory(userId, sender, \'nama\', info.name);\n' +
'  if (info.location) await db.saveCustomerMemory(userId, sender, \'lokasi\', info.location);\n' +
' } catch (e) { logger.info(\'[LEAD] Extract skipped\'); }\n' +
'}\n\n';

src = src.replace('// =================================================================\n// HELPERS // =================================================================', fn + '// =================================================================\n// HELPERS // =================================================================');
fs.writeFileSync('index.js', src);
console.log('Step 1: extractAndSaveLead added');

// Step 2: Wire up in message handler - replace the reply block
const oldBlock = 'const reply = await getAIReply(text, userHistory, customerName, userId);\n' +
'if (reply) {\n' +
' await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n' +
' await db.addMessageToHistory(sender, \'assistant\', reply);\n' +
'}';

const newBlock = 'const customerMemory = await db.getCustomerMemory(userId, sender);\n' +
'const enrichedName = customerName || customerMemory?.nama || null;\n' +
'const reply = await getAIReply(text, userHistory, enrichedName, userId, customerMemory);\n' +
'if (reply) {\n' +
' await sendMessageWTyping(sock, sender, { text: reply }, { quoted: msg });\n' +
' await db.addMessageToHistory(sender, \'assistant\', reply);\n' +
' extractAndSaveLead(sender, text, enrichedName, userId, customerMemory).catch(() => {});\n' +
'}';

src = src.replace(oldBlock, newBlock);
fs.writeFileSync('index.js', src);
console.log('Step 2: message handler wired up');
