const Database = require('/soft/oneplace/server/node_modules/better-sqlite3');
const db = Database('/soft/oneplace/data/oneplace.db');
const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('password_hash');
console.log('password_hash:', row ? row.value : 'NOT FOUND');
db.close();
