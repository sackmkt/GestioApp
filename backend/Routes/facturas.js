const express = require('express');
const router = express.Router();
const Factura = require('../models/Factura');
const { protect } = require('../middleware/authMiddleware');

// Rutas protegidas
// Crea una nueva factura para el usuario autenticado
router.post('/', protect, async (req, res) => {
  try {
    const nuevaFactura = new Factura({
      ...req.body,
      user: req.user._id, // Guarda el ID del usuario
    });
    const facturaGuardada = await nuevaFactura.save();
    res.status(201).json(facturaGuardada);
  } catch (error) {
    // Si el error es por duplicado (código 11000)
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
      .populate('paciente', 'nombre apellido dni')
      .populate('obraSocial', 'nombre');
    res.json(facturas);
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

// Marca una factura como pagada (del usuario autenticado)
router.put('/:id', protect, async (req, res) => {
  try {
    const facturaActualizada = await Factura.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { pagado: true },
      { new: true }
    );
    if (!facturaActualizada) {
      return res.status(404).json({ error: 'Factura no encontrada o no autorizada' });
    }
    res.json(facturaActualizada);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;