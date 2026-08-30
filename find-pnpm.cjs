const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '${APPDATA}', 'npm');

function walk(dir, depth = 0) {
  if (depth > 3) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      console.log('  '.repeat(depth) + (entry.isDirectory() ? '📁 ' : '📄 ') + entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
    }
  } catch (e) {
    console.log(`Cannot read: ${dir} - ${e.message}`);
  }
}

console.log('=== Scanning:', base, '===');
walk(base);