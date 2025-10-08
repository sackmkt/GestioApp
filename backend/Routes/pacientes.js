const express = require('express');
const router = express.Router();
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const normalizePacientePayload = async (payload, userId) => {
  const normalized = { ...payload };

  if (normalized.email === '') {
    normalized.email = undefined;
  }

  if (normalized.telefono === '') {
    normalized.telefono = undefined;
  }

  if (normalized.tipoAtencion !== 'centro') {
    normalized.tipoAtencion = 'particular';
    normalized.centroSalud = undefined;
    return normalized;
  }

  if (!normalized.centroSalud) {
    throw new Error('Debes seleccionar un centro de salud para pacientes atendidos por centro.');
  }

  const centro = await CentroSalud.findOne({ _id: normalized.centroSalud, user: userId });
  if (!centro) {
    throw new Error('Centro de salud no válido para este profesional.');
  }

  normalized.centroSalud = centro._id;
  return normalized;
};

router.post('/', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const payload = await normalizePacientePayload(req.body, req.user._id);

    const nuevoPaciente = new Paciente({
      ...payload,
      user: req.user._id,
    });

    await nuevoPaciente.save();
    await nuevoPaciente.populate('obraSocial');
    await nuevoPaciente.populate('centroSalud');

    res.status(201).json(nuevoPaciente);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El DNI ya está registrado para este profesional.' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const pacientes = await Paciente.find({ user: req.user._id })
      .populate('obraSocial')
      .populate('centroSalud');
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id })
      .populate('obraSocial')
      .populate('centroSalud');
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(paciente);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const payload = await normalizePacientePayload(req.body, req.user._id);

    const pacienteActualizado = await Paciente.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      payload,
      { new: true, runValidators: true }
    )
      .populate('obraSocial')
      .populate('centroSalud');

    if (!pacienteActualizado) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(pacienteActualizado);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El DNI ya está registrado para este profesional.' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const pacienteEliminado = await Paciente.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!pacienteEliminado) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
