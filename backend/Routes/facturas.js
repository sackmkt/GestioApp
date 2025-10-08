const express = require('express');
const router = express.Router();
const Factura = require('../models/Factura');
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

const buildFacturaResponse = (facturaDoc) => {
  if (!facturaDoc) {
    return null;
  }
  const plain = facturaDoc.toObject ? facturaDoc.toObject({ virtuals: true }) : { ...facturaDoc };
  const pagos = Array.isArray(plain.pagos) ? plain.pagos : [];
  const montoCobrado = pagos.reduce((total, pago) => total + (pago.monto || 0), 0);
  const saldoPendiente = Math.max((plain.montoTotal || 0) - montoCobrado, 0);
  const estado = plain.estado || (plain.pagado ? 'pagada' : (montoCobrado > 0 ? 'pagada_parcial' : 'pendiente'));

  return {
    ...plain,
    pagos,
    montoCobrado,
    saldoPendiente,
    estado,
    pagado: estado === 'pagada',
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
      throw new Error('Centro de salud no válido para este profesional.');
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

// Crea una nueva factura para el usuario autenticado
router.post('/', protect, async (req, res) => {
  try {
    const centroSaludId = await resolveCentroSaludId({
      centroSaludId: req.body.centroSalud,
      pacienteId: req.body.paciente,
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
      paciente: req.body.paciente,
      obraSocial: req.body.obraSocial || null,
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
    res.status(500).json({ error: error.message });
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
        factura.obraSocial = req.body.obraSocial || null;
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
    res.status(500).json({ error: error.message });
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

// Elimina una factura por su ID (del usuario autenticado)
router.delete('/:id', protect, async (req, res) => {
  try {
    const facturaEliminada = await Factura.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!facturaEliminada) return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });

    if (Array.isArray(facturaEliminada.comprobantes)) {
      await Promise.all(facturaEliminada.comprobantes.map((doc) => storageService.deleteDocument(doc.storageKey).catch(() => null)));
    }
    res.json({ message: 'Factura eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/comprobantes', protect, async (req, res) => {
  const { fileName, mimeType, base64Data, descripcion } = req.body || {};

  if (!fileName || !mimeType || !base64Data) {
    return res.status(400).json({ error: 'Debes enviar nombre, tipo y contenido del archivo.' });
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'El tipo de archivo no está permitido.' });
  }

  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
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

    const nuevoComprobante = factura.comprobantes.create({
      nombreOriginal: fileName,
      descripcion: descripcion ? descripcion.trim() : '',
      mimeType,
      size: buffer.length,
      storageKey: saved.storageKey,
      uploadedBy: req.user._id,
    });
    nuevoComprobante.publicUrl = `/api/facturas/${factura._id}/comprobantes/${nuevoComprobante._id}/descarga`;

    factura.comprobantes.push(nuevoComprobante);
    await factura.save();

    res.status(201).json(nuevoComprobante);
  } catch (error) {
    console.error('Error subiendo comprobante de factura:', error);
    res.status(500).json({ error: 'No pudimos guardar el archivo. Intenta nuevamente.' });
  }
});

router.delete('/:id/comprobantes/:comprobanteId', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const comprobante = factura.comprobantes.id(req.params.comprobanteId);
    if (!comprobante) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    await storageService.deleteDocument(comprobante.storageKey);
    comprobante.deleteOne();
    await factura.save();

    res.json({ message: 'Comprobante eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando comprobante de factura:', error);
    res.status(500).json({ error: 'No pudimos eliminar el archivo.' });
  }
});

router.get('/:id/comprobantes/:comprobanteId/descarga', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const comprobante = factura.comprobantes.id(req.params.comprobanteId);
    if (!comprobante) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    res.setHeader('Content-Type', comprobante.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(comprobante.nombreOriginal)}"`);

    const stream = storageService.getDownloadStream(comprobante.storageKey);
    stream.on('error', (streamError) => {
      console.error('Error descargando comprobante de factura:', streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No pudimos descargar el archivo.' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    console.error('Error obteniendo comprobante de factura:', error);
    res.status(500).json({ error: 'No pudimos procesar la descarga.' });
  }
});

module.exports = router;
