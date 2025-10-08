const mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  dni: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  telefono: { type: String, trim: true },
  tipoAtencion: { type: String, enum: ['particular', 'centro'], default: 'particular' },
  centroSalud: { type: mongoose.Schema.Types.ObjectId, ref: 'CentroSalud' },
  obraSocial: { type: mongoose.Schema.Types.ObjectId, ref: 'ObraSocial' },
  documentos: [{
    nombre: { type: String, required: true },
    descripcion: { type: String, trim: true },
    storage: { type: String, enum: ['local', 's3'], required: true },
    key: { type: String, required: true },
    bucket: { type: String },
    contentType: { type: String },
    size: { type: Number, min: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, {
  timestamps: true,
});

pacienteSchema.pre('validate', function validateCentro(next) {
  if (this.tipoAtencion === 'centro' && !this.centroSalud) {
    return next(new Error('Debes seleccionar un centro de salud para pacientes atendidos por centro.'));
  }
  return next();
});

pacienteSchema.index({ user: 1, dni: 1 }, { unique: true });

module.exports = mongoose.model('Paciente', pacienteSchema);
