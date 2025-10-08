const mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  apellido: { type: String, required: true, trim: true },
  dni: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  telefono: { type: String, trim: true },
  tipoAtencion: { type: String, enum: ['particular', 'centro'], default: 'particular' },
  centroSalud: { type: mongoose.Schema.Types.ObjectId, ref: 'CentroSalud' },
  obraSocial: { type: mongoose.Schema.Types.ObjectId, ref: 'ObraSocial' },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

pacienteSchema.index({ user: 1, dni: 1 }, { unique: true });

module.exports = mongoose.model('Paciente', pacienteSchema);
