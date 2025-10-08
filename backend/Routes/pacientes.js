const express = require('express');
const router = express.Router();
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');
const storageService = require('../services/storageService');

const MAX_DOCUMENT_SIZE_BYTES = Number(process.env.MAX_DOCUMENT_SIZE_BYTES || 5 * 1024 * 1024);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const decodeBase64 = (input) => {
  if (!input) {
    throw new Error('El archivo recibido está vacío.');
  }

  const matches = input.match(/^data:(.+);base64,(.+)$/);
  const base64String = matches ? matches[2] : input;

  try {
    return Buffer.from(base64String, 'base64');
  } catch (error) {
    throw new Error('No se pudo decodificar el archivo enviado.');
  }
};

const normalizePacientePayload = async (payload, userId) => {
  const normalized = { ...payload };

  if (normalized.email === '') {
    normalized.email = undefined;
  }

  if (normalized.telefono === '') {
    normalized.telefono = undefined;
  }

  if (normalized.tipoAtencion !== 'centro') {
    normalized.tipoAtencion = 'particular';
    normalized.centroSalud = undefined;
    return normalized;
  }

  if (!normalized.centroSalud) {
    throw new Error('Debes seleccionar un centro de salud para pacientes atendidos por centro.');
  }

  const centro = await CentroSalud.findOne({ _id: normalized.centroSalud, user: userId });
  if (!centro) {
    throw new Error('Centro de salud no válido para este profesional.');
  }

  normalized.centroSalud = centro._id;
  return normalized;
};

router.post('/', protect, async (req, res) => {
  try {
    const payload = await normalizePacientePayload(req.body, req.user._id);

    const nuevoPaciente = new Paciente({
      ...payload,
      user: req.user._id,
    });

    await nuevoPaciente.save();
    await nuevoPaciente.populate('obraSocial');
    await nuevoPaciente.populate('centroSalud');

    res.status(201).json(nuevoPaciente);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El DNI ya está registrado para este profesional.' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const pacientes = await Paciente.find({ user: req.user._id })
      .populate('obraSocial')
      .populate('centroSalud');
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id })
      .populate('obraSocial')
      .populate('centroSalud');
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(paciente);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const payload = await normalizePacientePayload(req.body, req.user._id);

    const pacienteActualizado = await Paciente.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      payload,
      { new: true, runValidators: true }
    )
      .populate('obraSocial')
      .populate('centroSalud');

    if (!pacienteActualizado) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(pacienteActualizado);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El DNI ya está registrado para este profesional.' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const pacienteEliminado = await Paciente.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!pacienteEliminado) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });

    if (Array.isArray(pacienteEliminado.documentos)) {
      await Promise.all(pacienteEliminado.documentos.map((doc) => storageService.deleteDocument(doc.storageKey).catch(() => null)));
    }
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/documentos', protect, async (req, res) => {
  const { fileName, mimeType, base64Data, descripcion } = req.body || {};

  if (!fileName || !mimeType || !base64Data) {
    return res.status(400).json({ error: 'Debes enviar nombre, tipo y contenido del archivo.' });
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'El tipo de archivo no está permitido.' });
  }

  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id });
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const buffer = decodeBase64(base64Data);
    if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      return res.status(400).json({ error: 'El archivo supera el tamaño máximo permitido (5 MB).' });
    }

    const saved = await storageService.saveDocument({
      buffer,
      filename: fileName,
      mimeType,
    });

    const nuevoDocumento = paciente.documentos.create({
      nombreOriginal: fileName,
      descripcion: descripcion ? descripcion.trim() : '',
      mimeType,
      size: buffer.length,
      storageKey: saved.storageKey,
      uploadedBy: req.user._id,
    });
    nuevoDocumento.publicUrl = `/api/pacientes/${paciente._id}/documentos/${nuevoDocumento._id}/descarga`;

    paciente.documentos.push(nuevoDocumento);
    await paciente.save();

    const agregado = paciente.documentos[paciente.documentos.length - 1];
    res.status(201).json(agregado);
  } catch (error) {
    console.error('Error subiendo documento de paciente:', error);
    res.status(500).json({ error: 'No pudimos guardar el archivo. Intenta nuevamente.' });
  }
});

router.delete('/:id/documentos/:documentoId', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id });
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const documento = paciente.documentos.id(req.params.documentoId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    await storageService.deleteDocument(documento.storageKey);
    documento.deleteOne();
    await paciente.save();

    res.json({ message: 'Documento eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando documento de paciente:', error);
    res.status(500).json({ error: 'No pudimos eliminar el archivo.' });
  }
});

router.get('/:id/documentos/:documentoId/descarga', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id });
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const documento = paciente.documentos.id(req.params.documentoId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    res.setHeader('Content-Type', documento.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(documento.nombreOriginal)}"`);

    const stream = storageService.getDownloadStream(documento.storageKey);
    stream.on('error', (streamError) => {
      console.error('Error descargando documento de paciente:', streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No pudimos descargar el archivo.' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    console.error('Error obteniendo documento de paciente:', error);
    res.status(500).json({ error: 'No pudimos procesar la descarga.' });
  }
});

module.exports = router;
