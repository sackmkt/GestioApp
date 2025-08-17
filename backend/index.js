// Importamos las librerias a la aplicacion por medio de require por usar Node.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv'); // Nuevo: Importa dotenv

const pacientesRoutes = require('./Routes/pacientes');
const obrasSocialesRoutes = require('./Routes/obrasSociales');
const facturasRoutes = require('./Routes/facturas');
const userRoutes = require('./Routes/userRoutes'); // Nuevo: Importamos las rutas de usuario

// Cargamos las variables de entorno desde el archivo .env
dotenv.config();

//Se crea la instancia de la aplicacion, para que todos los endpoint se puedan definir
const app = express();

//Definimos el puerto para que se ejecute el servidor
const PORT = process.env.PORT || 5000; // Nuevo: Usa la variable de entorno, si existe

//middlewares. para que se ejecuten las peticiones
app.use(cors());
app.use(express.json());

//conexion directa con la base de datos, que nos la da directamente mongodb atlas cuando se crea el cluster, la cadena.
const MONGO_URI = process.env.MONGO_URI; // Nuevo: Usa la variable de entorno

mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado a la base de datos de MongoDB'))
  .catch(err => console.error('Error en la conexion a la base de datos de MongoDB: ', err));

// Usamos las rutas para cada modelo
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/obras-sociales', obrasSocialesRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/users', userRoutes); // Nuevo: Usamos las rutas de usuario

// Es un endpoint. Para las peticiones al servidor, las realice. 
app.get('/', (req, res) => {
  res.send('Te saludo desde el backend! El servidor esta funcionando.');
});

// enciende el servidor y lo pone a la espera de las peticiones. 
app.listen(PORT, () => {
  // Corregido: Uso de template literals con backticks (``)
  console.log(`Servidor escuchando el puerto ${PORT}`);
});
