const Database = require('/soft/oneplace/server/node_modules/better-sqlite3');
const db = Database('/soft/oneplace/data/oneplace.db');
const rows = db.prepare("SELECT filename FROM _migrations").all();
console.log('Migrations:', rows.map(r => r.filename).join(', '));
db.close();
