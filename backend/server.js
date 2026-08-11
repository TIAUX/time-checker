// Ruta para exportar registros como CSV (protegida)
app.get('/api/submissions/export', authMiddleware, (req, res) => {
  try {
    const { start, end } = req.query;

    // Validar fechas
    if (!start || !end) {
      return res.status(400).json({ error: 'Se requieren los parámetros start y end (YYYY-MM-DD)' });
    }

    // Convertir a formato compatible con SQLite (asumiendo que las fechas vienen como YYYY-MM-DD)
    const startDate = start + 'T00:00:00.000Z';
    const endDate = end + 'T23:59:59.999Z';

    const rows = db.prepare(`
      SELECT name, video_filename, latitude, longitude, server_time, type, created_at
      FROM submissions
      WHERE server_time >= ? AND server_time <= ?
      ORDER BY server_time ASC
    `).all(startDate, endDate);

    // Generar CSV
    const header = 'Nombre,Latitud,Longitud,Fecha/Hora (servidor),Tipo,Archivo de video\n';
    const csvContent = rows.map(row => {
      const fecha = new Date(row.server_time).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      return `"${row.name}",${row.latitude},${row.longitude},"${fecha}","${row.type}","${row.video_filename}"`;
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