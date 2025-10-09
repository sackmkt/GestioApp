const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { app } = require('./app');
const Factura = require('./models/Factura');
const Paciente = require('./models/Paciente');
const ObraSocial = require('./models/ObraSocial');

const dropLegacyObraSocialIndexes = async () => {
  try {
    await ObraSocial.collection.dropIndex('cuit_1');
    console.log('Índice obsoleto cuit_1 eliminado de ObraSocial');
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message : '';

    if (error.codeName === 'IndexNotFound' || error.code === 27 || message.includes('index not found')) {
      return;
    }

    if (error.code === 26 || message.includes('ns not found')) {
      return;
    }

    throw error;
  }
};

const syncTenantIndexes = async () => {
  const models = [
    {
      name: 'ObraSocial',
      sync: async () => {
        await dropLegacyObraSocialIndexes();
        await ObraSocial.syncIndexes();
      },
    },
    { name: 'Factura', sync: () => Factura.syncIndexes() },
    { name: 'Paciente', sync: () => Paciente.syncIndexes() },
  ];

  for (const { name, sync } of models) {
    try {
      await sync();
    } catch (error) {
      console.error(`No se pudieron sincronizar los índices de ${name}:`, error.message);
      throw error;
    }
  }
};

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

const startServer = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error('La variable de entorno MONGO_URI es obligatoria.');
    }

    await mongoose.connect(MONGO_URI);
    console.log('Conectado a la base de datos de MongoDB');

    await syncTenantIndexes();
    console.log('Índices de inquilino sincronizados correctamente');

    app.listen(PORT, () => {
      console.log(`Servidor escuchando el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error.message);
    process.exit(1);
  }
};

startServer();
