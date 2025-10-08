const express = require('express');
const router = express.Router();
const Factura = require('../models/Factura');
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');

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

const allowedUpdateFields = ['paciente', 'obraSocial', 'numeroFactura', 'montoTotal', 'fechaEmision', 'fechaVencimiento', 'interes', 'observaciones', 'centroSalud'];

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

    const nuevaFactura = new Factura({
      ...req.body,
      centroSalud: centroSaludId || null,
      user: req.user._id,
    });

    if (!Factura.ESTADOS_FACTURA.includes(nuevaFactura.estado)) {
      return res.status(400).json({ error: 'Estado de factura inválido.' });
    }

    syncEstadoDesdePagos(nuevaFactura);
    const facturaGuardada = await nuevaFactura.save();
    await populateFactura(facturaGuardada);
    res.status(201).json(buildFacturaResponse(facturaGuardada));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El número de factura ya existe.' });
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

    allowedUpdateFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field) && field !== 'centroSalud') {
        factura[field] = req.body[field];
      }
    });

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
      return res.status(400).json({ error: 'El número de factura ya existe.' });
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
    res.json({ message: 'Factura eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
