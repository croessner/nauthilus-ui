const fs = require('fs');

// Read the ESLint report
const report = JSON.parse(fs.readFileSync('./quality/eslint-report.json', 'utf8'));

// Count issues by file
const issuesByFile = {};
let totalErrorCount = 0;
let totalWarningCount = 0;

report.forEach(fileReport => {
  if (fileReport.errorCount > 0 || fileReport.warningCount > 0) {
    const fileName = fileReport.filePath.split('/').pop();
    issuesByFile[fileName] = {
      filePath: fileReport.filePath,
      errorCount: fileReport.errorCount,
      warningCount: fileReport.warningCount,
      messages: fileReport.messages.map(msg => ({
        ruleId: msg.ruleId,
        severity: msg.severity === 2 ? 'error' : 'warning',
        message: msg.message,
        line: msg.line,
        column: msg.column
      }))
    };
    totalErrorCount += fileReport.errorCount;
    totalWarningCount += fileReport.warningCount;
  }
});

console.log(`Total: ${totalErrorCount} errors, ${totalWarningCount} warnings`);
console.log('\nFiles with issues:');
Object.keys(issuesByFile).forEach(file => {
  const issues = issuesByFile[file];
  console.log(`\n${file} (${issues.errorCount} errors, ${issues.warningCount} warnings):`);
  console.log(`Path: ${issues.filePath}`);
  
  // Group by rule ID
  const ruleGroups = {};
  issues.messages.forEach(msg => {
    if (!ruleGroups[msg.ruleId]) {
      ruleGroups[msg.ruleId] = [];
    }
    ruleGroups[msg.ruleId].push(msg);
  });
  
  // Print summary by rule
  Object.keys(ruleGroups).forEach(ruleId => {
    const msgs = ruleGroups[ruleId];
    console.log(`  ${ruleId}: ${msgs.length} issues`);
    // Print first 3 examples
    msgs.slice(0, 3).forEach(msg => {
      console.log(`    - Line ${msg.line}: ${msg.message}`);
    });
    if (msgs.length > 3) {
      console.log(`    - ... and ${msgs.length - 3} more`);
    }
  });
});
