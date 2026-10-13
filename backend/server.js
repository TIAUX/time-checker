const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');
const basicAuth = require('express-basic-auth');

// ─── CONFIGURACIÓN ─────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambiame123';

// Asegurar directorios
[UPLOADS_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── BASE DE DATOS ────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    video_filename TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    server_time TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'entrada',
    valid INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migraciones para columnas agregadas posteriormente
try {
  db.exec(`ALTER TABLE submissions ADD COLUMN type TEXT NOT NULL DEFAULT 'entrada'`);
} catch (e) { /* ya existe */ }
try {
  db.exec(`ALTER TABLE submissions ADD COLUMN valid INTEGER NOT NULL DEFAULT 1`);
} catch (e) { /* ya existe */ }

// ─── MIDDLEWARE ───────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const authMiddleware = basicAuth({
  users: { [ADMIN_USER]: ADMIN_PASSWORD },
  challenge: true,
  realm: 'Panel de Administración',
});

// Ruta protegida para el panel
app.get('/admin', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

// API de envíos protegida
app.get('/api/submissions', authMiddleware, (req, res) => {
  try {
    // Paginación en el servidor: solo se consultan los registros de la página solicitada.
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const allowedPageSizes = [25, 50, 100];
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 25;
    const limit = allowedPageSizes.includes(requestedLimit) ? requestedLimit : 25;
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) AS total FROM submissions').get().total;
    const rows = db.prepare(
      'SELECT * FROM submissions ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// ─── EXPORTACIÓN CSV (protegida) ─────────────────
app.get('/api/submissions/export', authMiddleware, (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Se requieren los parámetros start y end (YYYY-MM-DD)' });
    }

    const startDate = start + 'T00:00:00.000Z';
    const endDate = end + 'T23:59:59.999Z';

    const rows = db.prepare(`
      SELECT name, video_filename, latitude, longitude, server_time, type, created_at, valid
      FROM submissions
      WHERE server_time >= ? AND server_time <= ?
      ORDER BY server_time ASC
    `).all(startDate, endDate);

    const header = 'Nombre,Latitud,Longitud,Fecha/Hora (servidor),Tipo,Archivo de video,Válido\n';
    const csvContent = rows.map(row => {
      const fecha = new Date(row.server_time).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      const valido = row.valid ? 'Sí' : 'No';
      return `"${row.name}",${row.latitude},${row.longitude},"${fecha}","${row.type}","${row.video_filename}","${valido}"`;
    }).join('\n');

    const csv = header + csvContent;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="registros_${start}_al_${end}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al exportar datos' });
  }
});

// ─── TOGGLE VALIDEZ ──────────────────────────────
app.put('/api/submissions/:id/toggle-valid', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT valid FROM submissions WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    const newValid = row.valid ? 0 : 1;
    db.prepare('UPDATE submissions SET valid = ? WHERE id = ?').run(newValid, id);
    res.json({ success: true, valid: newValid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cambiar validez' });
  }
});

// ─── SUBIDA DE VIDEOS (pública) ─────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '.webm');
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de video'));
    }
  }
});

app.post('/api/submit', upload.single('video'), (req, res) => {
  try {
    const { name, latitude, longitude, type } = req.body;
    if (!name || !latitude || !longitude || !req.file || !type) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    if (type !== 'entrada' && type !== 'salida') {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const videoFilename = req.file.filename;
    const serverTime = new Date().toISOString();

    db.prepare(
      'INSERT INTO submissions (name, video_filename, latitude, longitude, server_time, type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, videoFilename, parseFloat(latitude), parseFloat(longitude), serverTime, type);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Manejo de errores de multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});