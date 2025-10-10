const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const activityLogger = require('./middleware/activityLogger');
const { protect } = require('./middleware/authMiddleware');
const securityHeaders = require('./middleware/securityHeaders');
const sanitizeRequest = require('./middleware/sanitizeRequest');
const rateLimiter = require('./middleware/rateLimiter');

const pacientesRoutes = require('./Routes/pacientes');
const obrasSocialesRoutes = require('./Routes/obrasSociales');
const facturasRoutes = require('./Routes/facturas');
const turnosRoutes = require('./Routes/turnos');
const userRoutes = require('./Routes/userRoutes');
const centrosSaludRoutes = require('./Routes/centrosSalud');

dotenv.config();

const app = express();

app.disable('x-powered-by');

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
app.use(securityHeaders);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(sanitizeRequest);
app.use(activityLogger);
app.use('/api', rateLimiter);

app.use('/api/pacientes', pacientesRoutes);
app.use('/api/obras-sociales', obrasSocialesRoutes);
app.use('/api/centros-salud', centrosSaludRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/users', userRoutes);

const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const shouldServeFrontend = fs.existsSync(frontendIndexPath);

if (shouldServeFrontend) {
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (req.path.startsWith('/api') || req.path.startsWith('/__test__')) {
      return next();
    }

    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

    if (!acceptsHtml) {
      return next();
    }

    if (path.extname(req.path)) {
      return next();
    }

    return res.sendFile(frontendIndexPath);
  });
} else {
  app.get('/', (req, res) => {
    res.send('Te saludo desde el backend! El servidor esta funcionando.');
  });
}

if (process.env.NODE_ENV === 'test') {
  const testRouter = express.Router();

  testRouter.get('/protected', protect, (req, res) => {
    res.json({ message: 'ok' });
  });

  app.use('/__test__', testRouter);
}

module.exports = { app, allowedOrigins };
