const express = require('express');
const session = require('express-session');
const fs = require('fs');
const ExcelJS = require('exceljs');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'cemindo-rahasia',
  resave: false,
  saveUninitialized: true
}));

// Set folder public sebagai halaman web
app.use(express.static('public'));

// Buat folder upload untuk simpan foto
if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
}

// ==========================================
// API UNTUK TAMU (PUBLIK)
// ==========================================
app.post('/api/simpan', (req, res) => {
  try {
    const { nama, nik, pic, departemen, keperluan, foto_selfie, foto_ktp } = req.body;
    
    // Simpan foto base64 ke file
    let fileNameSelfie = '';
    let fileNameKtp = '';

    if (foto_selfie && foto_selfie.startsWith('data:image')) {
      fileNameSelfie = `selfie_${Date.now()}.jpg`;
      const base64Data = foto_selfie.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(`public/uploads/${fileNameSelfie}`, base64Data, 'base64');
    }

    if (foto_ktp && foto_ktp.startsWith('data:image')) {
      fileNameKtp = `ktp_${Date.now()}.jpg`;
      const base64Data = foto_ktp.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(`public/uploads/${fileNameKtp}`, base64Data, 'base64');
    }

    // Ambil tanggal dan hari
    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const hari = now.toLocaleDateString('id-ID', { weekday: 'long' });

    // Simpan ke database
    const stmt = db.prepare(`
      INSERT INTO tamu (tanggal, hari, nama, nik, pic, departemen, keperluan, foto_selfie, foto_ktp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(tanggal, hari, nama, nik, pic, departemen, keperluan, fileNameSelfie, fileNameKtp);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API UNTUK ADMIN
// ==========================================

// Middleware cek login admin
function cekLogin(req, res, next) {
  if (req.session.admin) next();
  else res.status(401).json({ error: 'Akses ditolak. Silakan login.' });
}

// Login Admin (User: admin, Pass: admin123)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Username/Password salah' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Ambil Data (Bisa Filter Tanggal / Bulan)
app.get('/api/data', cekLogin, (req, res) => {
  const { filter_type, bulan, tanggal } = req.query;
  let query = 'SELECT * FROM tamu';
  let params = [];

  if (filter_type === 'bulan' && bulan) {
    query += ' WHERE strftime(\'%Y-%m\', tanggal) = ?';
    params.push(bulan);
  } else if (filter_type === 'tanggal' && tanggal) {
    query += ' WHERE tanggal = ?';
    params.push(tanggal);
  }

  query += ' ORDER BY created_at DESC';
  const data = db.prepare(query).all(...params);
  res.json(data);
});

// Export Excel
app.get('/api/export', cekLogin, async (req, res) => {
  const { filter_type, bulan, tanggal } = req.query;
  let query = 'SELECT * FROM tamu';
  let params = [];
  let namaFile = 'Laporan_Semua.xlsx';

  if (filter_type === 'bulan' && bulan) {
    query += ' WHERE strftime(\'%Y-%m\', tanggal) = ?';
    params.push(bulan);
    namaFile = `Laporan_Bulan_${bulan}.xlsx`;
  } else if (filter_type === 'tanggal' && tanggal) {
    query += ' WHERE tanggal = ?';
    params.push(tanggal);
    namaFile = `Laporan_Tanggal_${tanggal}.xlsx`;
  }

  query += ' ORDER BY created_at DESC';
  const data = db.prepare(query).all(...params);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data Tamu');

  worksheet.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Tanggal', key: 'tanggal', width: 15 },
    { header: 'Hari', key: 'hari', width: 10 },
    { header: 'Nama Tamu', key: 'nama', width: 25 },
    { header: 'No ID Card / NIK', key: 'nik', width: 20 },
    { header: 'PIC yang Dituju', key: 'pic', width: 20 },
    { header: 'Departemen', key: 'departemen', width: 20 },
    { header: 'Keperluan', key: 'keperluan', width: 30 },
    { header: 'Waktu Input', key: 'created_at', width: 20 }
  ];

  // Styling Header (Warna Merah Cemindo)
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } }; // Red
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  data.forEach((row, index) => {
    worksheet.addRow({
      no: index + 1,
      tanggal: row.tanggal,
      hari: row.hari,
      nama: row.nama,
      nik: row.nik,
      pic: row.pic,
      departemen: row.departemen,
      keperluan: row.keperluan,
      created_at: new Date(row.created_at).toLocaleString('id-ID')
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${namaFile}"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ==========================================
// HALAMAN ROUTING
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/input', (req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
