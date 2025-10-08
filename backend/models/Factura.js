const mongoose = require('mongoose');

const ESTADOS_FACTURA = ['pendiente', 'presentada', 'observada', 'pagada_parcial', 'pagada'];

const comprobanteSchema = new mongoose.Schema({
  nombreOriginal: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  storageKey: { type: String, required: true },
  publicUrl: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: true });

comprobanteSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.storageKey;
    return ret;
  },
});

const facturaSchema = new mongoose.Schema({
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
  obraSocial: { type: mongoose.Schema.Types.ObjectId, ref: 'ObraSocial' },
  centroSalud: { type: mongoose.Schema.Types.ObjectId, ref: 'CentroSalud' },
  puntoVenta: { type: Number, min: 0 },
  numeroFactura: { type: Number, required: true, min: 0 },
  montoTotal: { type: Number, required: true, min: 0 },
  fechaEmision: { type: Date, required: true },
  fechaVencimiento: { type: Date },
  interes: { type: Number, default: 0, min: 0 },
  estado: { type: String, enum: ESTADOS_FACTURA, default: 'pendiente' },
  observaciones: { type: String, trim: true },
  pagos: [{
    monto: { type: Number, required: true, min: 0 },
    fecha: { type: Date, default: Date.now },
    metodo: { type: String, trim: true },
    nota: { type: String, trim: true },
  }],
  pagado: { type: Boolean, default: false },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  comprobantes: [comprobanteSchema],
}, { timestamps: true });

facturaSchema.index(
  { user: 1, puntoVenta: 1, numeroFactura: 1 },
  {
    unique: true,
    partialFilterExpression: {
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
