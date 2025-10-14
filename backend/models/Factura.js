const mongoose = require('mongoose');

const ESTADOS_FACTURA = ['pendiente', 'presentada', 'observada', 'pagada_parcial', 'pagada'];

const facturaSchema = new mongoose.Schema({
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
  obraSocial: { type: mongoose.Schema.Types.ObjectId, ref: 'ObraSocial' },
  centroSalud: { type: mongoose.Schema.Types.ObjectId, ref: 'CentroSalud' },
  puntoVenta: { type: Number, min: 0 },
  numeroFactura: { type: Number, required: true, min: 0 },
  montoTotal: { type: Number, required: true, min: 0 },
  fechaEmision: { type: Date, required: true },
  fechaVencimiento: { type: Date },
  estado: { type: String, enum: ESTADOS_FACTURA, default: 'pendiente' },
  observaciones: { type: String, trim: true },
  pagos: [{
    monto: { type: Number, required: true, min: 0 },
    fecha: { type: Date, default: Date.now },
    metodo: { type: String, trim: true },
    nota: { type: String, trim: true },
  }],
  pagosCentro: [{
    monto: { type: Number, required: true, min: 0 },
    fecha: { type: Date, default: Date.now },
    metodo: { type: String, trim: true },
    nota: { type: String, trim: true },
  }],
  pagado: { type: Boolean, default: false },
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
}, { timestamps: true });

facturaSchema.index(
  { user: 1, puntoVenta: 1, numeroFactura: 1 },
  {
    unique: true,
    name: 'factura_user_puntoVenta_numeroFactura_unique',
    background: true,
    partialFilterExpression: {
      user: { $exists: true },
      puntoVenta: { $exists: true },
      numeroFactura: { $exists: true },
    },
  },
);

facturaSchema.virtual('montoCobrado').get(function montoCobrado() {
  if (!Array.isArray(this.pagos)) {
    return 0;
  }
  return this.pagos.reduce((total, pago) => total + (pago.monto || 0), 0);
});

facturaSchema.virtual('saldoPendiente').get(function saldoPendiente() {
  const pagado = this.montoCobrado || 0;
  const saldo = (this.montoTotal || 0) - pagado;
  return Number.isFinite(saldo) ? Math.max(saldo, 0) : 0;
});

facturaSchema.set('toJSON', { virtuals: true });
facturaSchema.set('toObject', { virtuals: true });

facturaSchema.statics.ESTADOS_FACTURA = ESTADOS_FACTURA;

module.exports = mongoose.model('Factura', facturaSchema);
