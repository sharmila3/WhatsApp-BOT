// =====================================================
// Madre WhatsApp Group Forwarder (Enterprise Version)
// - FAST startup using cached groups.json
// - SLOW build only if groups.json missing
// - Emoji/space-safe group matching (normalizeName)
// - Source-group gated forwarding
// - Random delay between sends
// =====================================================

// Import required modules
const { Client, LocalAuth } = require('whatsapp-web.js');   // WhatsApp library
const qrcode = require('qrcode-terminal');                  // QR generator for login
const fs = require('fs');                                  // File system (to write groups.json)

// Load configuration file (source + target group names)
const config = require('./config.json');

 // Function to normalize group names
// This prevents matching issues caused by:Emojis,Extra spaces, Hidden Unicode characters, Case sensitivity
function normalizeName(s) {
  return (s || "")                     // Prevent null/undefined errors
    .normalize("NFKC")                 // Normalize Unicode characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width invisible characters
    .replace(/\s+/g, " ")              // Replace multiple spaces with single space
    .trim()                            // Remove leading/trailing spaces
    .toLowerCase();                    // Convert to lowercase for safe comparison
}

// Keywords to include groups in groups.json (MUST be lowercase)
 const keywords = ["madre job", "jobhunt.qatar","test","madre whatsapp"];

 // Shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
  const arr = [...array]; // clone to avoid modifying original
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


// Create a new client instance
const client = new Client({
    authStrategy: new LocalAuth(),     // Saves login session locally (no QR every time)
    puppeteer: { headless: false ,
       args: [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows"
  ]

    }      // show browser to debug 
});

// This object will store 
let groupMap = {}; // name → id mapping
//============================
//    GROUP LOADING
//==========================
// Load groups.json if it exists (fast startup)
function loadGroupsFromFile() {
  if (fs.existsSync("./groups.json")) {
    const groups = JSON.parse(fs.readFileSync("./groups.json", "utf8"));
    console.log(`✅ Loaded ${groups.length} groups from groups.json (FAST)`);
    return groups;
  }
  return null; // file not found
}

// Save filtered groups to groups.json
function saveGroupsToFile(groups) {
  fs.writeFileSync("./groups.json", JSON.stringify(groups, null, 2), "utf8");
  console.log(`✅ Saved ${groups.length} groups to groups.json`);
}

// Build groups list from WhatsApp (slow - first time only)
async function buildGroupsFromWhatsApp() {
  console.log("⏳ Syncing WhatsApp chats...");
  await sleep(90000); // wait for WhatsApp to fully load

  const chats = await client.getChats();

  const groups = chats
    .filter(c => c.isGroup) // keep only groups
    .filter(g => {
      const name = normalizeName(g.name);
      return keywords.some(k => name.includes(k)); // match keywords
    })
    .map(g => ({
      name: g.name,
      id: g.id._serialized
    }))
    .sort((a, b) => a.name.localeCompare(b.name)); // sort alphabetically

  return groups;
}

// Create name → id lookup map for fast access
function buildGroupMap(groups) {
  groupMap = {};
  groups.forEach(g => {
    groupMap[normalizeName(g.name)] = g.id;
  });
  console.log("✅ Group mapping ready");
}



// ==============================
// WHEN CLIENT IS READY
// ==============================
client.once("ready", async () => {
  console.log("✅ Whatsapp bot is Ready!");

  // FAST: load from groups.json if exists
  let groups = loadGroupsFromFile();

  // SLOW: only if groups.json missing (first time)
  if (!groups) {
    console.log("⚠️ groups.json not found. Building it now...");
    groups = await buildGroupsFromWhatsApp();
    saveGroupsToFile(groups);
  }

  // Build lookup map (FAST)
  buildGroupMap(groups);
});

// ==============================
// QR CODE EVENT (Login)
// ==============================
client.on('qr', (qr) => {
    console.log("Scan this QR with WhatsAPP");
    qrcode.generate(qr, {small: true});
});

// ==============================
// MESSAGE LISTENER
// ==============================
client.on('message_create', async (msg) => {
  try {
    // 1) Only take messages typed by HR (the logged-in account)
    if (!msg.fromMe) return;


    // If mapping isn't ready yet, don't process messages
if (!Object.keys(groupMap).length) {
  console.log("⚠️ groupMap not ready yet. Ignoring message.");
  return;
}
//Get message
const chat = await msg.getChat();
const chatId = chat.id._serialized;

// Get source group ID from config
const sourceId = groupMap[normalizeName(config.sourceGroupName)];

console.log("DEBUG sourceGroupName:", config.sourceGroupName);
console.log("DEBUG sourceId:", sourceId);
console.log("DEBUG chat.name:", chat.name);
console.log("DEBUG chatId:", chatId);
console.log("DEBUG msg.from:", msg.from); // this is the group ID where HR typed

     
    // If source group not found in groupMap → stop
    if (!sourceId) {
      console.log("❌ Source group not found in groups.json");
      return;
    }

// Only react if HR typed in configured source group
if (chatId !== sourceId) return;

    //Extract message text
    const text = msg.body?.trim();
    if (!text) return;     // Ignore empty messages

    console.log("✅ Captured from source group:", text);
    

    
    // ==============================
    // LOOP THROUGH TARGET GROUPS
    // ==============================
    
    // Randomize order before sending
const shuffledTargets = shuffleArray(config.targetGroupNames);

for (const targetName of shuffledTargets) {

      // Get target group ID from groupMap
     const targetId = groupMap[normalizeName(targetName)];

     // If target not found → skip
     if (!targetId) {
      console.log(`❌ Target group not found: ${targetName}`);
      continue;
     }

    //  // Get WhatsApp chat object using ID
    //  const targetChat = await client.getChatById(targetId);


     //Generate random delay between 20-60 seconds
     const delayMs = randInt(20000, 60000); //20-60seconds
     console.log(`⏳ Delay ${delayMs}ms before sending to ${targetName}`);

    // Wait for the random delay before sending
     await sleep(delayMs);

    //Send the captured message to the target group
    await client.sendMessage(targetId, text);
    //  await targetChat.sendMessage(text);
     console.log(`✅ Sent to ${targetName}`);
    }

  } catch (err) {
    // Catch and log any unexpected errors
    console.error("Error:", err);
  }
});

//Utility function to pause execution for given milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//Utility function to generate random integer between min and max
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


// Start your client
client.initialize();
