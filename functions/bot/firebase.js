// Conexión a Firebase y claves del bot. Todo lo demás de /bot la toma de acá.
"use strict";

const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

module.exports = {
  admin,
  db: admin.firestore(),
  // n8n manda esta clave en el header X-Agent-Key; el backend la manda de vuelta al avisarle algo.
  AGENT_API_KEY: process.env.AGENT_API_KEY || "",
  GOOGLE_MAPS_KEY: process.env.GOOGLE_MAPS_KEY || "",
  STORAGE_BUCKET: "gestion-028.firebasestorage.app",
  SERVE_COMPROBANTE_BASE: "https://us-central1-gestion-028.cloudfunctions.net/serveComprobante",
};
