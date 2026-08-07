const nameInput = document.getElementById('name');
const preview = document.getElementById('preview');
const btnEntrada = document.getElementById('btnEntrada');
const btnSalida = document.getElementById('btnSalida');
const statusDiv = document.getElementById('status');

let mediaRecorder;
let stream;
let currentType = null; // 'entrada' o 'salida'

async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    preview.srcObject = stream;
    btnEntrada.disabled = false;
    btnSalida.disabled = false;
    statusDiv.textContent = 'Cámara lista. Escribe tu nombre y presiona "Checar Entrada" o "Checar Salida".';
  } catch (err) {
    statusDiv.textContent = 'Error al acceder a la cámara/micrófono: ' + err.message;
    btnEntrada.disabled = true;
    btnSalida.disabled = true;
  }
}

function iniciarChecada(tipo) {
  const name = nameInput.value.trim();
  if (!name) {
    statusDiv.textContent = 'Por favor escribe tu nombre.';
    return;
  }
  if (!stream) {
    statusDiv.textContent = 'Cámara no disponible.';
    return;
  }
  if (!navigator.geolocation) {
    statusDiv.textContent = 'Tu navegador no soporta geolocalización.';
    return;
  }

  currentType = tipo;
  statusDiv.textContent = 'Obteniendo ubicación...';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      startRecording(position.coords.latitude, position.coords.longitude, name, tipo);
    },
    (error) => {
      statusDiv.textContent = 'Error al obtener ubicación: ' + error.message;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

btnEntrada.addEventListener('click', () => iniciarChecada('entrada'));
btnSalida.addEventListener('click', () => iniciarChecada('salida'));

function startRecording(latitude, longitude, name, type) {
  const chunks = [];
  // Intentar usar webm; si falla, usar formato por defecto
  let options = {};
  if (MediaRecorder.isTypeSupported('video/webm')) {
    options.mimeType = 'video/webm';
  }
  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: options.mimeType || 'video/webm' });
    await enviarVideo(blob, name, latitude, longitude, type);
  };

  mediaRecorder.start();
  btnEntrada.disabled = true;
  btnSalida.disabled = true;
  statusDiv.textContent = 'Grabando... (3 segundos)';

  setTimeout(() => {
    mediaRecorder.stop();
    statusDiv.textContent = 'Enviando...';
  }, 3000);
}

async function enviarVideo(blob, name, latitude, longitude, type) {
  const formData = new FormData();
  formData.append('video', blob, 'video.webm');
  formData.append('name', name);
  formData.append('latitude', latitude);
  formData.append('longitude', longitude);
  formData.append('type', type);  // <--- nuevo campo

  try {
    const response = await fetch('/api/submit', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) {
      statusDiv.textContent = `✔️ Checada de ${type.toUpperCase()} registrada correctamente.`;
      btnEntrada.disabled = false;
      btnSalida.disabled = false;
      nameInput.value = '';
    } else {
      statusDiv.textContent = 'Error del servidor: ' + (result.error || 'Desconocido');
      btnEntrada.disabled = false;
      btnSalida.disabled = false;
    }
  } catch (err) {
    statusDiv.textContent = 'Error de red: ' + err.message;
    btnEntrada.disabled = false;
    btnSalida.disabled = false;
  }
}

// Iniciar cámara al cargar
initCamera();