const express = require('express');
const router = express.Router();
const Paciente = require('../models/Paciente');
const { protect } = require('../middleware/authMiddleware'); // Importa el middleware de protección

// Rutas protegidas
// Crea un nuevo paciente
router.post('/', protect, async (req, res) => {
  try {
    const nuevoPaciente = new Paciente({
      ...req.body,
      user: req.user._id, // Guarda el ID del usuario autenticado
    });
    await nuevoPaciente.save();
    res.status(201).json(nuevoPaciente);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El DNI ya está registrado.' });
    }
    res.status(400).json({ error: error.message });
  }
});

// Obtiene todos los pacientes del usuario autenticado
router.get('/', protect, async (req, res) => {
  try {
    const pacientes = await Paciente.find({ user: req.user._id }).populate('obraSocial');
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener un paciente por ID (del usuario autenticado)
router.get('/:id', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id }).populate('obraSocial');
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(paciente);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualiza un paciente por ID (del usuario autenticado)
router.put('/:id', protect, async (req, res) => {
  try {
    const pacienteActualizado = await Paciente.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    if (!pacienteActualizado) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(pacienteActualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Elimina un paciente por ID (del usuario autenticado)
router.delete('/:id', protect, async (req, res) => {
  try {
    const pacienteEliminado = await Paciente.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!pacienteEliminado) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
