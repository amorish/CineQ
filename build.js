const fs = require('fs');
const path = require('path');

const envFileContent = `
window.ENV = {
  FIREBASE_API_KEY: "${process.env.FIREBASE_API_KEY || ''}",
  TMDB_TOKEN: "${process.env.TMDB_TOKEN || ''}"
};
`;

const destPath = path.join(__dirname, 'assets', 'js', 'env.js');
fs.writeFileSync(destPath, envFileContent.trim());
console.log('✅ Generated assets/js/env.js successfully.');
