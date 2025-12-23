import fs from 'fs';
import path from 'path';
import allPath from '../system/all-path.js';

// Gunakan path absolut agar aman
const dbPath = path.join(allPath.root, 'user/data/scheduler.json');

// Pastikan folder data ada
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]');

let intervalId = null;

// === STATE BOT ===
let globalSock = null;
let globalPluginManager = null;
let globalPrefixManager = null;

const makeShortId = () => Math.random().toString(36).substring(2, 5);
const getJakartaTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
const getJakartaDate = () => new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric' });

// === INIT ===
export const initScheduler = (sock, pluginManager, prefixManager) => {
    globalSock = sock;
    globalPluginManager = pluginManager;
    globalPrefixManager = prefixManager;

    console.log('🔄 Init Scheduler Variables:');
    console.log(`   - Sock: ${sock ? 'OK' : 'MISSING'}`);
    console.log(`   - PluginManager: ${pluginManager ? 'OK' : 'MISSING'}`);
    console.log(`   - PrefixManager: ${prefixManager ? 'OK' : 'MISSING'}`);

    if (intervalId) clearInterval(intervalId);
    console.log('🕒 Native Scheduler berjalan (Asia/Jakarta)...');

    intervalId = setInterval(async () => {
        let tasks = [];
        try {
            tasks = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        } catch (e) { return; }

        if (tasks.length === 0) return;

        const currentTime = getJakartaTime();
        const currentDate = getJakartaDate();
        
        let saved = false;

        for (let i = 0; i < tasks.length; i++) {
            let task = tasks[i];
            // Cek apakah waktu cocok DAN belum dijalankan hari ini
            if (task.time === currentTime && task.lastRun !== currentDate) {
                console.log(`⏰ TRIGGER [${task.id}]: Waktu cocok (${currentTime}). Mengeksekusi...`);
                
                task.lastRun = currentDate;
                tasks[i] = task;
                saved = true;
                
                executeCommand(task).then(res => {
                    if (!res.success) console.error(`❌ Gagal Auto-Run [${task.id}]: ${res.reason}`);
                    else console.log(`✅ Sukses Auto-Run [${task.id}]`);
                });
            }
        }

        if (saved) {
            fs.writeFileSync(dbPath, JSON.stringify(tasks, null, 2));
        }

    }, 15000); 
};

// === FUNGSI EKSEKUSI ===
export async function executeCommand(task) {
    if (!globalSock) return { success: false, reason: "Global Sock belum init" };
    if (!globalPluginManager || !globalPrefixManager) return { success: false, reason: "Manager belum init" };

    const { jid, commandString } = task;

    try {
        const { valid, prefix } = globalPrefixManager.isMatchPrefix(commandString);
        const textNoPrefix = prefix ? commandString.slice(prefix.length).trim() : commandString.trim();
        const commandName = textNoPrefix.split(/\s+/g)[0];
        const text = textNoPrefix.slice(commandName.length).trim();

        const handler = globalPluginManager.plugins.get(commandName);

        if (!handler) {
            return { success: false, reason: `Command '${commandName}' tidak ditemukan.` };
        }

        if (!valid && !handler.config?.bypassPrefix) {
             return { success: false, reason: `Command '${commandName}' harus menggunakan prefix bot.` };
        }

        const mMock = {
            key: { 
                remoteJid: jid, 
                fromMe: true, 
                id: `SCHED-${task.id}-${Date.now()}`
            },
            chatId: jid,
            senderId: globalSock.user.id.split(':')[0] + '@s.whatsapp.net',
            pushName: '[AUTO-SCHEDULER]',
            text: commandString,
            type: 'conversation',
            reply: async (teks) => {
                return await globalSock.sendMessage(jid, { text: teks });
            }
        };
        mMock.q = text;

        await handler({ 
            sock: globalSock, 
            jid, 
            text, 
            m: mMock, 
            q: mMock, 
            prefix: prefix || '', 
            command: commandName 
        });

        return { success: true, reason: "Berhasil dijalankan" };

    } catch (e) {
        console.error('[DEBUG SCHEDULER] 💥 CRASH:', e);
        return { success: false, reason: `Crash internal: ${e.message}` };
    }
}

// === CRUD Helpers ===

export const addTask = (jid, time, commandString, customId = null) => {
    let tasks = [];
    try { tasks = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch(e) { tasks = []; }

    let finalId;
    if (customId) {
        if (tasks.find(t => t.id === customId)) return { status: false, msg: 'ID sudah digunakan.' };
        finalId = customId;
    } else {
        do { finalId = makeShortId(); } while (tasks.find(t => t.id === finalId));
    }

    const [h, m] = time.split(':');
    const formattedTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;

    tasks.push({ id: finalId, jid, time: formattedTime, commandString, lastRun: null });
    fs.writeFileSync(dbPath, JSON.stringify(tasks, null, 2));
    return { status: true, id: finalId };
};

export const deleteTask = (id) => {
    let tasks = [];
    try { tasks = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch(e) { return false; }
    
    const initialLength = tasks.length;
    tasks = tasks.filter(t => t.id !== id);
    
    if (initialLength !== tasks.length) {
        fs.writeFileSync(dbPath, JSON.stringify(tasks, null, 2));
        return true;
    }
    return false;
};

export const getTasks = (jid) => {
    let tasks = [];
    try { tasks = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch(e) {}
    if (jid) return tasks.filter(t => t.jid === jid);
    return tasks;
};

// --- INI FUNGSI YANG TADI HILANG ---
export const getTaskById = (id) => {
    let tasks = [];
    try { tasks = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch(e) {}
    return tasks.find(t => t.id === id);
};