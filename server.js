require('dotenv').config();
const express = require('express');
const session = require('express-session');
const ExcelJS = require('exceljs');
const cloudinary = require('cloudinary').v2;
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'cemindo-rahasia',
  resave: false,
  saveUninitialized: true
}));

// Set folder public sebagai halaman web
app.use(express.static('public'));

// ==========================================
// API UNTUK TAMU (PUBLIK)
// ==========================================
app.post('/api/simpan', async (req, res) => {
  try {
    const { nama, nik, pic, departemen, keperluan, foto_selfie, foto_ktp } = req.body;
    
    let urlSelfie = '';
    let urlKtp = '';

    // Upload Foto Selfie ke Cloudinary
    if (foto_selfie && foto_selfie.startsWith('data:image')) {
      const uploadRes = await cloudinary.uploader.upload(foto_selfie, { 
        folder: 'cemindo_tamu',
        resource_type: 'image'
      });
      urlSelfie = uploadRes.secure_url; // Mengambil link https://...
    }

    // Upload Foto KTP ke Cloudinary
    if (foto_ktp && foto_ktp.startsWith('data:image')) {
      const uploadRes = await cloudinary.uploader.upload(foto_ktp, { 
        folder: 'cemindo_tamu',
        resource_type: 'image'
      });
      urlKtp = uploadRes.secure_url;
    }

    // Ambil tanggal dan hari
    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const hari = now.toLocaleDateString('id-ID', { weekday: 'long' });

    // Simpan ke database Turso
    await db.execute({
      sql: `INSERT INTO tamu (tanggal, hari, nama, nik, pic, departemen, keperluan, foto_selfie, foto_ktp) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [tanggal, hari, nama, nik, pic, departemen, keperluan, urlSelfie, urlKtp]
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API UNTUK ADMIN
// ==========================================
function cekLogin(req, res, next) {
  if (req.session.admin) next();
  else res.status(401).json({ error: 'Akses ditolak. Silakan login.' });
}

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

// Ambil Data (Filter Tanggal / Bulan)
app.get('/api/data', cekLogin, async (req, res) => {
  try {
    const { filter_type, bulan, tanggal } = req.query;
    let query = 'SELECT * FROM tamu';
    let args = [];

    if (filter_type === 'bulan' && bulan) {
      query += " WHERE strftime('%Y-%m', tanggal) = ?";
      args.push(bulan);
    } else if (filter_type === 'tanggal' && tanggal) {
      query += ' WHERE tanggal = ?';
      args.push(tanggal);
    }

    query += ' ORDER BY created_at DESC';
    
    const result = await db.execute({ sql: query, args: args });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Excel
app.get('/api/export', cekLogin, async (req, res) => {
  try {
    const { filter_type, bulan, tanggal } = req.query;
    let query = 'SELECT * FROM tamu';
    let args = [];
    let namaFile = 'Laporan_Semua.xlsx';

    if (filter_type === 'bulan' && bulan) {
      query += " WHERE strftime('%Y-%m', tanggal) = ?";
      args.push(bulan);
      namaFile = `Laporan_Bulan_${bulan}.xlsx`;
    } else if (filter_type === 'tanggal' && tanggal) {
      query += ' WHERE tanggal = ?';
      args.push(tanggal);
      namaFile = `Laporan_Tanggal_${tanggal}.xlsx`;
    }

    query += ' ORDER BY created_at DESC';
    const result = await db.execute({ sql: query, args: args });
    const data = result.rows;

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

    // Styling Header
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Routing
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/input', (req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
