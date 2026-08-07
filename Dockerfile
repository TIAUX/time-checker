FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias e instalar
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copiar el resto del código
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Exponer puerto y ejecutar
EXPOSE 3000
CMD ["node", "backend/server.js"]