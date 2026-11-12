const Database = require('better-sqlite3');
const db = new Database('tamu.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS tamu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT,
    hari TEXT,
    nama TEXT,
    nik TEXT,
    pic TEXT,
    departemen TEXT,
    keperluan TEXT,
    foto_selfie TEXT,
    foto_ktp TEXT,
    checkin_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checkout_at DATETIME
  );
`);

// Migrasi: Jika tabel lama belum punya checkout_at, tambahkan otomatis
const cols = db.prepare("PRAGMA table_info(tamu)").all();
if (!cols.some(c => c.name === 'checkout_at')) {
  db.exec('ALTER TABLE tamu ADD COLUMN checkout_at DATETIME');
}

module.exports = db;