#!/bin/bash
set -e

echo "Updating dependencies to fix deprecation warnings..."

# First, run the fix_npm.sh script to ensure we have a clean installation
./fix_npm.sh

echo "Installing updated Babel plugins..."
# Replace deprecated Babel plugins with their recommended alternatives
npm install --save-dev @babel/plugin-transform-private-methods @babel/plugin-transform-numeric-separator @babel/plugin-transform-nullish-coalescing-operator @babel/plugin-transform-class-properties @babel/plugin-transform-optional-chaining @babel/plugin-transform-private-property-in-object

echo "Updating other deprecated packages..."
# Update to @rollup/plugin-terser instead of rollup-plugin-terser
npm install --save-dev @rollup/plugin-terser

# Update to @eslint/config-array instead of @humanwhocodes/config-array
npm install --save-dev @eslint/config-array

# Update to @eslint/object-schema instead of @humanwhocodes/object-schema
npm install --save-dev @eslint/object-schema

# Update to @jridgewell/sourcemap-codec instead of sourcemap-codec
npm install --save-dev @jridgewell/sourcemap-codec

# Update to newer version of SVGO
npm install --save-dev svgo@latest

# Update to newer version of rimraf and glob
npm install --save-dev rimraf@latest glob@latest

echo "Running npm audit fix to address vulnerabilities..."
npm audit fix

echo "Dependencies have been updated. Some deprecation warnings may still appear due to transitive dependencies."
echo "To run the application, use: npm start"
