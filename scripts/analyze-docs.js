const fs = require('fs');
const path = require('path');

const docsDir = path.join(process.cwd(), 'docs');
const specsDir = path.join(process.cwd(), 'docs', 'specs');

function extractMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let title = '';
    let status = '';
    
    for (const line of lines) {
      if (line.startsWith('# ') && !title) {
        title = line.replace('# ', '').trim();
      }
      if (line.toLowerCase().includes('status:') && !status) {
        status = line.trim();
      }
      if (title && status) break;
    }
    
    return {
      file: path.relative(process.cwd(), filePath),
      title: title || '(No Title)',
      status: status || '(No Status)',
      size: content.length
    };
  } catch (e) {
    return { file: filePath, error: e.message };
  }
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      results.push(extractMetadata(path.join(dir, file)));
    }
  }
  return results;
}

const allDocs = [...scanDir(docsDir), ...scanDir(specsDir)];
console.log(JSON.stringify(allDocs, null, 2));
