const mongoose = require('mongoose');

const obraSocialSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  telefono: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  cuitCuil: { type: String, trim: true },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('ObraSocial', obraSocialSchema);
