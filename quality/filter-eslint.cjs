const fs = require('fs');
const path = require('path');

const FILE = process.argv[2];
if (!FILE) {
  console.error('Usage: node quality/filter-eslint.cjs <absolute-or-relative-file-path>');
  process.exit(2);
}
const abs = path.isAbsolute(FILE) ? FILE : path.resolve(process.cwd(), FILE);

const reportPath = path.resolve(process.cwd(), 'quality/eslint-report.json');
const json = fs.readFileSync(reportPath, 'utf8');
const report = JSON.parse(json);

const entry = report.find(r => r.filePath === abs || r.filePath.endsWith(FILE));
if (!entry) {
  console.log('No ESLint entry for file:', abs);
  process.exit(0);
}

console.log('\nESLint for', entry.filePath);
console.log('Errors:', entry.errorCount, 'Warnings:', entry.warningCount);
for (const m of entry.messages) {
  console.log(`[${m.severity === 2 ? 'error' : 'warn' }] ${m.ruleId} @${m.line}:${m.column} - ${m.message}`);
}
