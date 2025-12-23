// Import helper dari folder system
// Karena file ini ada di user/plugins, kita mundur 2 langkah ke system
import { sendText } from '../../system/helper.js'; 
import { addTask, deleteTask, getTasks, getTaskById, executeCommand } from '../scheduler-manager.js';

/**
 * @param {import('../../system/types/plugin.js').HandlerParams} params
 */
async function handler({ sock, m, text, jid, command, prefix }) {
    
    // === 1. SET COMMAND (Menambah Jadwal) ===
    if (command === 'setcmd') {
        if (!text) {
            return sendText(jid, `❌ *Format Salah!*\n\n👉 Gunakan: *${prefix}setcmd JAM .command*\n\n📝 Contoh:\n- ${prefix}setcmd 05:00 .info\n- ${prefix}setcmd 16:30 "spam" .tagall`, m);
        }
        
        const args = text.trim().split(/\s+/);
        const time = args[0];
        
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            return sendText(jid, '❌ Format waktu salah. Gunakan HH:mm (Contoh 06:30)', m);
        }

        let remainingText = text.slice(time.length).trim();
        let customId = null;
        let cmdToRun = '';

        const idMatch = remainingText.match(/^"([^"]+)"/);
        
        if (idMatch) {
            customId = idMatch[1];
            cmdToRun = remainingText.replace(idMatch[0], '').trim();
        } else {
            cmdToRun = remainingText;
        }

        if (!cmdToRun) return sendText(jid, '❌ Masukkan command yang akan dijalankan.', m);

        const result = addTask(jid, time, cmdToRun, customId);

        if (result.status) {
            return sendText(jid, `✅ *JADWAL TERSIMPAN*\n\n🆔 ID: *${result.id}*\n⏰ Jam: *${time}* WIB\n🤖 Cmd: ${cmdToRun}`, m);
        } else {
            return sendText(jid, `❌ Gagal menyimpan: ${result.msg}`, m);
        }
    }

    // === 2. LIST COMMAND (Lihat Jadwal) ===
    if (command === 'listcmd') {
        const tasks = getTasks(jid);
        if (tasks.length === 0) return sendText(jid, '📭 Belum ada jadwal otomatis di grup ini.', m);

        let txt = '📋 *SCHEDULER LIST*\n\n';
        tasks.forEach((t) => {
            txt += `🆔 *${t.id}* | ⏰ ${t.time}\n`;
            txt += `👉 ${t.commandString}\n\n`;
        });
        txt += `💡 *Tips:*\nHapus: ${prefix}delcmd id\nTest: ${prefix}testcmd id`;
        return sendText(jid, txt, m);
    }

    // === 3. DELETE COMMAND (Hapus Jadwal) ===
    if (command === 'delcmd') {
        if (!text) return sendText(jid, `❌ Masukkan ID jadwal.\nContoh: ${prefix}delcmd a1b`, m);
        
        const success = deleteTask(text.trim());
        if (success) return sendText(jid, `✅ Jadwal dengan ID *${text}* berhasil dihapus.`, m);
        return sendText(jid, `❌ ID *${text}* tidak ditemukan. Cek ${prefix}listcmd`, m);
    }

    // === 4. TEST COMMAND (Coba Jalankan Sekarang) ===
    if (command === 'testcmd') {
        if (!text) return sendText(jid, '❌ Masukkan ID jadwal yang mau dites.', m);
        
        const task = getTaskById(text.trim());
        if (!task) return sendText(jid, '❌ ID tidak ditemukan.', m);

        await sendText(jid, `⏳ Testing run ID: *${task.id}*...`, m);
        
        const result = await executeCommand(task);
        
        if (!result.success) {
            return sendText(jid, `❌ *GAGAL EKSEKUSI*\nReason: ${result.reason}`, m);
        }
    }
}

// === METADATA PLUGIN (Wajib ada biar gak error) ===
handler.pluginName = 'scheduler' // Nama plugin (string, no spasi)
handler.description = 'Mengatur jadwal eksekusi command otomatis.\n' +
    'Contoh Penggunaan:\n' +
    'setcmd 06:00 .menu\n' +
    'listcmd\n' +
    'delcmd <id>'

handler.command = ['setcmd', 'listcmd', 'delcmd', 'testcmd']
handler.category = ['tools'] // Kategori plugin

handler.config = {
    systemPlugin: false, // Karena ini plugin user, set false
    antiDelete: true,
}

handler.meta = {
    fileName: 'scheduler.js',
    version: '1.0',
    author: 'Bot Admin',
    note: 'Native Scheduler System',
}

export default handler;