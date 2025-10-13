const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');
const storageService = require('../services/storageService');
const { toCsv, formatDateTime } = require('../utils/csvUtils');

const DEFAULT_PAGE_LIMIT = 16;
const MAX_PAGE_LIMIT = 100;
const SUMMARY_DEFAULT = {
  total: 0,
  particulares: 0,
  porCentro: 0,
  conContacto: 0,
  centrosActivos: 0,
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildProjection = (fieldsParam) => {
  if (typeof fieldsParam !== 'string' || !fieldsParam.trim()) {
    return undefined;
  }

  const allowedFields = new Set([
    'nombre',
    'apellido',
    'dni',
    'email',
    'telefono',
    'tipoAtencion',
    'obraSocial',
    'centroSalud',
    'documentos',
    'createdAt',
    'updatedAt',
  ]);

  const fields = fieldsParam
    .split(',')
    .map((field) => field.trim())
    .filter((field) => allowedFields.has(field));

  if (fields.length === 0) {
    return undefined;
  }

  // Siempre mantenemos el identificador del paciente.
  if (!fields.includes('_id')) {
    fields.push('_id');
  }

  return fields.join(' ');
};

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

const formatDocumentListForExport = (documents) => {
  if (!Array.isArray(documents) || documents.length === 0) {
    return '';
  }

  return documents
    .map((document) => {
      const description = typeof document.descripcion === 'string' && document.descripcion.trim()
        ? ` (${document.descripcion.trim()})`
        : '';
      return `${document.nombre}${description}`;
    })
    .join(' | ');
};

const resolveReferenceName = (reference) => {
  if (!reference) {
    return '';
  }

  if (typeof reference === 'string') {
    return reference;
  }

  if (typeof reference === 'object' && reference.nombre) {
    return reference.nombre;
  }

  return '';
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
    const {
      page = '1',
      limit = DEFAULT_PAGE_LIMIT.toString(),
      search,
      tipoAtencion,
      obraSocial,
      centroSalud,
      sortField = 'createdAt',
      sortOrder = 'desc',
      fields,
    } = req.query;

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const filter = { user: userId };

    if (typeof tipoAtencion === 'string' && ['particular', 'centro'].includes(tipoAtencion)) {
      filter.tipoAtencion = tipoAtencion;
    }

    if (typeof obraSocial === 'string' && mongoose.Types.ObjectId.isValid(obraSocial)) {
      filter.obraSocial = new mongoose.Types.ObjectId(obraSocial);
    }

    if (typeof centroSalud === 'string' && mongoose.Types.ObjectId.isValid(centroSalud)) {
      filter.centroSalud = new mongoose.Types.ObjectId(centroSalud);
    }

    const trimmedSearch = typeof search === 'string' ? search.trim() : '';
    if (trimmedSearch) {
      const regex = new RegExp(escapeRegex(trimmedSearch), 'i');
      filter.$or = [
        { nombre: regex },
        { apellido: regex },
        { dni: regex },
        { email: regex },
        { telefono: regex },
      ];
    }

    let parsedLimit = Number.parseInt(limit, 10);
    if (Number.isNaN(parsedLimit)) {
      parsedLimit = DEFAULT_PAGE_LIMIT;
    }

    if (parsedLimit < 0) {
      parsedLimit = DEFAULT_PAGE_LIMIT;
    }

    if (parsedLimit > MAX_PAGE_LIMIT) {
      parsedLimit = MAX_PAGE_LIMIT;
    }

    if (String(limit).trim() === '0') {
      parsedLimit = 0;
    }

    const normalizedLimit = parsedLimit === 0 ? 0 : Math.max(parsedLimit, 1);
    const totalDocs = await Paciente.countDocuments(filter);
    const totalPages = normalizedLimit > 0 ? Math.max(Math.ceil(totalDocs / normalizedLimit), 1) : 1;
    const requestedPage = Number.parseInt(page, 10);
    const safePage = normalizedLimit > 0
      ? Math.min(Math.max(Number.isNaN(requestedPage) ? 1 : requestedPage, 1), totalPages)
      : 1;
    const skip = normalizedLimit > 0 ? (safePage - 1) * normalizedLimit : 0;

    const sortFields = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      apellido: 'apellido',
      nombre: 'nombre',
      dni: 'dni',
    };

    const sortKey = sortFields[sortField] || 'createdAt';
    const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    const sort = { [sortKey]: sortDirection, _id: sortDirection };

    const projection = buildProjection(fields);

    let pacientesQuery = Paciente.find(filter, projection)
      .sort(sort)
      .populate('obraSocial')
      .populate('centroSalud');

    if (normalizedLimit > 0) {
      pacientesQuery = pacientesQuery.skip(skip).limit(normalizedLimit);
    }

    const [pacientesDocs, summaryResult] = await Promise.all([
      pacientesQuery.exec(),
      Paciente.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            particulares: {
              $sum: {
                $cond: [{ $eq: ['$tipoAtencion', 'particular'] }, 1, 0],
              },
            },
            porCentro: {
              $sum: {
                $cond: [{ $eq: ['$tipoAtencion', 'centro'] }, 1, 0],
              },
            },
            conContacto: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $gt: [{ $strLenCP: { $ifNull: ['$email', ''] } }, 0] },
                      { $gt: [{ $strLenCP: { $ifNull: ['$telefono', ''] } }, 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            centros: { $addToSet: '$centroSalud' },
          },
        },
        {
          $project: {
            _id: 0,
            total: 1,
            particulares: 1,
            porCentro: 1,
            conContacto: 1,
            centrosActivos: {
              $size: {
                $filter: {
                  input: '$centros',
                  as: 'centro',
                  cond: { $and: [{ $ne: ['$$centro', null] }] },
                },
              },
            },
          },
        },
      ]),
    ]);

    const summary = summaryResult[0] || SUMMARY_DEFAULT;

    const pagination = {
      page: safePage,
      limit: normalizedLimit,
      totalDocs,
      totalPages,
      hasPrevPage: normalizedLimit > 0 ? safePage > 1 : false,
      hasNextPage: normalizedLimit > 0 ? safePage < totalPages : false,
    };

    res.json({
      data: pacientesDocs.map((paciente) => buildPacienteResponse(paciente)),
      pagination,
      summary,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/export', protect, async (req, res) => {
  try {
    const pacientes = await Paciente.find({ user: req.user._id })
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre')
      .sort({ apellido: 1, nombre: 1 })
      .lean();

    const columns = [
      { header: 'ID', value: (paciente) => paciente._id },
      { header: 'Nombre', value: (paciente) => paciente.nombre || '' },
      { header: 'Apellido', value: (paciente) => paciente.apellido || '' },
      { header: 'DNI', value: (paciente) => paciente.dni || '' },
      { header: 'Email', value: (paciente) => paciente.email || '' },
      { header: 'Teléfono', value: (paciente) => paciente.telefono || '' },
      {
        header: 'Tipo de atención',
        value: (paciente) => (paciente.tipoAtencion === 'centro' ? 'Centro de salud' : 'Particular'),
      },
      {
        header: 'Obra social',
        value: (paciente) => resolveReferenceName(paciente.obraSocial),
      },
      {
        header: 'Centro de salud',
        value: (paciente) => resolveReferenceName(paciente.centroSalud),
      },
      {
        header: 'Cantidad de documentos',
        value: (paciente) => (Array.isArray(paciente.documentos) ? paciente.documentos.length : 0),
      },
      {
        header: 'Documentos adjuntos',
        value: (paciente) => formatDocumentListForExport(paciente.documentos),
      },
      { header: 'Creado el', value: (paciente) => formatDateTime(paciente.createdAt) },
      { header: 'Actualizado el', value: (paciente) => formatDateTime(paciente.updatedAt) },
    ];

    const csvContent = toCsv(pacientes, columns);
    const filename = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(`\ufeff${csvContent}`);
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
