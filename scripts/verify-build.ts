import fs from 'fs';
import path from 'path';

const requiredFiles = [
  'dist/index.js',
  'dist/templates/plan.hbs',
  'dist/templates/phases.hbs',
  'dist/templates/verification.hbs',
  'dist/templates/review.hbs',
  'dist/templates/review-fix.hbs',
  'dist/templates/user-query.hbs',
  'dist/templates/epic-spec.hbs',
  'dist/templates/epic-ticket.hbs',
];

console.log('Verifying build...\n');

let hasErrors = false;

for (const file of requiredFiles) {
  const exists = fs.existsSync(file);
  const status = exists ? '\u2713' : '\u2717';
  console.log(`${status} ${file}`);
  if (!exists) hasErrors = true;
}

if (hasErrors) {
  console.error('\n\u274c Build verification failed!');
  console.error('Missing files detected. Run "pnpm build" to rebuild.');
  process.exit(1);
} else {
  console.log('\n\u2705 Build verified successfully!');
  process.exit(0);
}
