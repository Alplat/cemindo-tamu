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

  CREATE TABLE IF NOT EXISTS karyawan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    departemen TEXT NOT NULL,
    no_wa TEXT
  );
`);

// Migrasi tabel tamu lama
const cols = db.prepare("PRAGMA table_info(tamu)").all();
if (!cols.some(c => c.name === 'checkout_at')) {
  db.exec('ALTER TABLE tamu ADD COLUMN checkout_at DATETIME');
}

// --- ISI DATA KARYAWAN DI SINI (GANTI DENGAN DATA ASLI) ---
// Cek apakah tabel karyawan kosong, jika ya, isi dengan data contoh
const cekKaryawan = db.prepare('SELECT COUNT(*) as count FROM karyawan').get();
if (cekKaryawan.count === 0) {
  const insert = db.prepare('INSERT INTO karyawan (nama, departemen, no_wa) VALUES (?, ?, ?)');
  // Pastikan format no_wa pakai kode negara (62) tanpa tanda +
  insert.run('Bpk. Budi Santoso', 'HRD', '6281234567890');
  insert.run('Ibu Siti Aminah', 'Finance', '6281234567891');
  insert.run('Bpk. Alfath Mulky', 'IT', '6282170575425');
  insert.run('Bpk. Rudi Hartono', 'Produksi', '6281234567893');
  insert.run('Ibu Dewi Lestari', 'Logistik', '6281234567894');
}

module.exports = db;