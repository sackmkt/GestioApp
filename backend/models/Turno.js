const mongoose = require('mongoose');

const turnoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paciente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
    },
    titulo: {
      type: String,
      trim: true,
    },
    notas: {
      type: String,
      trim: true,
    },
    fecha: {
      type: Date,
      required: true,
    },
    duracionMinutos: {
      type: Number,
      default: 30,
      min: 5,
    },
    estado: {
      type: String,
      enum: ['programado', 'completado', 'cancelado'],
      default: 'programado',
    },
    recordatorioHorasAntes: {
      type: Number,
      min: 0,
    },
    recordatorioProgramadoPara: {
      type: Date,
    },
    recordatorioEnviado: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

turnoSchema.index({ user: 1, fecha: 1 });
turnoSchema.index({ user: 1, estado: 1, fecha: 1 });
turnoSchema.index({ user: 1, paciente: 1, fecha: 1 });

module.exports = mongoose.model('Turno', turnoSchema);
