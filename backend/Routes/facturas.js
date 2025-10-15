const express = require('express');
const router = express.Router();
const Factura = require('../models/Factura');
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const ObraSocial = require('../models/ObraSocial');
const { protect } = require('../middleware/authMiddleware');
const storageService = require('../services/storageService');
const { generateExcelBuffer, formatDateTime } = require('../utils/exportUtils');

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = new Map([
  ['application/pdf', 'application/pdf'],
  ['application/x-pdf', 'application/pdf'],
  ['image/jpeg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
]);
const ALLOWED_EXTENSIONS = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

const resolveExtension = (filename) => {
  if (typeof filename !== 'string') {
    return null;
  }
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return null;
  }
  return filename.slice(lastDotIndex).toLowerCase();
};

const resolveAllowedContentType = (archivo = {}) => {
  const typeCandidates = [archivo.tipo, archivo.contentType]
    .filter((candidate) => typeof candidate === 'string' && candidate.trim())
    .map((candidate) => candidate.trim().toLowerCase());

  for (const candidate of typeCandidates) {
    if (ALLOWED_MIME_TYPES.has(candidate)) {
      return ALLOWED_MIME_TYPES.get(candidate);
    }
  }

  const extension = resolveExtension(archivo.nombre);
  if (extension && ALLOWED_EXTENSIONS.has(extension)) {
    return ALLOWED_EXTENSIONS.get(extension);
  }

  return null;
};

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

const MES_SERVICIO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const buildMesServicioFromDate = (dateInput) => {
  if (!dateInput) {
    return null;
  }

  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const normalizeMesServicio = (value, fallbackDate) => {
  if (value === undefined) {
    return buildMesServicioFromDate(fallbackDate);
  }

  if (value === null || value === '') {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (MES_SERVICIO_REGEX.test(trimmed)) {
    return trimmed;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    const fallback = buildMesServicioFromDate(fallbackDate);
    const baseYear = fallback ? Number(fallback.slice(0, 4)) : new Date().getFullYear();
    const normalizedMonth = String(Math.trunc(numeric)).padStart(2, '0');
    return `${baseYear}-${normalizedMonth}`;
  }

  throw createValidationError('El mes de servicio debe tener el formato AAAA-MM.');
};

const parseMesServicioQuery = (rawValue) => {
  if (rawValue === undefined || rawValue === null) {
    return { type: 'none' };
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return { type: 'none' };
  }

  if (MES_SERVICIO_REGEX.test(trimmed)) {
    return { type: 'value', value: trimmed };
  }

  const lowered = trimmed.toLowerCase();
  if (['sin-fecha', 'sin-mes', 'none', 'null', 'empty'].includes(lowered)) {
    return { type: 'empty' };
  }

  return { type: 'invalid', value: trimmed };
};

const applyMesServicioFilterToQuery = (query, rawValue) => {
  const parsed = parseMesServicioQuery(rawValue);

  if (parsed.type === 'invalid') {
    return { error: 'El mes de servicio indicado no es válido.' };
  }

  if (parsed.type === 'value') {
    query.mesServicio = parsed.value;
  } else if (parsed.type === 'empty') {
    query.$or = [
      { mesServicio: { $exists: false } },
      { mesServicio: null },
      { mesServicio: '' },
    ];
  }

  return { parsed };
};

const formatMesServicioLabel = (value) => {
  if (typeof value !== 'string' || !MES_SERVICIO_REGEX.test(value)) {
    return '';
  }

  const [yearStr, monthStr] = value.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
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
  const pagosCentro = Array.isArray(plain.pagosCentro) ? plain.pagosCentro : [];
  const centroRetencionPorcentaje = (() => {
    const porcentaje = plain.centroSalud?.porcentajeRetencion ?? plain.centroRetencionPorcentaje;
    return Number.isFinite(Number(porcentaje)) ? Number(porcentaje) : 0;
  })();
  const centroTotal = ((Number(plain.montoTotal) || 0) * centroRetencionPorcentaje) / 100;
  const centroPagado = pagosCentro.reduce((total, pago) => total + (Number(pago.monto) || 0), 0);
  const centroSaldoPendiente = Math.max(centroTotal - centroPagado, 0);
  const documentos = Array.isArray(plain.documentos)
    ? plain.documentos.map((doc) => buildFacturaDocumentResponse(doc, facturaDoc._id)).filter(Boolean)
    : [];

  const sanitizedPlain = { ...plain };
  delete sanitizedPlain.documentos;
  delete sanitizedPlain.pagos;
  delete sanitizedPlain.pagosCentro;

  const mesServicioNormalizado = sanitizedPlain.mesServicio || buildMesServicioFromDate(sanitizedPlain.fechaEmision);

  return {
    ...sanitizedPlain,
    mesServicio: mesServicioNormalizado || null,
    mesServicioLabel: formatMesServicioLabel(mesServicioNormalizado) || null,
    pagos,
    pagosCentro,
    montoCobrado,
    saldoPendiente,
    estado,
    pagado: estado === 'pagada',
    documentos,
    centroRetencionPorcentaje,
    centroTotal,
    centroPagado,
    centroSaldoPendiente,
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

const formatNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return numeric.toFixed(2);
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
    .join('\n');
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

const resolvePacienteNombre = (paciente) => {
  if (!paciente) {
    return '';
  }

  if (typeof paciente === 'string') {
    return paciente;
  }

  const nombre = paciente.nombre || '';
  const apellido = paciente.apellido || '';
  const fullName = `${nombre} ${apellido}`.trim();
  if (fullName) {
    return fullName;
  }

  return paciente.dni || '';
};

const resolvePacienteDni = (paciente) => {
  if (!paciente) {
    return '';
  }

  if (typeof paciente === 'object' && paciente.dni) {
    return paciente.dni;
  }

  return '';
};

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  presentada: 'Presentada',
  observada: 'Observada',
  pagada_parcial: 'Pagada parcialmente',
  pagada: 'Pagada',
};

const resolveEstado = (factura, montoCobrado) => {
  if (!factura) {
    return 'pendiente';
  }

  if (factura.estado) {
    return factura.estado;
  }

  if (factura.pagado) {
    return 'pagada';
  }

  if (montoCobrado > 0) {
    return 'pagada_parcial';
  }

  return 'pendiente';
};

const resolveEstadoLabel = (estado) => ESTADO_LABELS[estado] || estado || 'Pendiente';

const formatPaymentsForExport = (payments) => {
  if (!Array.isArray(payments) || payments.length === 0) {
    return '';
  }

  return payments
    .map((payment, index) => {
      const fragments = [`Pago ${index + 1}`];
      const fecha = formatDateTime(payment.fecha);
      if (fecha) {
        fragments.push(`Fecha: ${fecha}`);
      }

      const monto = formatNumber(payment.monto);
      if (monto !== '') {
        fragments.push(`Monto: ${monto}`);
      }

      if (payment.metodo) {
        fragments.push(`Método: ${payment.metodo}`);
      }

      if (payment.nota) {
        fragments.push(`Nota: ${payment.nota}`);
      }

      return fragments.join('\n');
    })
    .join('\n\n');
};

const formatCentroPaymentsForExport = (payments) => {
  if (!Array.isArray(payments) || payments.length === 0) {
    return '';
  }

  return payments
    .map((payment, index) => {
      const fragments = [`Pago centro ${index + 1}`];
      const fecha = formatDateTime(payment.fecha);
      if (fecha) {
        fragments.push(`Fecha: ${fecha}`);
      }

      const monto = formatNumber(payment.monto);
      if (monto !== '') {
        fragments.push(`Monto: ${monto}`);
      }

      if (payment.metodo) {
        fragments.push(`Método: ${payment.metodo}`);
      }

      if (payment.nota) {
        fragments.push(`Nota: ${payment.nota}`);
      }

      return fragments.join('\n');
    })
    .join('\n\n');
};

const allowedUpdateFields = [
  'paciente',
  'obraSocial',
  'puntoVenta',
  'numeroFactura',
  'montoTotal',
  'fechaEmision',
  'fechaVencimiento',
  'mesServicio',
  'observaciones',
  'centroSalud',
];

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

    const facturaData = {
      paciente: pacienteId,
      obraSocial: obraSocialId,
      puntoVenta: puntoVentaValor,
      numeroFactura: numeroFacturaValor,
      montoTotal: montoTotalValor,
      fechaEmision: req.body.fechaEmision,
      fechaVencimiento: req.body.fechaVencimiento || null,
      mesServicio: normalizeMesServicio(req.body.mesServicio, req.body.fechaEmision) || null,
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
    const filters = { user: req.user._id };
    const { error: mesServicioError } = applyMesServicioFilterToQuery(filters, req.query.mesServicio ?? req.query.mes);
    if (mesServicioError) {
      return res.status(400).json({ error: mesServicioError });
    }

    const facturas = await Factura.find(filters)
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

router.get('/export', protect, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      fechaDesde,
      fechaHasta,
      usuario,
      usuarioId,
      userId,
    } = req.query;

    const requestedUser = (usuarioId || userId || usuario || '').toString().trim();
    if (requestedUser && !['me', 'actual', String(req.user._id)].includes(requestedUser)) {
      return res.status(403).json({ error: 'No tienes permisos para exportar facturas de otros usuarios.' });
    }

    const filters = { user: req.user._id };

    const { error: mesServicioError } = applyMesServicioFilterToQuery(filters, req.query.mesServicio ?? req.query.mes);
    if (mesServicioError) {
      return res.status(400).json({ error: mesServicioError });
    }

    const startInput = (startDate || fechaDesde || '').toString().trim();
    const endInput = (endDate || fechaHasta || '').toString().trim();

    const parseDate = (value) => {
      if (!value) {
        return null;
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return date;
    };

    const start = parseDate(startInput);
    const end = parseDate(endInput);

    if (startInput && !start) {
      return res.status(400).json({ error: 'La fecha desde indicada no es válida.' });
    }

    if (endInput && !end) {
      return res.status(400).json({ error: 'La fecha hasta indicada no es válida.' });
    }

    if (start && end && start > end) {
      return res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
    }

    if (start || end) {
      filters.fechaEmision = {};
      if (start) {
        filters.fechaEmision.$gte = start;
      }
      if (end) {
        const endOfDay = new Date(end);
        endOfDay.setHours(23, 59, 59, 999);
        filters.fechaEmision.$lte = endOfDay;
      }
    }

    const facturas = await Factura.find(filters)
      .populate({
        path: 'paciente',
        select: 'nombre apellido dni',
      })
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre')
      .sort({ fechaEmision: -1, createdAt: -1 })
      .lean();

    const facturasForExport = (Array.isArray(facturas) ? facturas : []).map((factura) => {
      const pagos = Array.isArray(factura.pagos) ? factura.pagos : [];
      const pagosCentro = Array.isArray(factura.pagosCentro) ? factura.pagosCentro : [];
      const montoCobrado = pagos.reduce((total, pago) => total + (Number(pago.monto) || 0), 0);
      const montoTotal = Number(factura.montoTotal) || 0;
      const saldoPendiente = Math.max(montoTotal - montoCobrado, 0);
      const estado = resolveEstado(factura, montoCobrado);
      const centroRetencionPorcentaje = (() => {
        const porcentaje = factura.centroSalud?.porcentajeRetencion ?? factura.centroRetencionPorcentaje;
        return Number.isFinite(Number(porcentaje)) ? Number(porcentaje) : 0;
      })();
      const centroTotal = (montoTotal * centroRetencionPorcentaje) / 100;
      const centroPagado = pagosCentro.reduce((total, pago) => total + (Number(pago.monto) || 0), 0);
      const centroSaldoPendiente = Math.max(centroTotal - centroPagado, 0);

      return {
        ...factura,
        pagos,
        pagosCentro,
        montoCobrado,
        saldoPendiente,
        estado,
        centroRetencionPorcentaje,
        centroTotal,
        centroPagado,
        centroSaldoPendiente,
      };
    });

    const columns = [
      { header: 'Paciente', value: (factura) => resolvePacienteNombre(factura.paciente) },
      { header: 'DNI del paciente', value: (factura) => resolvePacienteDni(factura.paciente) },
      { header: 'Obra social', value: (factura) => resolveReferenceName(factura.obraSocial) },
      { header: 'Centro de salud', value: (factura) => resolveReferenceName(factura.centroSalud) },
      {
        header: 'Punto de venta',
        value: (factura) => (factura.puntoVenta !== null && factura.puntoVenta !== undefined ? factura.puntoVenta : ''),
      },
      {
        header: 'Número de factura',
        value: (factura) => (factura.numeroFactura !== null && factura.numeroFactura !== undefined
          ? factura.numeroFactura
          : ''),
      },
      { header: 'Monto total', value: (factura) => formatNumber(factura.montoTotal) },
      { header: 'Monto cobrado', value: (factura) => formatNumber(factura.montoCobrado) },
      { header: 'Saldo pendiente', value: (factura) => formatNumber(factura.saldoPendiente) },
      { header: 'Estado', value: (factura) => resolveEstadoLabel(factura.estado) },
      { header: 'Fecha de emisión', value: (factura) => formatDateTime(factura.fechaEmision) },
      {
        header: 'Mes del servicio',
        value: (factura) => formatMesServicioLabel(factura.mesServicio || buildMesServicioFromDate(factura.fechaEmision)),
      },
      { header: 'Fecha de vencimiento', value: (factura) => formatDateTime(factura.fechaVencimiento) },
      { header: 'Observaciones', value: (factura) => factura.observaciones || '' },
      {
        header: 'Cantidad de pagos',
        value: (factura) => (Array.isArray(factura.pagos) ? factura.pagos.length : 0),
      },
      { header: 'Detalle de pagos', value: (factura) => formatPaymentsForExport(factura.pagos) },
      {
        header: 'Cantidad de pagos al centro',
        value: (factura) => (Array.isArray(factura.pagosCentro) ? factura.pagosCentro.length : 0),
      },
      { header: 'Pagos al centro', value: (factura) => formatCentroPaymentsForExport(factura.pagosCentro) },
      {
        header: 'Retención centro (%)',
        value: (factura) => formatNumber(factura.centroRetencionPorcentaje),
      },
      { header: 'Total a centro', value: (factura) => formatNumber(factura.centroTotal) },
      { header: 'Pagado a centro', value: (factura) => formatNumber(factura.centroPagado) },
      { header: 'Saldo con centro', value: (factura) => formatNumber(factura.centroSaldoPendiente) },
      {
        header: 'Cantidad de documentos',
        value: (factura) => (Array.isArray(factura.documentos) ? factura.documentos.length : 0),
      },
      { header: 'Documentos adjuntos', value: (factura) => formatDocumentListForExport(factura.documentos) },
      { header: 'Creado el', value: (factura) => formatDateTime(factura.createdAt) },
      { header: 'Actualizado el', value: (factura) => formatDateTime(factura.updatedAt) },
    ];

    const workbookBuffer = await generateExcelBuffer(facturasForExport, columns, { sheetName: 'Facturas' });
    const filename = `facturas-${new Date().toISOString().slice(0, 10)}.xls`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(workbookBuffer);
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

      if (field === 'observaciones') {
        factura.observaciones = typeof req.body.observaciones === 'string' ? req.body.observaciones.trim() : '';
        continue;
      }

      if (field === 'mesServicio') {
        factura.mesServicio = normalizeMesServicio(
          req.body.mesServicio,
          Object.prototype.hasOwnProperty.call(req.body, 'fechaEmision') ? req.body.fechaEmision : factura.fechaEmision,
        ) || null;
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

router.patch('/:id/pagos/:pagoId', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const pago = Array.isArray(factura.pagos) ? factura.pagos.id(req.params.pagoId) : null;
    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado en esta factura.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'monto')) {
      const montoValor = Number(req.body.monto);
      if (!Number.isFinite(montoValor) || montoValor <= 0) {
        return res.status(400).json({ error: 'El monto del pago debe ser un número positivo.' });
      }
      pago.monto = montoValor;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'fecha')) {
      const { fecha } = req.body;
      if (!fecha) {
        pago.fecha = Date.now();
      } else {
        const parsed = new Date(fecha);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'La fecha del pago no es válida.' });
        }
        pago.fecha = parsed;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'metodo')) {
      pago.metodo = req.body.metodo ? String(req.body.metodo).trim() : '';
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'nota')) {
      pago.nota = req.body.nota ? String(req.body.nota).trim() : '';
    }

    factura.markModified('pagos');

    const totalPagos = Array.isArray(factura.pagos)
      ? factura.pagos.reduce((sum, pagoItem) => sum + (pagoItem.monto || 0), 0)
      : 0;

    if ((factura.montoTotal || 0) < totalPagos) {
      return res.status(400).json({ error: 'El monto total no puede ser inferior a los pagos registrados.' });
    }

    syncEstadoDesdePagos(factura);
    await factura.save();
    await populateFactura(factura);
    res.json(buildFacturaResponse(factura));
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

router.post('/:id/pagos-centro', protect, async (req, res) => {
  try {
    const { monto, fecha, metodo, nota } = req.body;
    if (typeof monto !== 'number' || Number.isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: 'El monto del pago debe ser un número positivo.' });
    }

    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id })
      .populate('centroSalud', 'nombre porcentajeRetencion');
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    if (!factura.centroSalud) {
      return res.status(400).json({ error: 'La factura no tiene un centro de salud asociado.' });
    }

    const porcentaje = Number(factura.centroSalud.porcentajeRetencion) || 0;
    const totalEsperado = ((Number(factura.montoTotal) || 0) * porcentaje) / 100;
    const totalPagado = Array.isArray(factura.pagosCentro)
      ? factura.pagosCentro.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0)
      : 0;

    if (totalEsperado > 0 && (totalPagado + monto) - totalEsperado > 1e-6) {
      return res.status(400).json({ error: 'El pago excede el monto pendiente con el centro de salud.' });
    }

    factura.pagosCentro.push({
      monto,
      fecha: fecha ? new Date(fecha) : Date.now(),
      metodo,
      nota,
    });

    await factura.save();
    await populateFactura(factura);
    res.status(201).json(buildFacturaResponse(factura));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/pagos-centro/:pagoId', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const pagoCentro = Array.isArray(factura.pagosCentro) ? factura.pagosCentro.id(req.params.pagoId) : null;
    if (!pagoCentro) {
      return res.status(404).json({ error: 'Pago al centro no encontrado en esta factura.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'monto')) {
      const montoValor = Number(req.body.monto);
      if (!Number.isFinite(montoValor) || montoValor <= 0) {
        return res.status(400).json({ error: 'El monto del pago debe ser un número positivo.' });
      }
      pagoCentro.monto = montoValor;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'fecha')) {
      const { fecha } = req.body;
      if (!fecha) {
        pagoCentro.fecha = Date.now();
      } else {
        const parsed = new Date(fecha);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'La fecha del pago no es válida.' });
        }
        pagoCentro.fecha = parsed;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'metodo')) {
      pagoCentro.metodo = req.body.metodo ? String(req.body.metodo).trim() : '';
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'nota')) {
      pagoCentro.nota = req.body.nota ? String(req.body.nota).trim() : '';
    }

    factura.markModified('pagosCentro');

    await factura.save();
    await populateFactura(factura);
    res.json(buildFacturaResponse(factura));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/pagos-centro/:pagoId', protect, async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, user: req.user._id });
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }

    const pagosIniciales = Array.isArray(factura.pagosCentro) ? factura.pagosCentro.length : 0;
    factura.pagosCentro = (factura.pagosCentro || []).filter((pago) => pago._id.toString() !== req.params.pagoId);

    if (pagosIniciales === factura.pagosCentro.length) {
      return res.status(404).json({ error: 'Pago al centro no encontrado en la factura.' });
    }

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
      return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido (20 MB).' });
    }

    const contentType = resolveAllowedContentType(archivo);
    if (!contentType) {
      return res.status(415).json({ error: 'Solo se permiten archivos PDF o JPG.' });
    }

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
