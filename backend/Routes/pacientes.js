const express = require('express');
const router = express.Router();
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');
const storageService = require('../services/storageService');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const sanitizeBase64 = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const parts = value.split(',');
  return parts.length > 1 ? parts.slice(1).join(',') : parts[0];
};

const decodeBase64File = (base64String) => {
  const sanitized = sanitizeBase64(base64String);
  if (!sanitized) {
    throw new Error('El archivo recibido no es válido.');
  }

  try {
    return Buffer.from(sanitized, 'base64');
  } catch (error) {
    throw new Error('No se pudo decodificar el archivo adjunto.');
  }
};

const buildDocumentResponse = (document, pacienteId) => {
  if (!document) {
    return null;
  }

  const downloadUrl = storageService.getTemporaryUrl({
    storage: document.storage,
    key: document.key,
    expiresInSeconds: 300,
  });

  return {
    _id: document._id,
    nombre: document.nombre,
    descripcion: document.descripcion || '',
    contentType: document.contentType || 'application/octet-stream',
    size: document.size || 0,
    storage: document.storage,
    bucket: document.bucket || null,
    uploadedBy: document.uploadedBy,
    createdAt: document.createdAt,
    downloadUrl,
    downloadPath: `/api/pacientes/${pacienteId}/documentos/${document._id}/descargar`,
  };
};

const buildPacienteResponse = (pacienteDoc) => {
  if (!pacienteDoc) {
    return null;
  }

  const plain = pacienteDoc.toObject({ virtuals: true });
  plain.documentos = Array.isArray(plain.documentos)
    ? plain.documentos.map((doc) => buildDocumentResponse(doc, pacienteDoc._id)).filter(Boolean)
    : [];
  return plain;
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

    res.status(201).json(buildPacienteResponse(nuevoPaciente));
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
    const payload = pacientes.map((paciente) => buildPacienteResponse(paciente));
    res.json(payload);
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
    res.json(buildPacienteResponse(paciente));
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
    res.json(buildPacienteResponse(pacienteActualizado));
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
      await Promise.all(pacienteEliminado.documentos.map((doc) => storageService.deleteDocument({
        storage: doc.storage,
        key: doc.key,
      })));
    }
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/documentos', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id });
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const descripcion = typeof req.body.descripcion === 'string' ? req.body.descripcion.trim() : '';
    const archivo = req.body.archivo || {};

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del documento es obligatorio.' });
    }

    if (!archivo.base64 || !archivo.nombre) {
      return res.status(400).json({ error: 'Debes adjuntar un archivo válido.' });
    }

    const buffer = decodeBase64File(archivo.base64);
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'El archivo adjunto está vacío.' });
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido (10 MB).' });
    }

    const contentType = typeof archivo.tipo === 'string' && archivo.tipo.trim() !== ''
      ? archivo.tipo.trim()
      : (typeof archivo.contentType === 'string' ? archivo.contentType.trim() : 'application/octet-stream');

    const storagePayload = await storageService.uploadDocument({
      buffer,
      originalName: archivo.nombre,
      contentType,
      folder: `users/${req.user._id}/pacientes`,
    });

    const documento = {
      nombre,
      descripcion,
      storage: storagePayload.storage,
      key: storagePayload.key,
      bucket: storagePayload.bucket,
      contentType,
      size: storagePayload.size,
      uploadedBy: req.user._id,
    };

    paciente.documentos.push(documento);
    await paciente.save();

    const savedDocument = paciente.documentos[paciente.documentos.length - 1];
    res.status(201).json(buildDocumentResponse(savedDocument, paciente._id));
  } catch (error) {
    res.status(400).json({ error: error.message });
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

    await storageService.deleteDocument({ storage: documento.storage, key: documento.key });
    documento.deleteOne();
    await paciente.save();

    res.json({ message: 'Documento eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/documentos/:documentoId/descargar', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id });
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const documento = paciente.documentos.id(req.params.documentoId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const streamPayload = await storageService.getDocumentStream({
      storage: documento.storage,
      key: documento.key,
    });

    const filename = encodeURIComponent(documento.nombre || 'documento');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    const contentType = streamPayload.contentType || documento.contentType || 'application/octet-stream';
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    if (streamPayload.size) {
      res.setHeader('Content-Length', streamPayload.size);
    }

    streamPayload.stream.on('error', (error) => {
      console.error('Error al transmitir documento de paciente:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo descargar el documento.' });
      } else {
        res.end();
      }
    });

    streamPayload.stream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
