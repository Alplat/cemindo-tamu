const { createClient } = require('@libsql/client');

// Ambil kredensial dari Environment Variable (nanti diisi di Render)
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Buat tabel (query-nya sama seperti sebelumnya)
async function initDb() {
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
  console.log("Database Turso siap.");
}
initDb();

module.exports = db;
