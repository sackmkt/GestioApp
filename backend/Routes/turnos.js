const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();
const Turno = require('../models/Turno');
const Paciente = require('../models/Paciente');
const { protect } = require('../middleware/authMiddleware');

const DEFAULT_PAGE_LIMIT = 16;
const MAX_PAGE_LIMIT = 100;
const AGENDA_MAX_LIMIT = 200;
const UPCOMING_LIMIT = 10;
const PATIENT_PUBLIC_FIELDS = 'nombre apellido dni email telefono telefonoMovil';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
router.post('/', protect, async (req, res) => {
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
    const turnoConPaciente = await nuevoTurno.populate('paciente', PATIENT_PUBLIC_FIELDS);
    res.status(201).json(turnoConPaciente);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener todos los turnos del usuario autenticado
router.get('/', protect, async (req, res) => {
  try {
    const {
      estado,
      desde,
      hasta,
      search,
      paciente: pacienteParam,
      page = '1',
      limit = DEFAULT_PAGE_LIMIT.toString(),
      sortOrder = 'asc',
    } = req.query;

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const filtro = { user: userId };

    if (estado && estado !== 'todos') {
      filtro.estado = estado;
    }

    if (typeof pacienteParam === 'string' && mongoose.Types.ObjectId.isValid(pacienteParam)) {
      filtro.paciente = new mongoose.Types.ObjectId(pacienteParam);
    }

    const rangoFechas = {};
    if (desde) {
      const fechaDesde = new Date(desde);
      if (!Number.isNaN(fechaDesde.getTime())) {
        rangoFechas.$gte = fechaDesde;
      }
    }
    if (hasta) {
      const fechaHasta = new Date(hasta);
      if (!Number.isNaN(fechaHasta.getTime())) {
        rangoFechas.$lte = fechaHasta;
      }
    }
    if (Object.keys(rangoFechas).length > 0) {
      filtro.fecha = rangoFechas;
    }

    const trimmedSearch = typeof search === 'string' ? search.trim() : '';
    if (trimmedSearch) {
      const regex = new RegExp(escapeRegex(trimmedSearch), 'i');
      const pacientesCoincidentes = await Paciente.find({
        user: userId,
        $or: [
          { nombre: regex },
          { apellido: regex },
          { dni: regex },
        ],
      }).select('_id');

      const pacientesIds = pacientesCoincidentes.map((doc) => doc._id);
      const condicionesBusqueda = [
        { titulo: regex },
        { notas: regex },
      ];

      if (pacientesIds.length > 0) {
        condicionesBusqueda.push({ paciente: { $in: pacientesIds } });
      }

      filtro.$or = condicionesBusqueda;
    }

    let parsedLimit = Number.parseInt(limit, 10);
    if (Number.isNaN(parsedLimit)) {
      parsedLimit = DEFAULT_PAGE_LIMIT;
    }

    if (parsedLimit < 0) {
      parsedLimit = DEFAULT_PAGE_LIMIT;
    }

    if (parsedLimit > MAX_PAGE_LIMIT) {
      parsedLimit = MAX_PAGE_LIMIT;
    }

    if (String(limit).trim() === '0') {
      parsedLimit = 0;
    }

    const normalizedLimit = parsedLimit === 0 ? 0 : Math.max(parsedLimit, 1);
    const totalDocs = await Turno.countDocuments(filtro);
    const totalPages = normalizedLimit > 0 ? Math.max(Math.ceil(totalDocs / normalizedLimit), 1) : 1;
    const requestedPage = Number.parseInt(page, 10);
    const safePage = normalizedLimit > 0
      ? Math.min(Math.max(Number.isNaN(requestedPage) ? 1 : requestedPage, 1), totalPages)
      : 1;
    const skip = normalizedLimit > 0 ? (safePage - 1) * normalizedLimit : 0;

    const sortDirection = String(sortOrder).toLowerCase() === 'desc' ? -1 : 1;
    const sort = { fecha: sortDirection, _id: sortDirection };

    let turnosQuery = Turno.find(filtro)
      .sort(sort)
      .populate('paciente', PATIENT_PUBLIC_FIELDS);

    if (normalizedLimit > 0) {
      turnosQuery = turnosQuery.skip(skip).limit(normalizedLimit);
    }

    const agendaLimit = normalizedLimit > 0
      ? Math.min(normalizedLimit * 5, AGENDA_MAX_LIMIT)
      : AGENDA_MAX_LIMIT;

    const agendaQuery = Turno.find(filtro)
      .sort(sort)
      .limit(agendaLimit)
      .populate('paciente', PATIENT_PUBLIC_FIELDS);

    const upcomingFilter = { ...filtro };
    if (filtro.fecha) {
      upcomingFilter.fecha = { ...filtro.fecha };
    }

    const now = new Date();
    upcomingFilter.fecha = upcomingFilter.fecha || {};
    if (!upcomingFilter.fecha.$gte || upcomingFilter.fecha.$gte < now) {
      upcomingFilter.fecha.$gte = now;
    }

    const upcomingQuery = Turno.find(upcomingFilter)
      .sort(sort)
      .limit(UPCOMING_LIMIT)
      .populate('paciente', PATIENT_PUBLIC_FIELDS);

    const [turnos, agendaTurnos, upcomingTurnos] = await Promise.all([
      turnosQuery.exec(),
      agendaQuery.exec(),
      upcomingQuery.exec(),
    ]);

    const pagination = {
      page: safePage,
      limit: normalizedLimit,
      totalDocs,
      totalPages,
      hasPrevPage: normalizedLimit > 0 ? safePage > 1 : false,
      hasNextPage: normalizedLimit > 0 ? safePage < totalPages : false,
    };

    res.json({
      data: turnos,
      pagination,
      agenda: agendaTurnos,
      upcoming: upcomingTurnos,
    });
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
    }).populate('paciente', PATIENT_PUBLIC_FIELDS);

    if (!turno) {
      return res.status(404).json({ error: 'Turno no encontrado o no autorizado' });
    }

    res.json(turno);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar un turno
router.put('/:id', protect, async (req, res) => {
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
    const turnoActualizado = await turno.populate('paciente', PATIENT_PUBLIC_FIELDS);
    res.json(turnoActualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Actualizar el estado del recordatorio
router.patch('/:id/recordatorio', protect, async (req, res) => {
  try {
    const { recordatorioEnviado } = req.body;
    const turnoActualizado = await Turno.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { recordatorioEnviado: !!recordatorioEnviado },
      { new: true }
    ).populate('paciente', PATIENT_PUBLIC_FIELDS);

    if (!turnoActualizado) {
      return res.status(404).json({ error: 'Turno no encontrado o no autorizado' });
    }

    res.json(turnoActualizado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Eliminar un turno
router.delete('/:id', protect, async (req, res) => {
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
