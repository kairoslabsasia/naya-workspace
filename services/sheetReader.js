/**
 * Advanced Google Sheets Reader
 * Automatically extracts ALL tabs/sheets from public Google Spreadsheets
 */

function extractGoogleSheetInfo(text) {
  const regex = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)(?:[^\s]*)/i;
  const match = text.match(regex);
  if (!match) return null;

  const sheetId = match[1];
  return {
    sheetId,
    url: match[0]
  };
}

async function discoverAllSheetTabs(sheetId) {
  const editUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  const res = await fetch(editUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });

  if (!res.ok) {
    return [];
  }

  const html = await res.text();

  // Pattern 1: JSON bootstrap array with [gid, name]
  // e.g. [1,0,"962833406",[{"1":[[0,0,"DATABASE_41_UMKM"]
  const tabs = [];
  const visitedGids = new Set();

  const gidMatches = [...html.matchAll(/\[[0-9]+,[0-9]+,\\?"([0-9]+)\\?",\[\{\\?"1\\?":\[\[[0-9]+,[0-9]+,\\?"([^"\\]+)\\?"/gi)];
  for (const m of gidMatches) {
    const gid = m[1];
    const name = m[2];
    if (!visitedGids.has(gid)) {
      visitedGids.add(gid);
      tabs.push({ gid, name });
    }
  }

  // Pattern 2: docs-sheet-tab-caption
  if (tabs.length === 0) {
    const tabCaptions = [...html.matchAll(/class="[^"]*docs-sheet-tab-caption[^"]*">([^<]+)<\/div>/gi)].map(m => m[1].trim());
    tabCaptions.forEach((name, idx) => {
      tabs.push({ gid: idx.toString(), name });
    });
  }

  return tabs;
}

async function fetchGoogleSheetContent(sheetInfo) {
  try {
    const tabs = await discoverAllSheetTabs(sheetInfo.sheetId);

    // If tabs were discovered, fetch CSV for ALL tabs!
    if (tabs.length > 0) {
      const sheetResults = [];

      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        try {
          const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetInfo.sheetId}/export?format=csv&gid=${tab.gid}`;
          const res = await fetch(csvUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          if (res.ok) {
            const csv = await res.text();
            sheetResults.push({
              name: tab.name,
              gid: tab.gid,
              csv: csv.trim()
            });
          }
        } catch (err) {
          console.error(`Gagal fetch tab ${tab.name}:`, err.message);
        }
      }

      if (sheetResults.length > 0) {
        // Format combined multi-sheet data
        let combinedData = `=== DOKUMEN SPREADSHEET ONLINE: TERDETEKSI ${sheetResults.length} SHEET/TAB ===\n\n`;
        sheetResults.forEach((s, idx) => {
          combinedData += `\n############################################################\n`;
          combinedData += `### SHEET [${idx + 1}/${sheetResults.length}]: "${s.name}" (GID: ${s.gid})\n`;
          combinedData += `############################################################\n`;
          combinedData += s.csv + `\n\n`;
        });

        return {
          success: true,
          isMultiSheet: true,
          sheetCount: sheetResults.length,
          sheetNames: sheetResults.map(s => s.name),
          data: combinedData,
          url: sheetInfo.url
        };
      }
    }

    // Fallback: Default single sheet export
    const defaultUrl = `https://docs.google.com/spreadsheets/d/${sheetInfo.sheetId}/export?format=csv`;
    const res = await fetch(defaultUrl);
    if (!res.ok) {
      return {
        success: false,
        error: 'Spreadsheet tidak dapat diakses publik. Pastikan link di-share dengan izin "Anyone with the link can view" (Siapa saja yang memiliki link).'
      };
    }
    const csv = await res.text();
    return {
      success: true,
      isMultiSheet: false,
      sheetCount: 1,
      sheetNames: ['Sheet Utama'],
      data: csv,
      url: sheetInfo.url
    };

  } catch (err) {
    return {
      success: false,
      error: `Koneksi gagal: ${err.message}`
    };
  }
}

module.exports = {
  extractGoogleSheetInfo,
  fetchGoogleSheetContent
};
