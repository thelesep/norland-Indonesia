const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const mode = process.argv[2];

if (!mode || !['split', 'merge'].includes(mode)) {
  console.error('Usage: node csv_translator.js [split|merge] [args]');
  process.exit(1);
}

async function split(inputFile, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(inputFile)
      .pipe(csvParser())
      .on('data', (row) => {
        if (row.Key && row.Key.trim() !== '') {
          rows.push(row);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (rows.length === 0) {
    console.error('No valid data (with non-empty Key) in input file.');
    return;
  }

  const headers = Object.keys(rows[0]);
  fs.writeFileSync(path.join(outputDir, 'original_headers.json'), JSON.stringify(headers));

  const langHeaders = headers.filter(h => !['Key', 'Comments', 'Timestamp'].includes(h));

  for (const lang of langHeaders) {
    const fileName = lang.toLowerCase().replace(/[^a-z0-9]/g, '-') + '.csv';
    const outputPath = path.join(outputDir, fileName);

    const writer = createCsvWriter({
      path: outputPath,
      header: [
        { id: 'Key', title: 'Key' },
        { id: lang, title: lang }
      ],
    });

    const data = rows.map(row => ({
      Key: row.Key,
      [lang]: row[lang] || '',
    }));

    await writer.writeRecords(data);
    console.log(`Created: ${fileName} (columns: Key, ${lang}, rows: ${data.length})`);
  }

  console.log(`Split completed. Processed ${rows.length} rows with non-empty Key.`);
}

async function merge(originalFile, newLangFile, outputFile) {
  if (!fs.existsSync(originalFile) || !fs.existsSync(newLangFile)) {
    console.error('Original or new lang file not found.');
    return;
  }

  console.log(`Starting merge process at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}...`);
  console.log(`- Original file: ${originalFile}`);
  console.log(`- New language file: ${newLangFile}`);
  console.log(`- Output file: ${outputFile}`);

  // Parse original file
  const origRows = [];
  const origKeys = new Set();
  const origDuplicates = new Map(); // Key -> count
  await new Promise((resolve, reject) => {
    fs.createReadStream(originalFile)
      .pipe(csvParser())
      .on('data', (row) => {
        if (row.Key && row.Key.trim() !== '') {
          const trimmedKey = row.Key.trim();
          origRows.push(row);
          if (origKeys.has(trimmedKey)) {
            const count = origDuplicates.get(trimmedKey) || 1;
            origDuplicates.set(trimmedKey, count + 1);
          } else {
            origKeys.add(trimmedKey);
          }
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (origRows.length === 0) {
    console.error('No valid data (with non-empty Key) in original file.');
    return;
  }

  const origHeaders = Object.keys(origRows[0]);
  console.log(`- Original file has ${origRows.length} rows with non-empty Key.`);
  console.log(`- Original unique Keys: ${origKeys.size} (duplicates: ${origDuplicates.size > 0 ? `Yes (${[...origDuplicates.values()].reduce((a, b) => a + (b - 1), 0)} extra rows from ${origDuplicates.size} keys)` : 'No'})`);

  // Log first 3 duplicates if any
  if (origDuplicates.size > 0) {
    const dupExamples = [...origDuplicates.entries()].slice(0, 3).map(([k, v]) => `${k}: ${v} times`);
    console.log(`  Duplicate examples: ${dupExamples.join(', ')}`);
  }

  // Parse new lang file (keep order for duplicate handling)
  const newRows = [];
  const newKeys = new Set();
  const newDuplicates = new Map();
  const newLangValues = []; // Array of values in order for duplicate handling
  await new Promise((resolve, reject) => {
    fs.createReadStream(newLangFile)
      .pipe(csvParser())
      .on('data', (row) => {
        if (row.Key && row.Key.trim() !== '') {
          const trimmedKey = row.Key.trim();
          newRows.push(row);
          newLangValues.push(row[Object.keys(row)[1]] || ''); // Second column value
          if (newKeys.has(trimmedKey)) {
            const count = newDuplicates.get(trimmedKey) || 1;
            newDuplicates.set(trimmedKey, count + 1);
          } else {
            newKeys.add(trimmedKey);
          }
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (newRows.length === 0) {
    console.error('No valid data (with non-empty Key) in new lang file.');
    return;
  }

  console.log(`- New lang file has ${newRows.length} rows with non-empty Key.`);
  console.log(`- New lang unique Keys: ${newKeys.size} (duplicates: ${newDuplicates.size > 0 ? `Yes (${[...newDuplicates.values()].reduce((a, b) => a + (b - 1), 0)} extra rows from ${newDuplicates.size} keys)` : 'No'})`);

  // Log first 3 duplicates if any
  if (newDuplicates.size > 0) {
    const dupExamples = [...newDuplicates.entries()].slice(0, 3).map(([k, v]) => `${k}: ${v} times`);
    console.log(`  Duplicate examples: ${dupExamples.join(', ')}`);
  }

  // Get new lang name
  let newLangName = path.basename(newLangFile, '.csv')
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const newLangHeaders = Object.keys(newRows[0] || {});
  if (newLangHeaders.length !== 2 || newLangHeaders[0] !== 'Key') {
    console.error('New lang file must have exactly two columns: Key and the language value.');
    return;
  }

  const actualLangCol = newLangHeaders[1];
  newLangName = actualLangCol || newLangName;
  console.log(`- Detected language name: ${newLangName}`);

  // Track matching and non-matching (based on unique keys)
  const matchingKeys = new Set([...origKeys].filter(key => newKeys.has(key)));
  const missingInNew = new Set([...origKeys].filter(key => !newKeys.has(key)));
  const ignoredInNew = new Set([...newKeys].filter(key => !origKeys.has(key)));

  console.log(`- Matching unique Keys: ${matchingKeys.size}`);
  if (missingInNew.size > 0) {
    console.log(`- Unique Keys in original but missing in new lang (filled with empty): ${missingInNew.size}`);
    console.log(`  Missing Keys: ${[...missingInNew].join(', ')}`);
  } else {
    console.log(`- Unique Keys in original but missing in new lang: 0`);
  }
  if (ignoredInNew.size > 0) {
    console.log(`- Unique Keys in new lang but not in original (ignored): ${ignoredInNew.size}`);
    console.log(`  Ignored Keys: ${[...ignoredInNew].join(', ')}`);
  } else {
    console.log(`- Unique Keys in new lang but not in original: 0`);
  }

  // Expected matches based on unique keys
  const expectedMatches = origKeys.size - missingInNew.size;
  if (matchingKeys.size !== expectedMatches) {
    console.warn(`Warning: Expected ${expectedMatches} matching unique Keys, but found ${matchingKeys.size}. Data inconsistency.`);
  }

  // Add new column to all original rows using order-based mapping for duplicates
  const extendedRows = origRows.map((row, index) => {
    const extended = { ...row };
    // Use order-based mapping to preserve different values for duplicate keys
    extended[newLangName] = (index < newLangValues.length) ? newLangValues[index] : '';
    return extended;
  });

  // New headers
  const outputHeaders = [...origHeaders, newLangName];

  const writer = createCsvWriter({
    path: outputFile,
    header: outputHeaders.map(h => ({ id: h, title: h })),
  });

  await writer.writeRecords(extendedRows);
  console.log(`Merge completed at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}: Added column '${newLangName}' to ${outputFile}.`);
  console.log(`- Total rows in output: ${extendedRows.length} (preserves all original rows, including duplicates with order-based values)`);
  console.log(`- Output headers: ${outputHeaders.join(', ')}`);
}

(async () => {
  try {
    if (mode === 'split') {
      const inputFile = process.argv[3];
      const outputDir = process.argv[4];
      if (!inputFile || !outputDir) {
        console.error('Usage: node csv_translator.js split input.csv output_dir');
        return;
      }
      await split(inputFile, outputDir);
    } else if (mode === 'merge') {
      const originalFile = process.argv[3];
      const newLangFile = process.argv[4];
      const outputFile = process.argv[5];
      if (!originalFile || !newLangFile || !outputFile) {
        console.error('Usage: node csv_translator.js merge original.csv new_lang.csv output.csv');
        return;
      }
      await merge(originalFile, newLangFile, outputFile);
    }
  } catch (err) {
    console.error('Error:', err);
  }
})();