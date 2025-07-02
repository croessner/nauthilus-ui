
mkdir -p quality
npx eslint . --format json > quality/eslint-report.json
npx tsc --noEmit --pretty false > quality/typescript-errors.txt

