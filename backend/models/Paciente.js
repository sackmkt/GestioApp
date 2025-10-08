const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
  nombreOriginal: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  storageKey: { type: String, required: true },
  publicUrl: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: true });

documentoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.storageKey;
    return ret;
  },
});

const pacienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  dni: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  telefono: { type: String, trim: true },
  tipoAtencion: { type: String, enum: ['particular', 'centro'], default: 'particular' },
  centroSalud: { type: mongoose.Schema.Types.ObjectId, ref: 'CentroSalud' },
  obraSocial: { type: mongoose.Schema.Types.ObjectId, ref: 'ObraSocial' },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  documentos: [documentoSchema],
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
