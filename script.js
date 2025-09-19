// script.js
// Install dependencies jika belum:
// npm install csv-parser papaparse

const fs = require('fs');
const csv = require('csv-parser');
const Papa = require('papaparse');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];
const fileArg = args[1];
const outputDir = 'output_json';
const updatedCSV = 'updated_english.csv';
const chunkSize = 100;  // Ukuran chunk, bisa diubah jika perlu

// Pastikan folder output_json ada
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Fungsi ekstraksi data ke JSON per chunkSize data, hanya values dalam array minified
function extractEnglishToJson(inputFile) {
  return new Promise((resolve) => {
    const results = [];
    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('data', (row) => {
        results.push(row.English ? row.English : " ");  // Hanya simpan value
      })
      .on('end', () => {
        let chunkIndex = 1;
        for (let i = 0; i < results.length; i += chunkSize) {
          const chunk = results.slice(i, i + chunkSize);
          fs.writeFileSync(`${outputDir}/data_${chunkIndex}.json`, JSON.stringify(chunk));  // Minified JSON
          chunkIndex++;
        }
        console.log("Data values berhasil diekstrak ke file JSON minified di folder output_json.");
        resolve();
      });
  });
}

// Fungsi untuk membaca semua rows dari CSV dan mengembalikan array of objects
function getCsvRows(inputCsv) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(inputCsv)
      .pipe(csv())
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', () => {
        resolve(rows);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

// Fungsi untuk ekstrak placeholders (variabel {var} dan attribute values di tag <tag=val>)
function extractPlaceholders(value) {
  const placeholders = new Set();

  // Ekstrak variabel: {var_name}
  const varRegex = /\{(\w+)\}/g;
  let match;
  while ((match = varRegex.exec(value)) !== null) {
    placeholders.add(match[1]);
  }

  // Ekstrak attribute values: <some=val> (asumsi val adalah \w+ tanpa quotes)
  const tagRegex = /<[^=]+=(\w+)>/g;
  while ((match = tagRegex.exec(value)) !== null) {
    placeholders.add(match[1]);
  }

  return placeholders;
}

// Fungsi update CSV dengan satu file JSON (chunk values), dengan verifikasi ketat (berdasarkan chunk index)
async function updateCsvWithTranslation(inputCsv, translationFile) {
  try {
    const originalRows = await getCsvRows(inputCsv);
    const translations = JSON.parse(fs.readFileSync(translationFile, 'utf8'));  // Array values

    // Ekstrak chunkIndex dari nama file (e.g., data_3.json -> 3)
    const match = path.basename(translationFile).match(/data_(\d+)\.json/);
    if (!match) {
      console.error('Nama file JSON tidak valid: Harus seperti data_X.json');
      process.exit(1);
    }
    const chunkIndex = parseInt(match[1]);
    const startIndex = (chunkIndex - 1) * chunkSize;

    // Verifikasi length chunk sesuai
    const expectedLength = Math.min(chunkSize, originalRows.length - startIndex);
    if (translations.length !== expectedLength) {
      console.error(`Verifikasi gagal: Panjang chunk JSON (${translations.length}) tidak match dengan expected (${expectedLength}).`);
      process.exit(1);
    }

    // Verifikasi placeholders, $, dan tag untuk chunk ini
    let valueErrors = [];
    for (let j = 0; j < translations.length; j++) {
      const idx = startIndex + j;
      const originalValue = originalRows[idx].English || '';
      const transValue = translations[j];
      const origPlaceholders = extractPlaceholders(originalValue);
      const transPlaceholders = extractPlaceholders(transValue);
      
      if (origPlaceholders.size !== transPlaceholders.size || 
          ![...origPlaceholders].every(ph => transPlaceholders.has(ph))) {
        const missing = [...origPlaceholders].filter(ph => !transPlaceholders.has(ph));
        const extra = [...transPlaceholders].filter(ph => !origPlaceholders.has(ph));
        let errDetail = `Row ${idx + 1} (Key "${originalRows[idx].Key}"): Placeholders tidak match.`;
        if (missing.length > 0) errDetail += ` Hilang: ${missing.join(', ')}`;
        if (extra.length > 0) errDetail += ` Ekstra: ${extra.join(', ')}`;
        valueErrors.push(errDetail);
      }

      // Verifikasi jumlah $
      const origDollarCount = (originalValue.match(/\$/g) || []).length;
      const transDollarCount = (transValue.match(/\$/g) || []).length;
      if (origDollarCount !== transDollarCount) {
        valueErrors.push(`Row ${idx + 1} (Key "${originalRows[idx].Key}"): Jumlah $ tidak match. Original: ${origDollarCount}, Trans: ${transDollarCount}`);
      }

      // Verifikasi tag (urutan dan isi harus sama)
      const tagRegex = /<[^>]+>/g;
      const origTags = originalValue.match(tagRegex) || [];
      const transTags = transValue.match(tagRegex) || [];
      if (origTags.length !== transTags.length || !origTags.every((tag, index) => tag === transTags[index])) {
        valueErrors.push(`Row ${idx + 1} (Key "${originalRows[idx].Key}"): Tag tidak match. Original tags: ${origTags.join(', ')}; Trans tags: ${transTags.join(', ')}`);
      }
    }

    if (valueErrors.length > 0) {
      console.error('Verifikasi value gagal:\n' + valueErrors.join('\n'));
      process.exit(1);
    }

    // Jika match, update chunk tersebut
    for (let j = 0; j < translations.length; j++) {
      const idx = startIndex + j;
      originalRows[idx].English = translations[j];
    }

    // Tulis kembali ke CSV
    const csvData = Papa.unparse(originalRows);
    fs.writeFileSync(updatedCSV, csvData, 'utf8');
    console.log(`File CSV berhasil diperbarui (chunk) dan disimpan sebagai ${updatedCSV}`);
  } catch (err) {
    console.error('Error selama update:', err);
    process.exit(1);
  }
}

// Fungsi update CSV dengan semua JSON di folder output_json, dengan verifikasi ketat (sequential)
async function updateCsvWithAllTranslations(inputCsv) {
  try {
    const originalRows = await getCsvRows(inputCsv);

    // Gabung semua translations dari JSON files secara urut (data_1, data_2, dst.)
    const jsonFiles = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        const aIdx = parseInt(a.match(/data_(\d+)\.json/)[1]);
        const bIdx = parseInt(b.match(/data_(\d+)\.json/)[1]);
        return aIdx - bIdx;
      });

    let allTranslations = [];
    jsonFiles.forEach(file => {
      const translations = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8'));
      allTranslations = allTranslations.concat(translations);
    });

    // Verifikasi length sama
    if (originalRows.length !== allTranslations.length) {
      console.error(`Verifikasi gagal: Jumlah rows di CSV (${originalRows.length}) tidak sama dengan total items di JSON (${allTranslations.length}).`);
      process.exit(1);
    }

    // Verifikasi placeholders, $, dan tag per index
    let valueErrors = [];
    for (let i = 0; i < originalRows.length; i++) {
      const originalValue = originalRows[i].English || '';
      const transValue = allTranslations[i];
      const origPlaceholders = extractPlaceholders(originalValue);
      const transPlaceholders = extractPlaceholders(transValue);
      
      if (origPlaceholders.size !== transPlaceholders.size || 
          ![...origPlaceholders].every(ph => transPlaceholders.has(ph))) {
        const missing = [...origPlaceholders].filter(ph => !transPlaceholders.has(ph));
        const extra = [...transPlaceholders].filter(ph => !origPlaceholders.has(ph));
        let errDetail = `Row ${i + 1} (Key "${originalRows[i].Key}"): Placeholders tidak match.`;
        if (missing.length > 0) errDetail += ` Hilang: ${missing.join(', ')}`;
        if (extra.length > 0) errDetail += ` Ekstra: ${extra.join(', ')}`;
        valueErrors.push(errDetail);
      }

      // Verifikasi jumlah $
      const origDollarCount = (originalValue.match(/\$/g) || []).length;
      const transDollarCount = (transValue.match(/\$/g) || []).length;
      if (origDollarCount !== transDollarCount) {
        valueErrors.push(`Row ${i + 1} (Key "${originalRows[i].Key}"): Jumlah $ tidak match. Original: ${origDollarCount}, Trans: ${transDollarCount}`);
      }

      // Verifikasi tag (urutan dan isi harus sama)
      const tagRegex = /<[^>]+>/g;
      const origTags = originalValue.match(tagRegex) || [];
      const transTags = transValue.match(tagRegex) || [];
      if (origTags.length !== transTags.length || !origTags.every((tag, index) => tag === transTags[index])) {
        valueErrors.push(`Row ${i + 1} (Key "${originalRows[i].Key}"): Tag tidak match. Original tags: ${origTags.join(', ')}; Trans tags: ${transTags.join(', ')}`);
      }
    }

    if (valueErrors.length > 0) {
      console.error('Verifikasi value gagal:\n' + valueErrors.join('\n'));
      process.exit(1);
    }

    // Jika semua match, update per index
    for (let i = 0; i < originalRows.length; i++) {
      originalRows[i].English = allTranslations[i];
    }

    // Tulis kembali ke CSV
    const csvData = Papa.unparse(originalRows);
    fs.writeFileSync(updatedCSV, csvData, 'utf8');
    console.log(`Semua terjemahan berhasil digabung dan CSV disimpan sebagai ${updatedCSV}`);
  } catch (err) {
    console.error('Error selama update-all:', err);
    process.exit(1);
  }
}

// Menjalankan sesuai argumen
if (command === "extract") {
  if (!fileArg) {
    console.error("Contoh: node script.js extract english.csv");
    process.exit(1);
  }
  extractEnglishToJson(fileArg);
} else if (command === "update") {
  if (!fileArg) {
    console.error("Contoh: node script.js update output_json/data_1.json");
    process.exit(1);
  }
  updateCsvWithTranslation('english.csv', fileArg);  // Note: inputCsv masih hard-coded, bisa diubah jika perlu
} else if (command === "update-all") {
  if (!fileArg) {
    console.error("Contoh: node script.js update-all english.csv");
    process.exit(1);
  }
  updateCsvWithAllTranslations(fileArg);
} else {
  console.log("Perintah tidak dikenali. Gunakan:");
  console.log("  node script.js extract <input_csv>");
  console.log("  node script.js update <translation_json>");
  console.log("  node script.js update-all <input_csv>");
}