const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const activityLogger = require('./middleware/activityLogger');
const { protect } = require('./middleware/authMiddleware');

const pacientesRoutes = require('./Routes/pacientes');
const obrasSocialesRoutes = require('./Routes/obrasSociales');
const facturasRoutes = require('./Routes/facturas');
const turnosRoutes = require('./Routes/turnos');
const userRoutes = require('./Routes/userRoutes');
const centrosSaludRoutes = require('./Routes/centrosSalud');

dotenv.config();

const app = express();

const resolveAllowedOrigins = () => {
  const envValue = process.env.ALLOWED_ORIGINS;
  if (!envValue) {
    return [];
  }
  return envValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

const allowedOrigins = resolveAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(activityLogger);

app.use('/api/pacientes', pacientesRoutes);
app.use('/api/obras-sociales', obrasSocialesRoutes);
app.use('/api/centros-salud', centrosSaludRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
  res.send('Te saludo desde el backend! El servidor esta funcionando.');
});

if (process.env.NODE_ENV === 'test') {
  const testRouter = express.Router();

  testRouter.get('/protected', protect, (req, res) => {
    res.json({ message: 'ok' });
  });

  app.use('/__test__', testRouter);
}

module.exports = { app, allowedOrigins };
