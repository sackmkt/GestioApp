const mongoose = require('mongoose');

const centroSaludSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  localidad: { type: String, trim: true },
  provincia: { type: String, trim: true },
  retencionPorcentaje: { type: Number, required: true, min: 0, max: 100 },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

centroSaludSchema.index({ user: 1, nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

module.exports = mongoose.model('CentroSalud', centroSaludSchema);
