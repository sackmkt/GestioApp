// Importamos las librerias a la aplicacion por medio de require por usar Node.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // ✅ Ya tienes esta línea
const dotenv = require('dotenv');

const pacientesRoutes = require('./Routes/pacientes');
const obrasSocialesRoutes = require('./Routes/obrasSociales');
const facturasRoutes = require('./Routes/facturas');
const turnosRoutes = require('./Routes/turnos');
const userRoutes = require('./Routes/userRoutes');
const centrosSaludRoutes = require('./Routes/centrosSalud');

// Cargamos las variables de entorno desde el archivo .env
dotenv.config();

//Se crea la instancia de la aplicacion, para que todos los endpoint se puedan definir
const app = express();

//Definimos el puerto para que se ejecute el servidor
const PORT = process.env.PORT || 5000;

// Configuración de CORS para permitir la conexión desde el frontend de Render
const corsOptions = {
  origin: 'https://gestioapp-front.onrender.com', // 🎯 URL de tu frontend en Render
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions)); // ✅ Reemplaza app.use(cors()) con esta línea

app.use(express.json());

//conexion directa con la base de datos, que nos la da directamente mongodb atlas cuando se crea el cluster, la cadena.
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado a la base de datos de MongoDB'))
  .catch(err => console.error('Error en la conexion a la base de datos de MongoDB: ', err));

// Usamos las rutas para cada modelo
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/obras-sociales', obrasSocialesRoutes);
app.use('/api/centros-salud', centrosSaludRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/users', userRoutes);

// Es un endpoint. Para las peticiones al servidor, las realice. 
app.get('/', (req, res) => {
  res.send('Te saludo desde el backend! El servidor esta funcionando.');
});

// enciende el servidor y lo pone a la espera de las peticiones. 
app.listen(PORT, () => {
  console.log(`Servidor escuchando el puerto ${PORT}`);
});
