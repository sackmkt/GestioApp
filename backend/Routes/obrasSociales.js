const express = require('express');
const router = express.Router();
const ObraSocial = require('../models/ObraSocial');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, async (req, res) => {
  try {
    const obrasSociales = await ObraSocial.find({ user: req.user._id });
    res.json(obrasSociales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    const nuevaObraSocial = new ObraSocial({
      ...req.body,
      user: req.user._id,
    });
    await nuevaObraSocial.save();
    res.status(201).json(nuevaObraSocial);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una obra social con este CUIT para este profesional.' });
    }
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

router.put('/:id', protect, async (req, res) => {
  try {
    const obraSocialActualizada = await ObraSocial.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    if (!obraSocialActualizada) return res.status(404).json({ error: 'Obra social no encontrada o no autorizada' });
    res.json(obraSocialActualizada);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una obra social con este CUIT para este profesional.' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const obraSocialEliminada = await ObraSocial.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!obraSocialEliminada) return res.status(404).json({ error: 'Obra Social no encontrada o no autorizada' });
    res.json({ message: 'Obra Social eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
