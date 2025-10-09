const express = require('express');
const router = express.Router();
const Factura = require('../models/Factura');
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const ObraSocial = require('../models/ObraSocial');
const { protect } = require('../middleware/authMiddleware');
const storageService = require('../services/storageService');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

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

const buildFacturaDocumentResponse = (document, facturaId) => {
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
    downloadPath: `/api/facturas/${facturaId}/documentos/${document._id}/descargar`,
  };
};

const buildFacturaResponse = (facturaDoc) => {
  if (!facturaDoc) {
    return null;
  }
  const plain = facturaDoc.toObject ? facturaDoc.toObject({ virtuals: true }) : { ...facturaDoc };
  const pagos = Array.isArray(plain.pagos) ? plain.pagos : [];
  const montoCobrado = pagos.reduce((total, pago) => total + (pago.monto || 0), 0);
  const saldoPendiente = Math.max((plain.montoTotal || 0) - montoCobrado, 0);
  const estado = plain.estado || (plain.pagado ? 'pagada' : (montoCobrado > 0 ? 'pagada_parcial' : 'pendiente'));
  const documentos = Array.isArray(plain.documentos)
    ? plain.documentos.map((doc) => buildFacturaDocumentResponse(doc, facturaDoc._id)).filter(Boolean)
    : [];

  const sanitizedPlain = { ...plain };
  delete sanitizedPlain.documentos;

  return {
    ...sanitizedPlain,
    pagos,
    montoCobrado,
    saldoPendiente,
    estado,
    pagado: estado === 'pagada',
    documentos,
  };
};

const populateFactura = async (factura) => {
  if (!factura || typeof factura.populate !== 'function') {
    return factura;
  }

  await factura.populate({
    path: 'paciente',
    select: 'nombre apellido dni tipoAtencion centroSalud',
    populate: { path: 'centroSalud', select: 'nombre porcentajeRetencion' },
  });
  await factura.populate('obraSocial', 'nombre');
  await factura.populate('centroSalud', 'nombre porcentajeRetencion');

  return factura;
};

const syncEstadoDesdePagos = (factura) => {
  if (!factura) {
    return;
  }
  const pagos = Array.isArray(factura.pagos) ? factura.pagos : [];
  const montoCobrado = pagos.reduce((total, pago) => total + (pago.monto || 0), 0);

  if (montoCobrado >= (factura.montoTotal || 0) && (factura.montoTotal || 0) > 0) {
    factura.estado = 'pagada';
    factura.pagado = true;
  } else if (montoCobrado > 0) {
    factura.estado = 'pagada_parcial';
    factura.pagado = false;
  } else if (factura.estado === 'pagada_parcial') {
    factura.estado = 'pendiente';
    factura.pagado = false;
  } else {
    factura.pagado = factura.estado === 'pagada';
  }
};

const allowedUpdateFields = ['paciente', 'obraSocial', 'puntoVenta', 'numeroFactura', 'montoTotal', 'fechaEmision', 'fechaVencimiento', 'interes', 'observaciones', 'centroSalud'];

const resolveCentroSaludId = async ({ centroSaludId, pacienteId, userId }) => {
  if (centroSaludId === null || centroSaludId === '') {
    return null;
  }

  if (centroSaludId !== undefined) {
    if (!centroSaludId) {
      return null;
    }
    const centro = await CentroSalud.findOne({ _id: centroSaludId, user: userId });
    if (!centro) {
      throw createValidationError('Centro de salud no válido para este profesional.');
    }
    return centro._id;
  }

  if (!pacienteId) {
    return null;
  }

  const paciente = await Paciente.findOne({ _id: pacienteId, user: userId }).populate('centroSalud');
  if (paciente && paciente.tipoAtencion === 'centro' && paciente.centroSalud) {
    return paciente.centroSalud._id || paciente.centroSalud;
  }

  return null;
};

const resolvePacienteId = async ({ pacienteId, userId }) => {
  if (!pacienteId) {
    throw createValidationError('Debes seleccionar un paciente válido.');
  }

  const paciente = await Paciente.findOne({ _id: pacienteId, user: userId });
  if (!paciente) {
    throw createValidationError('Paciente no válido para este profesional.');
  }

  return paciente._id;
};

const resolveObraSocialId = async ({ obraSocialId, userId }) => {
  if (obraSocialId === undefined || obraSocialId === null || obraSocialId === '') {
    return null;
  }

  const obraSocial = await ObraSocial.findOne({ _id: obraSocialId, user: userId });
  if (!obraSocial) {
    throw createValidationError('Obra social no válida para este profesional.');
  }

  return obraSocial._id;
};

// Crea una nueva factura para el usuario autenticado
router.post('/', protect, async (req, res) => {
  try {
    const pacienteId = await resolvePacienteId({ pacienteId: req.body.paciente, userId: req.user._id });
    const obraSocialId = await resolveObraSocialId({ obraSocialId: req.body.obraSocial, userId: req.user._id });
    const centroSaludId = await resolveCentroSaludId({
      centroSaludId: req.body.centroSalud,
      pacienteId,
      userId: req.user._id,
    });

    if (req.body.puntoVenta === undefined || req.body.puntoVenta === null || req.body.puntoVenta === '') {
      return res.status(400).json({ error: 'El punto de venta es obligatorio.' });
    }

    const puntoVentaValor = Number(req.body.puntoVenta);
    if (!Number.isFinite(puntoVentaValor) || puntoVentaValor < 0) {
      return res.status(400).json({ error: 'El punto de venta debe ser un número válido y no negativo.' });
    }

    if (req.body.numeroFactura === undefined || req.body.numeroFactura === null || req.body.numeroFactura === '') {
      return res.status(400).json({ error: 'El número de factura es obligatorio.' });
    }

    const numeroFacturaValor = Number(req.body.numeroFactura);
    if (!Number.isFinite(numeroFacturaValor) || numeroFacturaValor < 0) {
      return res.status(400).json({ error: 'El número de factura debe ser un número válido y no negativo.' });
    }

    if (req.body.montoTotal === undefined || req.body.montoTotal === null || req.body.montoTotal === '') {
      return res.status(400).json({ error: 'El monto total es obligatorio.' });
    }

    const montoTotalValor = Number(req.body.montoTotal);
    if (!Number.isFinite(montoTotalValor) || montoTotalValor < 0) {
      return res.status(400).json({ error: 'El monto total debe ser un número válido y no negativo.' });
    }

    const interesValor = req.body.interes === undefined || req.body.interes === null || req.body.interes === ''
      ? 0
      : Number(req.body.interes);
    if (!Number.isFinite(interesValor) || interesValor < 0) {
      return res.status(400).json({ error: 'El interés no puede ser negativo.' });
    }

    const facturaData = {
      paciente: pacienteId,
      obraSocial: obraSocialId,
      puntoVenta: puntoVentaValor,
      numeroFactura: numeroFacturaValor,
      montoTotal: montoTotalValor,
      fechaEmision: req.body.fechaEmision,
      fechaVencimiento: req.body.fechaVencimiento || null,
      interes: interesValor,
      observaciones: typeof req.body.observaciones === 'string' ? req.body.observaciones.trim() : '',
      centroSalud: centroSaludId || null,
      user: req.user._id,
    };

    if (req.body.estado) {
      facturaData.estado = req.body.estado;
    }

    if (Array.isArray(req.body.pagos)) {
      facturaData.pagos = req.body.pagos;
    }

    if (typeof req.body.pagado === 'boolean') {
      facturaData.pagado = req.body.pagado;
    }

    const nuevaFactura = new Factura(facturaData);

    if (!Factura.ESTADOS_FACTURA.includes(nuevaFactura.estado)) {
      return res.status(400).json({ error: 'Estado de factura inválido.' });
    }

    syncEstadoDesdePagos(nuevaFactura);
    const facturaGuardada = await nuevaFactura.save();
    await populateFactura(facturaGuardada);
    res.status(201).json(buildFacturaResponse(facturaGuardada));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una factura con ese punto de venta y número para este profesional.' });
    }
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// Obtiene todas las facturas del usuario autenticado
router.get('/', protect, async (req, res) => {
  try {
    const facturas = await Factura.find({ user: req.user._id })
      .populate({
        path: 'paciente',
        select: 'nombre apellido dni tipoAtencion centroSalud',
        populate: { path: 'centroSalud', select: 'nombre porcentajeRetencion' },
      })
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre porcentajeRetencion');

    const payload = facturas.map((factura) => buildFacturaResponse(factura));
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualiza una factura existente
router.put('/:id', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    let resolvedPacienteId;
    let resolvedObraSocialId;

    if (Object.prototype.hasOwnProperty.call(req.body, 'paciente')) {
      resolvedPacienteId = await resolvePacienteId({ pacienteId: req.body.paciente, userId: req.user._id });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'obraSocial')) {
      resolvedObraSocialId = await resolveObraSocialId({ obraSocialId: req.body.obraSocial, userId: req.user._id });
    }

    for (const field of allowedUpdateFields) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field) || field === 'centroSalud') {
        continue;
      }

      if (field === 'puntoVenta') {
        if (req.body.puntoVenta === '' || req.body.puntoVenta === null || req.body.puntoVenta === undefined) {
          return res.status(400).json({ error: 'El punto de venta es obligatorio.' });
        }
        const puntoVentaValor = Number(req.body.puntoVenta);
        if (!Number.isFinite(puntoVentaValor) || puntoVentaValor < 0) {
          return res.status(400).json({ error: 'El punto de venta debe ser un número válido y no negativo.' });
        }
        factura.puntoVenta = puntoVentaValor;
        continue;
      }

      if (field === 'numeroFactura') {
        if (req.body.numeroFactura === '' || req.body.numeroFactura === null || req.body.numeroFactura === undefined) {
          return res.status(400).json({ error: 'El número de factura es obligatorio.' });
        }
        const numeroFacturaValor = Number(req.body.numeroFactura);
        if (!Number.isFinite(numeroFacturaValor) || numeroFacturaValor < 0) {
          return res.status(400).json({ error: 'El número de factura debe ser un número válido y no negativo.' });
        }
        factura.numeroFactura = numeroFacturaValor;
        continue;
      }

      if (field === 'montoTotal') {
        if (req.body.montoTotal === '' || req.body.montoTotal === null || req.body.montoTotal === undefined) {
          return res.status(400).json({ error: 'El monto total es obligatorio.' });
        }
        const montoTotalValor = Number(req.body.montoTotal);
        if (!Number.isFinite(montoTotalValor) || montoTotalValor < 0) {
          return res.status(400).json({ error: 'El monto total debe ser un número válido y no negativo.' });
        }
        factura.montoTotal = montoTotalValor;
        continue;
      }

      if (field === 'interes') {
        const interesValor = Number(req.body.interes);
        if (!Number.isFinite(interesValor) || interesValor < 0) {
          return res.status(400).json({ error: 'El interés no puede ser negativo.' });
        }
        factura.interes = interesValor;
        continue;
      }

      if (field === 'observaciones') {
        factura.observaciones = typeof req.body.observaciones === 'string' ? req.body.observaciones.trim() : '';
        continue;
      }

      if (field === 'obraSocial') {
        factura.obraSocial = resolvedObraSocialId || null;
        continue;
      }

      if (field === 'paciente' && resolvedPacienteId) {
        factura.paciente = resolvedPacienteId;
        continue;
      }

      factura[field] = req.body[field];
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'centroSalud')) {
      factura.centroSalud = await resolveCentroSaludId({
        centroSaludId: req.body.centroSalud,
        pacienteId: factura.paciente,
        userId: req.user._id,
      });
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'paciente')) {
      factura.centroSalud = await resolveCentroSaludId({
        centroSaludId: undefined,
        pacienteId: factura.paciente,
        userId: req.user._id,
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'estado')) {
      if (!Factura.ESTADOS_FACTURA.includes(req.body.estado)) {
        return res.status(400).json({ error: 'Estado de factura inválido.' });
      }
      factura.estado = req.body.estado;
      factura.pagado = factura.estado === 'pagada';
    } else {
      syncEstadoDesdePagos(factura);
    }

    const totalPagos = Array.isArray(factura.pagos)
      ? factura.pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0)
      : 0;

    if ((factura.montoTotal || 0) < totalPagos) {
      return res.status(400).json({ error: 'El monto total no puede ser inferior a los pagos registrados.' });
    }

    await factura.save();
    await populateFactura(factura);
    res.json(buildFacturaResponse(factura));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una factura con ese punto de venta y número para este profesional.' });
    }
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// Registra un pago parcial o total de la factura
router.post('/:id/pagos', protect, async (req, res) => {
  try {
    const { monto, fecha, metodo, nota } = req.body;
    if (typeof monto !== 'number' || Number.isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: 'El monto del pago debe ser un número positivo.' });
    }

    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const totalPagosPrevios = Array.isArray(factura.pagos)
      ? factura.pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0)
      : 0;

    if (totalPagosPrevios + monto - (factura.montoTotal || 0) > 1e-6) {
      return res.status(400).json({ error: 'El pago excede el monto pendiente de la factura.' });
    }

    factura.pagos.push({
      monto,
      fecha: fecha ? new Date(fecha) : Date.now(),
      metodo,
      nota,
    });

    syncEstadoDesdePagos(factura);
    await factura.save();
    await populateFactura(factura);
    res.status(201).json(buildFacturaResponse(factura));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Elimina un pago registrado
router.delete('/:id/pagos/:pagoId', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const pagosIniciales = factura.pagos.length;
    factura.pagos = factura.pagos.filter((pago) => pago._id.toString() !== req.params.pagoId);

    if (pagosIniciales === factura.pagos.length) {
      return res.status(404).json({ error: 'Pago no encontrado en la factura.' });
    }

    syncEstadoDesdePagos(factura);
    await factura.save();
    await populateFactura(factura);
    res.json(buildFacturaResponse(factura));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/documentos', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
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
      folder: `users/${req.user._id}/facturas`,
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

    factura.documentos.push(documento);
    await factura.save();
    const savedDocument = factura.documentos[factura.documentos.length - 1];
    res.status(201).json(buildFacturaDocumentResponse(savedDocument, factura._id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id/documentos/:documentoId', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const documento = factura.documentos.id(req.params.documentoId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    await storageService.deleteDocument({ storage: documento.storage, key: documento.key });
    documento.deleteOne();
    await factura.save();

    res.json({ message: 'Documento eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/documentos/:documentoId/descargar', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const documento = factura.documentos.id(req.params.documentoId);
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
      console.error('Error al transmitir documento de factura:', error);
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

// Elimina una factura por su ID (del usuario autenticado)
router.delete('/:id', protect, async (req, res) => {
  try {
    const facturaEliminada = await Factura.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!facturaEliminada) return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    if (Array.isArray(facturaEliminada.documentos)) {
      await Promise.all(facturaEliminada.documentos.map((doc) => storageService.deleteDocument({
        storage: doc.storage,
        key: doc.key,
      })));
    }
    res.json({ message: 'Factura eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
