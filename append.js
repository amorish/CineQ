const fs = require('fs');
const content = fs.readFileSync('temp2.js', 'utf8');
fs.appendFileSync('assets/js/app.js', content, 'utf8');
console.log('Appended successfully');
