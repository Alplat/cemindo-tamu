const express = require('express');
const session = require('express-session');
const ExcelJS = require('exceljs');
const db = require('./database');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'cemindo-rahasia',
  resave: false,
  saveUninitialized: true
}));

app.use(express.static('public'));

// ==========================================
// API UNTUK TAMU (PUBLIK)
// ==========================================
app.post('/api/simpan', (req, res) => {
  try {
    const { nama, nik, pic, departemen, keperluan, foto_selfie, foto_ktp } = req.body;
    
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

    const now = new Date();
    const tanggal = now.toISOString().split('T')[0];
    const hari = now.toLocaleDateString('id-ID', { weekday: 'long' });

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

// API DATA (Search & Pagination)
app.get('/api/data', cekLogin, (req, res) => {
  try {
    const { filter_type, bulan, tanggal, search, page, limit } = req.query;
    let query = 'SELECT * FROM tamu WHERE 1=1';
    let params = [];

    if (filter_type === 'bulan' && bulan) {
      query += " AND strftime('%Y-%m', tanggal) = ?";
      params.push(bulan);
    } else if (filter_type === 'tanggal' && tanggal) {
      query += ' AND tanggal = ?';
      params.push(tanggal);
    }

    // Fitur Search
    if (search) {
      query += ' AND (nama LIKE ? OR nik LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Hitung Total Data (untuk pagination)
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countQuery).get(...params).total;

    // Pagination
    const limitNum = parseInt(limit) || 10;
    const pageNum = parseInt(page) || 1;
    const offset = (pageNum - 1) * limitNum;

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);
    
    const data = db.prepare(query).all(...params);
    res.json({ data, total, page: pageNum, limit: limitNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Checkout Tamu
app.post('/api/checkout/:id', cekLogin, (req, res) => {
  try {
    const { id } = req.params;
    const tamu = db.prepare('SELECT * FROM tamu WHERE id = ?').get(id);
    
    if (!tamu) return res.status(404).json({ error: 'Tamu tidak ditemukan' });
    if (tamu.checkout_at) return res.status(400).json({ error: 'Tamu sudah checkout' });

    db.prepare('UPDATE tamu SET checkout_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ success: true, message: `${tamu.nama} telah checkout` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API STATISTIK
app.get('/api/stats', cekLogin, (req, res) => {
  try {
    const queryHarian = `SELECT tanggal, COUNT(*) as jumlah FROM tamu GROUP BY tanggal ORDER BY tanggal DESC LIMIT 7`;
    const dataHarian = db.prepare(queryHarian).all().reverse(); 
    const queryDept = `SELECT departemen, COUNT(*) as jumlah FROM tamu GROUP BY departemen`;
    const dataDept = db.prepare(queryDept).all();
    res.json({ harian: dataHarian, departemen: dataDept });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Excel
app.get('/api/export', cekLogin, async (req, res) => {
  try {
    const { filter_type, bulan, tanggal } = req.query;
    let query = 'SELECT * FROM tamu WHERE 1=1';
    let params = [];
    let namaFile = 'Laporan_Semua.xlsx';

    if (filter_type === 'bulan' && bulan) {
      query += " AND strftime('%Y-%m', tanggal) = ?";
      params.push(bulan);
      namaFile = `Laporan_Bulan_${bulan}.xlsx`;
    } else if (filter_type === 'tanggal' && tanggal) {
      query += ' AND tanggal = ?';
      params.push(tanggal);
      namaFile = `Laporan_Tanggal_${tanggal}.xlsx`;
    }

    query += ' ORDER BY id DESC';
    const data = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Tamu');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 }, { header: 'Tanggal', key: 'tanggal', width: 15 },
      { header: 'Hari', key: 'hari', width: 10 }, { header: 'Nama Tamu', key: 'nama', width: 25 },
      { header: 'NIK', key: 'nik', width: 20 }, { header: 'PIC', key: 'pic', width: 20 },
      { header: 'Departemen', key: 'departemen', width: 20 }, { header: 'Keperluan', key: 'keperluan', width: 30 },
      { header: 'Waktu Masuk', key: 'checkin_at', width: 20 }, { header: 'Waktu Keluar', key: 'checkout_at', width: 20 }
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    data.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1, tanggal: row.tanggal, hari: row.hari, nama: row.nama, nik: row.nik,
        pic: row.pic, departemen: row.departemen, keperluan: row.keperluan,
        checkin_at: new Date(row.checkin_at).toLocaleString('id-ID'),
        checkout_at: row.checkout_at ? new Date(row.checkout_at).toLocaleString('id-ID') : '-'
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/input', (req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di port ${PORT}`);
});