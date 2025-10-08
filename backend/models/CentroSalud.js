const mongoose = require('mongoose');

const centroSaludSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
  },
  porcentajeRetencion: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('CentroSalud', centroSaludSchema);
