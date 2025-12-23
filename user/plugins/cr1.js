import axios from 'axios';
import moment from 'moment-timezone';
import fs from 'fs';
import path from 'path';
import { sendText } from '../../system/helper.js';

// Tentukan lokasi file config
const configPath = path.join(process.cwd(), 'user/data/cr-config.json');

// Fungsi Helper: Load Token dari JSON
const getCrToken = () => {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (!fs.existsSync(configPath)) {
            const defaultData = { token: "ISI_TOKEN_DISINI" };
            fs.writeFileSync(configPath, JSON.stringify(defaultData, null, 2));
            return null;
        }

        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return data.token;
    } catch (e) {
        console.error("Gagal membaca cr-config.json", e);
        return null;
    }
};

async function handler({ sock, m, text, jid, command, prefix }) {

    // 1. Ambil Token
    const CR_TOKEN = getCrToken();

    // 2. Validasi Token
    if (!CR_TOKEN || CR_TOKEN === "ISI_TOKEN_DISINI") {
        return sendText(jid, `❌ *Token Clash Royale Belum Disetting!*\n\nFile config baru saja dibuat di:\n📂 _user/data/cr-config.json_\n\nSilakan buka file tersebut dan tempel token API Clash Royale kamu di sana.`, m);
    }

    // 3. Validasi Input User
    if (!text) {
        return sendText(jid, `❌ Harap masukkan Tag Clan!\n\nContoh:\n${prefix + command} #L8PUJG9`, m);
    }

    await sendText(jid, "⏳ _Mengambil data dari Supercell..._", m);

    try {
        const clanTag = encodeURIComponent(text.trim().replace("#", "").toUpperCase());

        const headers = { 
            Authorization: `Bearer ${CR_TOKEN}`,
            Accept: 'application/json'
        };

        const [clanRes, raceRes] = await Promise.all([
            axios.get(`https://api.clashroyale.com/v1/clans/%23${clanTag}`, { headers }),
            axios.get(`https://api.clashroyale.com/v1/clans/%23${clanTag}/currentriverrace`, { headers })
        ]);

        const clanInfo = clanRes.data;
        const raceData = raceRes.data;

        if (!raceData || !raceData.clan) {
            return sendText(jid, "❌ Tidak ada River Race aktif untuk clan ini atau Tag salah.", m);
        }

        // Helper functions
        const getFamePoints = (clanData) => {
            return clanData.periodPoints || clanData.totalFame || clanData.fame || clanData.points || 0;
        };

        const calculateTotalDecks = (participants) => {
            return participants.reduce((sum, p) => sum + (p.decksUsedToday || 0), 0);
        };

        const formatLastSeen = (lastSeenStr) => {
            if (!lastSeenStr) return "tidak diketahui";
            const seen = moment(lastSeenStr, "YYYYMMDDTHHmmss.SSSZ").tz("Asia/Jakarta");
            const now = moment().tz("Asia/Jakarta");
            const durasi = moment.duration(now.diff(seen));

            let parts = [];
            if (durasi.days() > 0) parts.push(`${durasi.days()}d`);
            if (durasi.hours() > 0) parts.push(`${durasi.hours()}j`);
            if (durasi.minutes() > 0) parts.push(`${durasi.minutes()}m`);
            if (parts.length === 0) return "baru saja";
            return parts.join(" ");
        };

        const MAX_DECKS_PER_CLAN = 200;
        let clanMap = new Map();

        // Main Clan
        clanMap.set(raceData.clan.tag, {
            tag: raceData.clan.tag,
            name: raceData.clan.name,
            totalFame: getFamePoints(raceData.clan),
            totalDecks: calculateTotalDecks(raceData.clan.participants || [])
        });

        // Rivals
        if (Array.isArray(raceData.clans)) {
            raceData.clans.forEach(rival => {
                if (!clanMap.has(rival.tag)) {
                    clanMap.set(rival.tag, {
                        tag: rival.tag,
                        name: rival.name,
                        totalFame: getFamePoints(rival),
                        totalDecks: calculateTotalDecks(rival.participants || [])
                    });
                }
            });
        }

        let allClans = Array.from(clanMap.values()).sort((a, b) => b.totalFame - a.totalFame);

        const participantMap = new Map();
        for (let p of raceData.clan.participants || []) {
            participantMap.set(p.tag, p);
        }

        let membersWithRace = clanInfo.memberList.map(member => {
            const raceParticipant = participantMap.get(member.tag) || {};
            return {
                name: member.name,
                tag: member.tag,
                lastSeen: member.lastSeen,
                decksUsedToday: raceParticipant.decksUsedToday || 0,
                fame: raceParticipant.fame || 0
            };
        });

        const belumTuntas = membersWithRace.filter(m => m.decksUsedToday < 4);
        const tuntas = membersWithRace.filter(m => m.decksUsedToday >= 4);

        belumTuntas.sort((a, b) => a.decksUsedToday - b.decksUsedToday);
        tuntas.sort((a, b) => b.fame - a.fame);

        // Build Output
        let teks = `⚔️═[ RIVER RACE V2 ]═⚔️\n`;
        teks += `🏆 *${clanInfo.name}* (${clanInfo.tag})\n\n`;

        teks += `📈 *KLASEMEN SEMENTARA*\n`;

        allClans.forEach((clan, i) => {
            let medal = i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "   ";
            const formattedFame = clan.totalFame.toLocaleString('id-ID');
            teks += `${medal}${i + 1}. ${clan.name}\n`;
            teks += `   💰 ${formattedFame} poin\n`;

            const percent = Math.min(100, Math.round((clan.totalDecks / MAX_DECKS_PER_CLAN) * 100));
            const filledBlocks = Math.floor(percent / 10);
            const emptyBlocks = 10 - filledBlocks;
            const progressBar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);

            teks += `   ${progressBar} ${clan.totalDecks}/200 dek (${percent}%)\n\n`;
        });

        let endTime;
        if (raceData.periodEndTimestamp) endTime = moment(raceData.periodEndTimestamp);
        else if (raceData.clan?.periodEndTimestamp) endTime = moment(raceData.clan.periodEndTimestamp);

        if (endTime) {
            const now = moment();
            const duration = moment.duration(endTime.diff(now));
            if (duration.asSeconds() > 0) {
                let parts = [];
                if (duration.days() > 0) parts.push(`${duration.days()}d`);
                if (duration.hours() > 0) parts.push(`${duration.hours()}h`);
                if (duration.minutes() > 0) parts.push(`${duration.minutes()}m`);
                if (parts.length === 0) parts.push(`<1m`);
                teks += `🕗 *Race Berakhir*: ${parts.join(" ")}\n\n`;
            } else {
                teks += `🏁 *Race Telah Berakhir*\n\n`;
            }
        }

        if (belumTuntas.length > 0) {
            teks += `🔴 [ BELUM TUNTAS (${belumTuntas.length}) ]\n`;
            belumTuntas.forEach((m, i) => {
                const sisaDek = 4 - m.decksUsedToday;
                const lastSeenText = formatLastSeen(m.lastSeen);
                teks += `${i + 1}. ${m.name}\n`;
                teks += `   Sisa: *${sisaDek} dek* | 👀 ${lastSeenText}\n`;
            });
            teks += '\n';
        }

        if (tuntas.length > 0) {
            teks += `🟢 [ TUNTAS (${tuntas.length}) ]\n`;
            const top5 = tuntas.slice(0, 5); 
            top5.forEach((m, i) => {
                let medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`;
                teks += `${medal} ${m.name} (${m.fame.toLocaleString('id')})\n`;
            });
            if (tuntas.length > 5) teks += `...dan ${tuntas.length - 5} lainnya.\n`;
            teks += `\n✅ *Respect!* Terima kasih sudah war.\n`;
        }

        teks += `══════════════════════════════`;
        return sendText(jid, teks, m);

    } catch (err) {
        console.error("[WARCLAN ERROR]", err?.response?.data || err.message);
        
        if (err?.response?.status === 403) {
            return sendText(jid, "❌ *TOKEN ERROR*\nToken API expired atau salah. Cek user/data/cr-config.json", m);
        }
        
        let errorMsg = "❌ Gagal mengambil data.";
        if (err?.response?.status === 404) errorMsg = "❌ Clan Tag tidak ditemukan.";
        if (err?.response?.status === 503) errorMsg = "❌ Server Clash Royale sedang Maintenance.";

        return sendText(jid, errorMsg, m);
    }
}

// === METADATA PLUGIN ===
handler.pluginName = 'warclan';
handler.description = 'Cek statistik River Race Clash Royale';
handler.command = ['warclan', 'riverrace', 'crwar'];
handler.category = ['clash royale'];

handler.config = {
    systemPlugin: false,
    antiDelete: false,
}

handler.meta = {
    fileName: 'warclan.js',
    version: '3.0',
    author: 'ali_elfauzi',
    note: 'Config loaded from user/data/cr-config.json',
}

export default handler;