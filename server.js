const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

// Menangkap error yang tidak terduga agar tidak mati diam-diam
process.on('uncaughtException', (err) => console.error('CRASH TERDETEKSI:', err));
process.on('unhandledRejection', (err) => console.error('JANJI GAGAL (Promise):', err));

const path = require('path'); // Tambahkan modul path

const app = express();
app.use(cors());
app.use(express.json());

// Log setiap request yang masuk
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Request: ${req.method} ${req.url}`);
  next();
});

app.use(express.static('.'));

console.log('Mencoba menyambung ke database...');
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'praktikum_bds',
  password: process.env.DB_PASSWORD || '000513',
  port: process.env.DB_PORT || 5432,
  ssl: (process.env.DB_SSL && String(process.env.DB_SSL).replace(/"/g, '') === 'true') 
       ? { rejectUnauthorized: false } : false 
});

// Jalankan server
const PORT = process.env.PORT || 3000;
console.log('Mencoba listen di port:', PORT);

app.listen(PORT, () => {
  console.log(`✅ SERVER AKTIF DI PORT: ${PORT}`);
});

// Rute utama: Mengirim file Peta (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.send('OK');
});

// Tes koneksi di latar belakang
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('KONEKSI DATABASE GAGAL:', err.message);
  else console.log('KONEKSI DATABASE BERHASIL PADA:', res.rows[0].now);
});

console.log('--- BOOTING COMPLETE ---');

// ============================================================
// Helper: ambil next ID untuk tabel yang tidak auto-increment
// ============================================================
async function getNextId(table, idColumn) {
  const result = await pool.query(`SELECT COALESCE(MAX(${idColumn}), 0) + 1 AS next_id FROM ${table}`);
  return result.rows[0].next_id;
}

// ============================================================
// 1. JALAN
// ============================================================
app.get('/api/jalan', async (req, res) => {
  try {
    const query = `SELECT id_jalan, nama_jalan, lebar_jalan, konstruksi, kondisi, kelas, arah, ST_AsGeoJSON(jl_geom) as geometry FROM jalan`;
    const result = await pool.query(query);
    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: { id_jalan: row.id_jalan, nama_jalan: row.nama_jalan, lebar_jalan: row.lebar_jalan,
        konstruksi: row.konstruksi, kondisi: row.kondisi, kelas: row.kelas, arah: row.arah },
      geometry: JSON.parse(row.geometry)
    }));
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jalan', async (req, res) => {
  const { nama_jalan, lebar_jalan, konstruksi, kondisi, kelas, arah, geometry } = req.body;
  try {
    const nextId = await getNextId('jalan', 'id_jalan');
    const query = `
      INSERT INTO jalan (id_jalan, nama_jalan, lebar_jalan, konstruksi, kondisi, kelas, arah, jl_geom)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_GeomFromGeoJSON($8), 4326))
      RETURNING id_jalan;
    `;
    const values = [nextId, nama_jalan, lebar_jalan, konstruksi, kondisi, kelas, arah, JSON.stringify(geometry)];
    const result = await pool.query(query, values);
    res.json({ status: 'Success', id: result.rows[0].id_jalan });
  } catch (err) {
    console.error('Error simpan jalan:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. LANDUSE
// ============================================================
app.get('/api/landuse', async (req, res) => {
  try {
    const query = `SELECT id_landuse, penggunaan, luas, ST_AsGeoJSON(landuse_geom) as geometry FROM landuse`;
    const result = await pool.query(query);
    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: { id_landuse: row.id_landuse, penggunaan: row.penggunaan, luas: row.luas },
      geometry: JSON.parse(row.geometry)
    }));
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/landuse', async (req, res) => {
  const { penggunaan, luas, geometry } = req.body;
  try {
    const nextId = await getNextId('landuse', 'id_landuse');
    const query = `
      INSERT INTO landuse (id_landuse, penggunaan, luas, landuse_geom)
      VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
      RETURNING id_landuse;
    `;
    const values = [nextId, penggunaan, luas, JSON.stringify(geometry)];
    const result = await pool.query(query, values);
    res.json({ status: 'Success', id: result.rows[0].id_landuse });
  } catch (err) {
    console.error('Error simpan landuse:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3. TOWER
// ============================================================
app.get('/api/tower', async (req, res) => {
  try {
    const query = `SELECT id_tower, tinggi, luas_tapak, konstruksi, tahun_pembuatan, pt_pembuat, id_provider, ST_AsGeoJSON(tower_geom) as geometry FROM tower`;
    const result = await pool.query(query);
    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: { id_tower: row.id_tower, tinggi: row.tinggi, luas_tapak: row.luas_tapak,
        konstruksi: row.konstruksi, tahun_pembuatan: row.tahun_pembuatan,
        pt_pembuat: row.pt_pembuat, id_provider: row.id_provider },
      geometry: JSON.parse(row.geometry)
    }));
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tower', async (req, res) => {
  const { tinggi, luas_tapak, konstruksi, tahun_pembuatan, pt_pembuat, id_provider, geometry } = req.body;
  try {
    const nextId = await getNextId('tower', 'id_tower');
    const query = `
      INSERT INTO tower (id_tower, tinggi, luas_tapak, konstruksi, tahun_pembuatan, pt_pembuat, id_provider, tower_geom)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_GeomFromGeoJSON($8), 4326))
      RETURNING id_tower;
    `;
    const values = [nextId, tinggi, luas_tapak, konstruksi, tahun_pembuatan, pt_pembuat, id_provider, JSON.stringify(geometry)];
    const result = await pool.query(query, values);
    res.json({ status: 'Success', id: result.rows[0].id_tower });
  } catch (err) {
    console.error('Error simpan tower:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4. WILAYAH
// ============================================================
app.get('/api/wilayah', async (req, res) => {
  try {
    const query = `SELECT id_wilayah, kabupaten, nama_bupati, ST_AsGeoJSON(wilayah_geom) as geometry FROM wilayah`;
    const result = await pool.query(query);
    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: { id_wilayah: row.id_wilayah, kabupaten: row.kabupaten, nama_bupati: row.nama_bupati },
      geometry: JSON.parse(row.geometry)
    }));
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wilayah', async (req, res) => {
  const { kabupaten, nama_bupati, geometry } = req.body;
  try {
    const nextId = await getNextId('wilayah', 'id_wilayah');
    const query = `
      INSERT INTO wilayah (id_wilayah, kabupaten, nama_bupati, wilayah_geom)
      VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
      RETURNING id_wilayah;
    `;
    const values = [nextId, kabupaten, nama_bupati, JSON.stringify(geometry)];
    const result = await pool.query(query, values);
    res.json({ status: 'Success', id: result.rows[0].id_wilayah });
  } catch (err) {
    console.error('Error simpan wilayah:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 5. PROVIDER (data non-spasial, untuk referensi tower)
// ============================================================
app.get('/api/provider', async (req, res) => {
  try {
    const result = await pool.query('SELECT id_provider, provider, jns_jaringan, pemilik_saham, produk, alamat_ktr FROM provider');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 6. ENDPOINT GLOBAL: DELETE & UPDATE
// ============================================================

// Mapping Primary Key per Tabel
const pkMap = {
  jalan: 'id_jalan',
  landuse: 'id_landuse',
  tower: 'id_tower',
  wilayah: 'id_wilayah'
};

// A. Hapus Data
app.delete('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const pk = pkMap[table];
  
  if (!pk) return res.status(400).json({ error: 'Tabel tidak valid' });

  try {
    const query = `DELETE FROM ${table} WHERE ${pk} = $1`;
    await pool.query(query, [id]);
    res.json({ status: 'Deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B. Update Geometri (Drag/Edit bentuk di peta)
app.put('/api/:table/:id/geometry', async (req, res) => {
  const { table, id } = req.params;
  const { geometry } = req.body;
  const pk = pkMap[table];
  
  // Mapping nama kolom geometri per tabel
  const geomColMap = {
    jalan: 'jl_geom',
    landuse: 'landuse_geom',
    tower: 'tower_geom',
    wilayah: 'wilayah_geom'
  };

  const geomCol = geomColMap[table];
  if (!pk || !geomCol) return res.status(400).json({ error: 'Tabel tidak valid' });

  try {
    const query = `
      UPDATE ${table} 
      SET ${geomCol} = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
      WHERE ${pk} = $2
    `;
    await pool.query(query, [JSON.stringify(geometry), id]);
    res.json({ status: 'Updated Geometry', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 7. ANALISIS SPASIAL: PANJANG JALAN PER WILAYAH
// ============================================================
app.get('/api/analisis/panjang-jalan', async (req, res) => {
  try {
    const query = `
      SELECT 
        w.id_wilayah,
        w.kabupaten, 
        ROUND(SUM(ST_Length(ST_Intersection(j.jl_geom, w.wilayah_geom)::geography))::numeric / 1000, 2) AS total_km
      FROM jalan j, wilayah w
      WHERE ST_Intersects(j.jl_geom, w.wilayah_geom)
      GROUP BY w.id_wilayah, w.kabupaten
      ORDER BY total_km DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error Analisis:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 8. QUERY SQL BEBAS (SQL CONSOLE) - Dengan Fitur Auto-Detect Geometri
// ============================================================
app.post('/api/query', async (req, res) => {
  const { sql } = req.body;
  
  try {
    // 1. Jalankan query asli dulu untuk mendapatkan metadata kolom
    const initialResult = await pool.query(sql);
    const columns = initialResult.fields.map(f => f.name);
    
    // Cari tahu mana saja kolom yang bertipe 'geometry' (OID biasanya 16391)
    // atau yang namanya mengandung 'geom' atau diawali dengan 'st_'
    const geomColumns = initialResult.fields
      .filter(f => f.dataTypeID === 16391 || f.name.toLowerCase().includes('geom') || f.name.toLowerCase().startsWith('st_'))
      .map(f => f.name);

    // CEK DUPLIKAT: Jika user sudah punya kolom bernama 'geometry', 
    // kita tidak perlu menambahkan auto-geometry lagi.
    const alreadyHasGeometry = columns.some(c => c.toLowerCase() === 'geometry');

    // Jika sama sekali tidak ada kolom geometri (baik manual atau otomatis), baru kirim apa adanya
    if (geomColumns.length === 0 && !alreadyHasGeometry) {
      return res.json({ columns, rows: initialResult.rows });
    }

    // 2. Bungkus query untuk memastikan output adalah GeoJSON yang dimengerti Leaflet
    // Jika user sudah punya kolom 'geometry', kita konversi ulang agar PASTI GeoJSON
    // Jika tidak ada, kita buat dari kolom geomColumns[0]
    let finalGeomExpr = "";
    if (alreadyHasGeometry) {
      finalGeomExpr = `ST_AsGeoJSON("${columns.find(c => c.toLowerCase() === 'geometry')}") as geometry`;
    } else {
      finalGeomExpr = `ST_AsGeoJSON("${geomColumns[0]}") as geometry`;
    }

    const otherCols = columns
      .filter(c => c.toLowerCase() !== 'geometry' && !geomColumns.includes(c))
      .map(c => `"${c}"`)
      .join(', ');

    // Bersihkan komentar SQL (-- dan /* */) agar tidak merusak subquery
    const cleanSql = sql
      .replace(/--.*$/gm, '')           // Hapus komentar baris tunggal
      .replace(/\/\*[\s\S]*?\*\//g, '') // Hapus komentar blok
      .replace(/;/g, '');               // Hapus titik koma

    const wrapperQuery = `
      SELECT ${otherCols ? otherCols + ',' : ''} ${finalGeomExpr}
      FROM (${cleanSql}) AS __subquery__
    `;

    console.log('FINAL SPATIAL WRAPPER:', wrapperQuery);
    const finalResult = await pool.query(wrapperQuery);
    res.json({
      columns: finalResult.fields.map(f => f.name),
      rows: finalResult.rows
    });

  } catch (err) {
    console.error('SQL Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Server sudah dijalankan di bagian atas file.
