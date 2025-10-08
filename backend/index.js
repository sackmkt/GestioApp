const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { app } = require('./app');

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

    app.listen(PORT, () => {
      console.log(`Servidor escuchando el puerto ${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error.message);
    process.exit(1);
  }
};

startServer();
