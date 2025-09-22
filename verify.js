const fs = require('fs');
const csv = require('csv-parser');

function validateTags(text, key) {
  const errors = [];
  const stack = [];
  
  // Regex for open tags: <tag=attr> or <tag attr="value">
  const openRegex = /<([a-zA-Z][a-zA-Z0-9_:-]*)[^>]*>/g;
  // Regex for close tags: </tag>
  const closeRegex = /<\/([a-zA-Z][a-zA-Z0-9_:-]*)>/g;
  
  let match;
  
  // Collect and sort all tags by position
  const allTags = [];
  
  // Open tags
  openRegex.lastIndex = 0;
  while ((match = openRegex.exec(text)) !== null) {
    allTags.push({ type: 'open', name: match[1].toLowerCase(), pos: match.index });
  }
  
  // Close tags
  closeRegex.lastIndex = 0;
  while ((match = closeRegex.exec(text)) !== null) {
    allTags.push({ type: 'close', name: match[1].toLowerCase(), pos: match.index });
  }
  
  // Sort by position
  allTags.sort((a, b) => a.pos - b.pos);
  
  // Process sequentially
  allTags.forEach(tag => {
    if (tag.type === 'open') {
      stack.push({ tag: tag.name, pos: tag.pos });
    } else {
      if (stack.length === 0) {
        errors.push(`Key: ${key} - Unmatched closing tag </${tag.name}> at position ${tag.pos}`);
        return;
      }
      const top = stack.pop();
      if (top.tag !== tag.name) {
        errors.push(`Key: ${key} - Mismatched tags: expected </${top.tag}> but found </${tag.name}> at position ${tag.pos} (opened <${top.tag}> at position ${top.pos}, requires </${top.tag}>)`);
      }
    }
  });
  
  // Unclosed tags
  while (stack.length > 0) {
    const top = stack.pop();
    errors.push(`Key: ${key} - Unclosed opening tag <${top.tag}> at position ${top.pos}, requires </${top.tag}>`);
  }
  
  return errors;
}

// Read and parse CSV using csv-parser
const allErrors = [];
fs.createReadStream('updated_english.csv')
  .pipe(csv())
  .on('data', (row) => {
    const key = row.Key;
    const english = row.English || '';
    const errors = validateTags(english, key);
    allErrors.push(...errors);
  })
  .on('end', () => {
    if (allErrors.length === 0) {
      console.log('All tags are properly matched in all keys!');
    } else {
      console.error('Validation errors:');
      allErrors.forEach(error => console.error(error));
      process.exit(1);
    }
  })
  .on('error', (err) => {
    console.error('Error reading CSV:', err);
    process.exit(1);
  });