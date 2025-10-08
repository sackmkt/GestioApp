const express = require('express');
const router = express.Router();
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');

const sanitizeCentroData = (body = {}) => {
  const data = {
    nombre: body.nombre?.trim(),
    localidad: body.localidad?.trim() || '',
    provincia: body.provincia?.trim() || '',
  };

  if (typeof body.retencionPorcentaje === 'number') {
    data.retencionPorcentaje = body.retencionPorcentaje;
  } else if (typeof body.retencionPorcentaje === 'string' && body.retencionPorcentaje !== '') {
    data.retencionPorcentaje = Number(body.retencionPorcentaje);
  }

  return data;
};

router.post('/', protect, async (req, res) => {
  try {
    const payload = sanitizeCentroData(req.body);

    if (!payload.nombre) {
      return res.status(400).json({ error: 'El nombre del centro de salud es obligatorio.' });
    }

    if (payload.retencionPorcentaje == null || Number.isNaN(payload.retencionPorcentaje)) {
      return res.status(400).json({ error: 'Debe indicar el porcentaje de retención.' });
    }

    if (payload.retencionPorcentaje < 0 || payload.retencionPorcentaje > 100) {
      return res.status(400).json({ error: 'El porcentaje de retención debe estar entre 0 y 100.' });
    }

    const nuevoCentro = new CentroSalud({
      ...payload,
      user: req.user._id,
    });

    await nuevoCentro.save();
    res.status(201).json(nuevoCentro);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya tienes un centro de salud con ese nombre.' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const centros = await CentroSalud.find({ user: req.user._id }).sort({ nombre: 1 });
    res.json(centros);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const centro = await CentroSalud.findOne({ _id: req.params.id, user: req.user._id });
    if (!centro) {
      return res.status(404).json({ error: 'Centro de salud no encontrado o no autorizado.' });
    }
    res.json(centro);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const payload = sanitizeCentroData(req.body);
    const centro = await CentroSalud.findOne({ _id: req.params.id, user: req.user._id });

    if (!centro) {
      return res.status(404).json({ error: 'Centro de salud no encontrado o no autorizado.' });
    }

    if (payload.nombre) {
      centro.nombre = payload.nombre;
    }

    if (payload.localidad !== undefined) {
      centro.localidad = payload.localidad;
    }

    if (payload.provincia !== undefined) {
      centro.provincia = payload.provincia;
    }

    if (payload.retencionPorcentaje != null) {
      if (Number.isNaN(payload.retencionPorcentaje)) {
        return res.status(400).json({ error: 'El porcentaje de retención debe ser numérico.' });
      }
      if (payload.retencionPorcentaje < 0 || payload.retencionPorcentaje > 100) {
        return res.status(400).json({ error: 'El porcentaje de retención debe estar entre 0 y 100.' });
      }
      centro.retencionPorcentaje = payload.retencionPorcentaje;
    }

    await centro.save();
    res.json(centro);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya tienes un centro de salud con ese nombre.' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const deleted = await CentroSalud.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!deleted) {
      return res.status(404).json({ error: 'Centro de salud no encontrado o no autorizado.' });
    }
    res.json({ message: 'Centro de salud eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
