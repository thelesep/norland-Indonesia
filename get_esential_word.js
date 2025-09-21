const fs = require('fs');
const csv = require('csv-parser');

const inputFile = './hint/english.csv'; // Ganti dengan nama file CSV Anda
const outputFile = 'output.json';

// Map untuk unique per key (atribut): key -> original value
const perKeyMap = new Map();
// Set untuk unique global case-insensitive: lowercase normalized -> original value
const globalUniqueSet = new Set();

// Fungsi untuk normalisasi value untuk check (trim + remove trailing punctuation + lowercase)
function getNormalizedKey(value) {
  let normalized = value.trim();
  // Hapus trailing punctuation umum (misal :, ;, .)
  normalized = normalized.replace(/[.:;?!]+$/, '');
  return normalized.toLowerCase();
}

// Fungsi untuk hitung jumlah kata (split by space, trim non-empty)
function countWords(value) {
  return value.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Fungsi untuk mengekstrak tag hint dari teks sel
function extractHintsFromCell(cellText) {
  const regex = /<hint=([^>]+)>([^<]+)<\/hint>/g;
  let match;
  while ((match = regex.exec(cellText)) !== null) {
    const key = match[1].trim(); // Atribut hint
    const rawValue = match[2].trim();
    // Filter 1: Skip jika value mengandung { atau }
    if (rawValue.includes('{') || rawValue.includes('}')) {
      continue;
    }
    // Filter 2: Skip jika lebih dari 2 kata
    if (countWords(rawValue) > 2) {
      continue;
    }
    const normalizedKey = getNormalizedKey(rawValue);
    // Skip jika kosong setelah normalisasi
    if (!normalizedKey) {
      continue;
    }
    // Prioritas 1: Unique per key - ambil yang pertama
    if (!perKeyMap.has(key)) {
      // Prioritas 2: Check global unique case-insensitive
      if (!globalUniqueSet.has(normalizedKey)) {
        const originalValue = rawValue; // Simpan original case
        perKeyMap.set(key, originalValue);
        globalUniqueSet.add(normalizedKey);
      }
    }
  }
}

// Stream untuk membaca CSV
fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    // Proses setiap kolom/sel dalam baris
    Object.values(row).forEach((cell) => {
      extractHintsFromCell(cell || '');
    });
  })
  .on('end', () => {
    // Ambil values dari perKeyMap (sudah unique global)
    const extractedHints = Array.from(perKeyMap.values());
    fs.writeFileSync(outputFile, JSON.stringify(extractedHints, null, 2));
    console.log(`Ekstraksi selesai! Hasil disimpan di ${outputFile}`);
    console.log('Jumlah unik:', extractedHints.length);
    console.log('Contoh hasil:', JSON.stringify(extractedHints.slice(0, 3), null, 2)); // Tampilkan 3 pertama
  })
  .on('error', (error) => {
    console.error('Error membaca CSV:', error);
  });