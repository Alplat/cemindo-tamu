const { createClient } = require('@libsql/client');

// Mengambil URL dari .env, jika ada yang tidak sengaja pakai libsql://, kita ubah jadi https://
let dbUrl = process.env.TURSO_DATABASE_URL || '';
if (dbUrl.startsWith('libsql://')) {
  dbUrl = dbUrl.replace('libsql://', 'https://');
}

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  try {
    await db.execute(`
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database Turso siap dan tabel berhasil dibuat/dicek.");
  } catch (err) {
    console.error("❌ Gagal inisialisasi database:", err);
  }
}

initDb();

module.exports = db;
