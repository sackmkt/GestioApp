const express = require('express');
const router = express.Router();
const Paciente = require('../models/Paciente');
const CentroSalud = require('../models/CentroSalud');
const { protect } = require('../middleware/authMiddleware');

const buildPacienteData = (body = {}) => {
  const tipoAtencion = body.tipoAtencion === 'centro' ? 'centro' : 'particular';

  const data = {
    nombre: body.nombre?.trim(),
    apellido: body.apellido?.trim(),
    dni: body.dni?.trim(),
    obraSocial: body.obraSocial && body.obraSocial !== '' ? body.obraSocial : null,
    email: body.email?.trim() || '',
    telefono: body.telefono?.trim() || '',
    tipoAtencion,
  };

  if (tipoAtencion === 'centro') {
    data.centroSalud = body.centroSalud || null;
  } else {
    data.centroSalud = null;
  }

  return data;
};

const ensureCentroForUser = async (centroId, userId) => {
  if (!centroId) {
    throw new Error('Debes seleccionar el centro de salud correspondiente.');
  }
  const centro = await CentroSalud.findOne({ _id: centroId, user: userId });
  if (!centro) {
    throw new Error('Centro de salud no encontrado o no autorizado.');
  }
  return centro;
};

router.post('/', protect, async (req, res) => {
  try {
    const data = buildPacienteData(req.body);

    if (!data.nombre || !data.apellido || !data.dni) {
      return res.status(400).json({ error: 'Nombre, apellido y DNI son campos obligatorios.' });
    }

    if (data.tipoAtencion === 'centro') {
      try {
        const centro = await ensureCentroForUser(data.centroSalud, req.user._id);
        data.centroSalud = centro._id;
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
    }

    const nuevoPaciente = new Paciente({
      ...data,
      user: req.user._id,
    });

    await nuevoPaciente.save();
    await nuevoPaciente.populate('obraSocial', 'nombre');
    await nuevoPaciente.populate('centroSalud', 'nombre retencionPorcentaje localidad provincia');
    res.status(201).json(nuevoPaciente);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El DNI ya está registrado.' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const pacientes = await Paciente.find({ user: req.user._id })
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre retencionPorcentaje localidad provincia')
      .sort({ apellido: 1, nombre: 1 });
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id })
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre retencionPorcentaje localidad provincia');
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    res.json(paciente);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const paciente = await Paciente.findOne({ _id: req.params.id, user: req.user._id });
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const data = buildPacienteData(req.body);

    if (!data.nombre || !data.apellido || !data.dni) {
      return res.status(400).json({ error: 'Nombre, apellido y DNI son campos obligatorios.' });
    }

    paciente.nombre = data.nombre;
    paciente.apellido = data.apellido;
    paciente.dni = data.dni;
    paciente.obraSocial = data.obraSocial || null;
    paciente.email = data.email;
    paciente.telefono = data.telefono;
    paciente.tipoAtencion = data.tipoAtencion;

    if (data.tipoAtencion === 'centro') {
      try {
        const centro = await ensureCentroForUser(data.centroSalud, req.user._id);
        paciente.centroSalud = centro._id;
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
    } else {
      paciente.centroSalud = null;
    }

    await paciente.save();
    await paciente.populate('obraSocial', 'nombre');
    await paciente.populate('centroSalud', 'nombre retencionPorcentaje localidad provincia');
    res.json(paciente);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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
