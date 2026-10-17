require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash'
];

async function callGemini(promptText) {
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.3
          }
        })
      });

      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }

      if (data.error) {
        lastError = new Error(`[${model}] ${data.error.message}`);
        continue;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Gagal menghubungi model Gemini.');
}

function cleanJsonString(str) {
  let cleaned = str.trim();
  // Strip ```json and ``` if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  return cleaned;
}

async function askNaya({ room, currentNotes, recentMessages, userMessage, senderName, spreadsheetData }) {
  const formattedHistory = recentMessages
    .map(m => `[${m.sender}]: ${m.text}`)
    .join('\n');

  let sheetContextPrompt = '';
  if (spreadsheetData && spreadsheetData.success) {
    sheetContextPrompt = `
---
[DATA LENGKAP DARI SELURUH SHEET/TAB GOOGLE SPREADSHEET ONLINE]:
${spreadsheetData.data.slice(0, 80000)}
---
PANDUAN KHUSUS MEMBACA SPREADSHEET:
1. Data di atas mencakup SELURUH tab/sheet yang ada di Google Spreadsheet. Perhatikan setiap sheet dengan teliti!
2. Jika pengguna meminta analisis atau bertanya data (misal: "siapa yang ikut dan siapa yang gaikut"):
   - Jawablah dengan SANGAT LENGKAP, DETAIL, dan TERSTRUKTUR (bukan sekadar ringkasan umum).
   - Sebutkan nama-nama UMKM / tenant, nomornya, produknya, dan statusnya secara gamblang.
   - Kategorikan secara tegas:
     * KELOMPOK 1: FIX IKUT (Sebutkan daftar nama UMKM, produk/menu)
     * KELOMPOK 2: MENOLAK / TIDAK BISA IKUT (Sebutkan nama UMKM & catatannya jika ada)
     * KELOMPOK 3: BELUM MENJAWAB / PROSES FOLLOW-UP (Sebutkan nama-namanya)
   - Berikan statistik ringkas (Total target, total fix, total pending, total batal).
3. Buatkan juga tabel ringkasan / database terstruktur yang rapi di "revisedNotes" (Markdown) agar tim bisa memantaunya di panel sebelah kanan secara live!
`;
  } else if (spreadsheetData && !spreadsheetData.success) {
    sheetContextPrompt = `
---
[INFO SPREADSHEET]: Link spreadsheet diberikan tetapi gagal diakses karena: "${spreadsheetData.error}". Beritahu pengguna dengan sopan agar mereka mengubah izin share link menjadi "Anyone with the link can view".
`;
  }

  const prompt = `
Kamu adalah Naya, asisten tim AI yang cerdas, teliti, ramah, dan cekatan di aplikasi chat kolaboratif.
Kamu saat ini berada di room: "${room.name}".
Deskripsi Room: "${room.description || 'Ruang diskusi bersama'}".

TUGAS UTAMA:
1. Jawab pertanyaan tim dengan ramah, suportif, sangat teliti, dan berbasis data akurat.
2. Selalu pantau dan pelajari "CATATAN ROOM TERKINI" di bawah.
3. JIKA ada data spreadsheet online yang tersedia, analisislah seluruh sheet/tab yang ada secara mendalam dan detail.
4. JIKA pengguna memintamu untuk:
   - Mencatat sesuatu (ide, poin, todo list)
   - Merevisi atau mengedit catatan
   - Merangkum percakapan atau data spreadsheet ke dalam catatan
   - Menghapus atau memperbaiki poin tertentu di catatan
   Maka kamu WAJIB menulis ulang seluruh dokumen catatan di kolom "revisedNotes" dengan versi terbaru yang sudah kamu edit/perbaiki secara komprehensif.
5. JIKA pengguna TIDAK meminta mencatat/merevisi apapun, isi "revisedNotes" dengan null.
6. Format "revisedNotes" harus selalu rapi dalam Markdown standar (gunakan tabel | | |, judul #, bullet list -, bold **, check box - [ ]).

---
[CATATAN ROOM TERKINI]:
${currentNotes}
${sheetContextPrompt}
---

[10-15 RIWAYAT CHAT TERAKHIR]:
${formattedHistory || '(Belum ada riwayat chat sebelumnya)'}
---

[PESAN BARU DARI: ${senderName}]:
${userMessage}

---
WAJIB JAWAB HANYA DALAM FORMAT JSON DENGAN SKEMA:
{
  "chatReply": "Balasan lengkap, jelas, ramah, dan terstruktur dari Naya untuk dikirim ke chat feed (Bahasa Indonesia)",
  "revisedNotes": "Seluruh string Markdown catatan room yang sudah diperbarui dengan detail dan tabel rapi (ATAU null jika tidak ada perubahan catatan)",
  "summaryOfChanges": "Ringkasan 1 kalimat tentang apa yang baru saja kamu revisi (ATAU null jika tidak ada perubahan)"
}
`;

  const rawResponse = await callGemini(prompt);
  const cleaned = cleanJsonString(rawResponse);

  try {
    const parsed = JSON.parse(cleaned);
    return {
      chatReply: parsed.chatReply || 'Siap, sudah Naya proses!',
      revisedNotes: parsed.revisedNotes || null,
      summaryOfChanges: parsed.summaryOfChanges || null
    };
  } catch (err) {
    // If JSON parsing fails, find JSON substring or fallback to chat
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          chatReply: parsed.chatReply || 'Siap, sudah Naya proses!',
          revisedNotes: parsed.revisedNotes || null,
          summaryOfChanges: parsed.summaryOfChanges || null
        };
      } catch (e) {}
    }
    return {
      chatReply: cleaned,
      revisedNotes: null,
      summaryOfChanges: null
    };
  }
}

module.exports = { askNaya };
