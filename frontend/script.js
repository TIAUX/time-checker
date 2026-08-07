const nameInput = document.getElementById('name');
const preview = document.getElementById('preview');
const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');

let mediaRecorder;
let stream;

async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    preview.srcObject = stream;
    startBtn.disabled = false;
    statusDiv.textContent = 'Cámara lista. Escribe tu nombre y presiona "Grabar".';
  } catch (err) {
    statusDiv.textContent = 'Error al acceder a la cámara/micrófono: ' + err.message;
    startBtn.disabled = true;
  }
}

startBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) {
    statusDiv.textContent = 'Por favor escribe tu nombre.';
    return;
  }

  if (!stream) {
    statusDiv.textContent = 'Cámara no disponible.';
    return;
  }

  // Verificar permisos de geolocalización
  if (!navigator.geolocation) {
    statusDiv.textContent = 'Tu navegador no soporta geolocalización.';
    return;
  }

  statusDiv.textContent = 'Obteniendo ubicación...';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      startRecording(position.coords.latitude, position.coords.longitude, name);
    },
    (error) => {
      statusDiv.textContent = 'Error al obtener ubicación: ' + error.message;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

function startRecording(latitude, longitude, name) {
  const chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    await enviarVideo(blob, name, latitude, longitude);
  };

  mediaRecorder.start();
  startBtn.disabled = true;
  statusDiv.textContent = 'Grabando... (3 segundos)';

  setTimeout(() => {
    mediaRecorder.stop();
    statusDiv.textContent = 'Enviando...';
  }, 3000);
}

async function enviarVideo(blob, name, latitude, longitude) {
  const formData = new FormData();
  formData.append('video', blob, 'video.webm');
  formData.append('name', name);
  formData.append('latitude', latitude);
  formData.append('longitude', longitude);

  try {
    const response = await fetch('/api/submit', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) {
      statusDiv.textContent = '¡Video enviado correctamente!';
      startBtn.disabled = false;
      nameInput.value = '';
    } else {
      statusDiv.textContent = 'Error del servidor: ' + (result.error || 'Desconocido');
      startBtn.disabled = false;
    }
  } catch (err) {
    statusDiv.textContent = 'Error de red: ' + err.message;
    startBtn.disabled = false;
  }
}

// Inicializar cámara al cargar
initCamera();