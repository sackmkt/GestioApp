const express = require('express');
const router = express.Router();
const Turno = require('../models/Turno');
const Paciente = require('../models/Paciente');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const calcularRecordatorio = (fecha, horasAntes) => {
  if (!fecha || horasAntes === undefined || horasAntes === null) {
    return null;
  }

  const horas = Number(horasAntes);
  if (Number.isNaN(horas)) {
    return null;
  }

  const fechaTurno = new Date(fecha);
  if (Number.isNaN(fechaTurno.getTime())) {
    return null;
  }

  return new Date(fechaTurno.getTime() - horas * 60 * 60 * 1000);
};

const sanitizarRecordatorio = (recordatorioHorasAntes) => {
  if (recordatorioHorasAntes === '' || recordatorioHorasAntes === null) {
    return undefined;
  }
  if (recordatorioHorasAntes === undefined) {
    return undefined;
  }

  const numero = Number(recordatorioHorasAntes);
  return Number.isNaN(numero) ? undefined : numero;
};

// Crear un nuevo turno
router.post('/', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const {
      paciente,
      fecha,
      duracionMinutos,
      estado,
      notas,
      titulo,
      recordatorioHorasAntes,
    } = req.body;

    const pacienteAsociado = await Paciente.findOne({
      _id: paciente,
      user: req.user._id,
    });

    if (!pacienteAsociado) {
      return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
    }

    const recordatorioSanitizado = sanitizarRecordatorio(recordatorioHorasAntes);

    const nuevoTurno = new Turno({
      user: req.user._id,
      paciente,
      fecha,
      duracionMinutos,
      estado,
      notas,
      titulo,
      recordatorioHorasAntes: recordatorioSanitizado,
      recordatorioProgramadoPara: calcularRecordatorio(fecha, recordatorioSanitizado),
      recordatorioEnviado: false,
    });

    await nuevoTurno.save();
    const turnoConPaciente = await nuevoTurno.populate('paciente', 'nombre apellido dni');
    res.status(201).json(turnoConPaciente);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener todos los turnos del usuario autenticado
router.get('/', protect, async (req, res) => {
  try {
    const { estado, desde, hasta } = req.query;
    const filtro = { user: req.user._id };

    if (estado) {
      filtro.estado = estado;
    }

    if (desde || hasta) {
      filtro.fecha = {};
      if (desde) {
        filtro.fecha.$gte = new Date(desde);
      }
      if (hasta) {
        filtro.fecha.$lte = new Date(hasta);
      }
    }

    const turnos = await Turno.find(filtro)
      .sort({ fecha: 1 })
      .populate('paciente', 'nombre apellido dni');

    res.json(turnos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener un turno por ID
router.get('/:id', protect, async (req, res) => {
  try {
    const turno = await Turno.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('paciente', 'nombre apellido dni');

    if (!turno) {
      return res.status(404).json({ error: 'Turno no encontrado o no autorizado' });
    }

    res.json(turno);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar un turno
router.put('/:id', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const {
      paciente,
      fecha,
      duracionMinutos,
      estado,
      notas,
      titulo,
      recordatorioHorasAntes,
      recordatorioEnviado,
    } = req.body;

    const turno = await Turno.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!turno) {
      return res.status(404).json({ error: 'Turno no encontrado o no autorizado' });
    }

    if (paciente && paciente.toString() !== turno.paciente.toString()) {
      const pacienteAsociado = await Paciente.findOne({
        _id: paciente,
        user: req.user._id,
      });

      if (!pacienteAsociado) {
        return res.status(404).json({ error: 'Paciente no encontrado o no autorizado' });
      }

      turno.paciente = paciente;
    }

    if (fecha) {
      turno.fecha = fecha;
    }

    if (duracionMinutos !== undefined) {
      turno.duracionMinutos = duracionMinutos;
    }

    if (estado) {
      turno.estado = estado;
    }

    if (notas !== undefined) {
      turno.notas = notas;
    }

    if (titulo !== undefined) {
      turno.titulo = titulo;
    }

    const recordatorioSanitizado = sanitizarRecordatorio(recordatorioHorasAntes);
    if (recordatorioHorasAntes !== undefined) {
      turno.recordatorioHorasAntes = recordatorioSanitizado;
    }

    if (recordatorioEnviado !== undefined) {
      turno.recordatorioEnviado = recordatorioEnviado;
    }

    turno.recordatorioProgramadoPara = calcularRecordatorio(
      turno.fecha,
      turno.recordatorioHorasAntes
    );

    await turno.save();
    const turnoActualizado = await turno.populate('paciente', 'nombre apellido dni');
    res.json(turnoActualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Actualizar el estado del recordatorio
router.patch('/:id/recordatorio', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const { recordatorioEnviado } = req.body;
    const turnoActualizado = await Turno.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { recordatorioEnviado: !!recordatorioEnviado },
      { new: true }
    ).populate('paciente', 'nombre apellido dni');

    if (!turnoActualizado) {
      return res.status(404).json({ error: 'Turno no encontrado o no autorizado' });
    }

    res.json(turnoActualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Eliminar un turno
router.delete('/:id', protect, authorizeRoles('admin', 'professional'), async (req, res) => {
  try {
    const turnoEliminado = await Turno.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!turnoEliminado) {
      return res.status(404).json({ error: 'Turno no encontrado o no autorizado' });
    }

    res.json({ message: 'Turno eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
