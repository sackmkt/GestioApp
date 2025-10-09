const mongoose = require('mongoose');

const obraSocialSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  telefono: { type: String },
  email: { type: String },
  cuit: {
    type: String,
    trim: true,
    set: (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      const normalized = String(value).trim();
      return normalized === '' ? undefined : normalized;
    },
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

obraSocialSchema.index(
  { user: 1, cuit: 1 },
  {
    unique: true,
    partialFilterExpression: {
      cuit: { $exists: true, $nin: [null, ''] },
    },
  },
);

module.exports = mongoose.model('ObraSocial', obraSocialSchema);
