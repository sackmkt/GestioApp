const mongoose = require('mongoose');

const obraSocialSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  telefono: { type: String },
  email: { type: String },
  cuit: { type: String, trim: true },
  user: { // Nuevo campo
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

obraSocialSchema.index(
  { user: 1, nombre: 1 },
  {
    unique: true,
    name: 'obraSocial_user_nombre_unique',
    background: true,
    partialFilterExpression: {
      user: { $exists: true },
      nombre: { $exists: true },
    },
  },
);

obraSocialSchema.index(
  { user: 1, cuit: 1 },
  {
    unique: true,
    name: 'obraSocial_user_cuit_unique',
    background: true,
    partialFilterExpression: {
      user: { $exists: true },
      cuit: { $exists: true, $ne: null },
    },
  },
);

module.exports = mongoose.model('ObraSocial', obraSocialSchema);
