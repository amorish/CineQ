const fs = require('fs');
const content = fs.readFileSync(process.env.USERPROFILE + '/Downloads/watchlist.csv', 'utf8');
function parseCSV(str) {
  const arr = [];
  let quote = false;
  let row = [], col = '';
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    if (cc === '\u0022' && quote && nc === '\u0022') { col += cc; ++c; continue; }
    if (cc === '\u0022') { quote = !quote; continue; }
    if (cc === ',' && !quote) { row.push(col.trim()); col = ''; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { row.push(col.trim()); arr.push(row); col = ''; row = []; ++c; continue; }
    if (cc === '\n' && !quote) { row.push(col.trim()); arr.push(row); col = ''; row = []; continue; }
    if (cc === '\r' && !quote) { row.push(col.trim()); arr.push(row); col = ''; row = []; continue; }
    col += cc;
  }
  if (col) row.push(col.trim());
  if (row.length) arr.push(row);
  return arr;
}
const rows = parseCSV(content);
const headers = rows[0].map(h => h.toLowerCase());
const nameIdx = headers.indexOf('name');
const yearIdx = headers.indexOf('year');
console.log('Headers:', headers);
console.log('Row 1:', rows[1]);
console.log('Row 1 Name:', rows[1][nameIdx], 'Year:', rows[1][yearIdx]);
