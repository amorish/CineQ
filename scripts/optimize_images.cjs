const fs = require('fs');
const path = require('path');

const appHtmlPath = path.join(__dirname, '..', 'app.html');
let html = fs.readFileSync(appHtmlPath, 'utf8');

// Add loading="lazy" to all poster images if they don't have it
html = html.replace(/<img src="assets\/images\/posters\/([^"]+)" alt="([^"]+)">/g, '<img src="assets/images/posters/$1" alt="$2" loading="lazy">');

fs.writeFileSync(appHtmlPath, html);
console.log('Optimized images in app.html');
