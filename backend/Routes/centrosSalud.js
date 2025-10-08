const express = require('express');
const router = express.Router();
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');

// Crear un centro de salud
router.post('/', protect, async (req, res) => {
  try {
    const { nombre, porcentajeRetencion } = req.body;

    const centro = new CentroSalud({
      nombre,
      porcentajeRetencion,
      user: req.user._id,
    });

    await centro.save();
    res.status(201).json(centro);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener todos los centros de salud del usuario
router.get('/', protect, async (req, res) => {
  try {
    const centros = await CentroSalud.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(centros);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar un centro de salud
router.put('/:id', protect, async (req, res) => {
  try {
    const { nombre, porcentajeRetencion } = req.body;

    const centroActualizado = await CentroSalud.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { nombre, porcentajeRetencion },
      { new: true, runValidators: true }
    );

    if (!centroActualizado) {
      return res.status(404).json({ error: 'Centro de salud no encontrado o no autorizado' });
    }

    res.json(centroActualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Eliminar un centro de salud
router.delete('/:id', protect, async (req, res) => {
  try {
    const eliminado = await CentroSalud.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!eliminado) {
      return res.status(404).json({ error: 'Centro de salud no encontrado o no autorizado' });
    }

    res.json({ message: 'Centro de salud eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
