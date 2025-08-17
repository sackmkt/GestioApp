const mongoose = require('mongoose');

const facturaSchema = new mongoose.Schema({
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
  obraSocial: { type: mongoose.Schema.Types.ObjectId, ref: 'ObraSocial' },
  numeroFactura: { type: Number, required: true, unique: true },
  montoTotal: { type: Number, required: true },
  fechaEmision: { type: Date, required: true },
  pagado: { type: Boolean, default: false },
  user: { // Nuevo campo
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('Factura', facturaSchema);