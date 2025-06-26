#!/bin/bash
set -e

echo "Removing node_modules directory..."
rm -rf node_modules

echo "Removing package-lock.json..."
rm -f package-lock.json

echo "Installing dependencies..."
npm install

echo "Verifying react-scripts installation..."
if [ -f node_modules/.bin/react-scripts ]; then
  echo "react-scripts is properly installed."
else
  echo "react-scripts is not properly installed. Installing it explicitly..."
  npm install react-scripts
fi

echo "Done! Try running 'npm start' now."
