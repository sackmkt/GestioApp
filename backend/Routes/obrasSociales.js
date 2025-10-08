const express = require('express');
const router = express.Router();
const ObraSocial = require('../models/ObraSocial');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/', protect, async (req, res) => {
  try {
    const obrasSociales = await ObraSocial.find({ user: req.user._id });
    res.json(obrasSociales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const nuevaObraSocial = new ObraSocial({
      ...req.body,
      user: req.user._id,
    });
    await nuevaObraSocial.save();
    res.status(201).json(nuevaObraSocial);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const obraSocial = await ObraSocial.findOne({ _id: req.params.id, user: req.user._id });
    if (!obraSocial) return res.status(404).json({ error: 'Obra social no encontrada o no autorizada' });
    res.json(obraSocial);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const obraSocialActualizada = await ObraSocial.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    if (!obraSocialActualizada) return res.status(404).json({ error: 'Obra social no encontrada o no autorizada' });
    res.json(obraSocialActualizada);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const obraSocialEliminada = await ObraSocial.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!obraSocialEliminada) return res.status(404).json({ error: 'Obra Social no encontrada o no autorizada' });
    res.json({ message: 'Obra Social eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
