const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const emailService = require('../services/emailService');

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_LOGIN_ATTEMPTS = toPositiveNumber(process.env.MAX_LOGIN_ATTEMPTS, 5);
const LOGIN_ATTEMPT_WINDOW_MINUTES = toPositiveNumber(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES, 15);
const LOGIN_LOCK_TIME_MINUTES = toPositiveNumber(process.env.LOGIN_LOCK_TIME_MINUTES, 15);
const LOGIN_ATTEMPT_CLEANUP_INTERVAL_MINUTES = toPositiveNumber(
  process.env.LOGIN_ATTEMPT_CLEANUP_INTERVAL_MINUTES,
  5,
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const LOGIN_ATTEMPTS = new Map();
let lastLoginAttemptCleanup = 0;

const cleanupLoginAttempts = (now = Date.now()) => {
  const cleanupIntervalMs = LOGIN_ATTEMPT_CLEANUP_INTERVAL_MINUTES * 60 * 1000;

  if (now - lastLoginAttemptCleanup < cleanupIntervalMs) {
    return;
  }

  lastLoginAttemptCleanup = now;
  const windowMs = LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000;

  for (const [key, attempt] of LOGIN_ATTEMPTS.entries()) {
    const lockExpired = attempt.lockUntil && attempt.lockUntil <= now;
    const windowExpired = !attempt.lockUntil && attempt.firstAttempt + windowMs <= now;

    if (lockExpired || windowExpired) {
      LOGIN_ATTEMPTS.delete(key);
    }
  }
};

const toLoginAttemptKey = (username = '') => username.trim().toLowerCase();

const getLockMessage = (lockUntil, now = Date.now()) => {
  const remainingMs = Math.max(0, lockUntil - now);
  const remainingMinutes = Math.ceil(remainingMs / 60000) || 1;
  const suffix = remainingMinutes === 1 ? '' : 's';
  return `Demasiados intentos fallidos. Inténtalo nuevamente en ${remainingMinutes} minuto${suffix}.`;
};

const sendLockResponse = (res, lockUntil) => {
  const now = Date.now();
  const remainingMs = Math.max(0, lockUntil - now);
  const retryAfterSeconds = Math.ceil(remainingMs / 1000) || 1;
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(423).json({ message: getLockMessage(lockUntil, now) });
};

const registerFailedLoginAttempt = (key) => {
  const now = Date.now();
  const windowMs = LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000;
  const lockTimeMs = LOGIN_LOCK_TIME_MINUTES * 60 * 1000;

  const attempt = LOGIN_ATTEMPTS.get(key);

  if (!attempt) {
    const freshAttempt = { count: 1, firstAttempt: now };
    LOGIN_ATTEMPTS.set(key, freshAttempt);
    return freshAttempt;
  }

  if (attempt.lockUntil && attempt.lockUntil <= now) {
    const freshAttempt = { count: 1, firstAttempt: now };
    LOGIN_ATTEMPTS.set(key, freshAttempt);
    return freshAttempt;
  }

  if (!attempt.lockUntil && attempt.firstAttempt + windowMs < now) {
    const freshAttempt = { count: 1, firstAttempt: now };
    LOGIN_ATTEMPTS.set(key, freshAttempt);
    return freshAttempt;
  }

  const updatedAttempt = {
    count: (attempt.count || 0) + 1,
    firstAttempt: attempt.firstAttempt,
  };

  if (updatedAttempt.count >= MAX_LOGIN_ATTEMPTS) {
    updatedAttempt.lockUntil = now + lockTimeMs;
  } else {
    updatedAttempt.lockUntil = undefined;
  }

  LOGIN_ATTEMPTS.set(key, updatedAttempt);
  return updatedAttempt;
};

const resetLoginAttempts = (key) => {
  LOGIN_ATTEMPTS.delete(key);
};

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
};

const MAX_PROFILE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const ALLOWED_AVATAR_IDS = new Set(['stethoscope', 'heartbeat', 'medkit', 'compass']);
const ALLOWED_DASHBOARD_WIDGETS = new Set([
  'summaryHighlights',
  'dateRange',
  'financialSummary',
  'collectionsOverview',
  'administrativeMetrics',
  'collectionsHealth',
  'centersSummary',
  'agendaToday',
  'turnosTomorrow',
  'turnosUpcoming',
  'growth',
  'monthlyRevenue',
  'statusDistribution',
  'topObrasSociales',
  'moraObrasSociales',
]);

const isSupportedDataUrl = (value = '') => {
  if (typeof value !== 'string') {
    return false;
  }
  const [metadata] = value.split(',', 1);
  if (!metadata?.startsWith('data:')) {
    return false;
  }
  const mimeType = metadata.slice(5, metadata.indexOf(';'));
  return ALLOWED_IMAGE_MIME_TYPES.has(mimeType);
};

const getDataUrlSize = (value = '') => {
  if (typeof value !== 'string') {
    return 0;
  }
  const base64Part = value.split(',')[1];
  if (!base64Part) {
    return 0;
  }
  const padding = (base64Part.match(/=/g) || []).length;
  return Math.ceil((base64Part.length * 3) / 4) - padding;
};

const sanitizeDashboardPreferences = (preferences) => {
  if (!Array.isArray(preferences)) {
    return null;
  }

  const unique = [];

  preferences.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const trimmed = item.trim();
    if (!trimmed || !ALLOWED_DASHBOARD_WIDGETS.has(trimmed)) {
      return;
    }
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  });

  return unique;
};

const buildUserResponse = (user, includeToken = true) => {
  const base = {
    _id: user._id,
    username: user.username,
    email: user.email,
    authProvider: user.authProvider || 'local',
    googleId: user.googleId || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    profession: user.profession || '',
    country: user.country || '',
    province: user.province || '',
    city: user.city || '',
    profileCompleted: user.profileCompleted || false,
    profileImage: user.profileImage || '',
    profileAvatar: user.profileAvatar || '',
    dashboardPreferences: Array.isArray(user.dashboardPreferences) ? [...user.dashboardPreferences] : [],
  };

  if (!includeToken) {
    return base;
  }

  return {
    ...base,
    token: generateToken(user._id),
  };
};

const createResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashed };
};

const toUsernameCandidate = (email = '') => {
  if (typeof email !== 'string') {
    return '';
  }
  const [localPart] = email.split('@');
  const sanitized = (localPart || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/gi, '')
    .replace(/\.+/g, '.');
  return sanitized || `user${Date.now()}`;
};

const findAvailableUsername = async (baseCandidate) => {
  let candidate = baseCandidate;
  let suffix = 0;

  while (await User.exists({ username: candidate })) {
    suffix += 1;
    candidate = `${baseCandidate}${suffix}`;
    if (suffix > 1000) {
      const randomSuffix = crypto.randomBytes(2).toString('hex');
      candidate = `${baseCandidate}${randomSuffix}`;
      break;
    }
  }

  return candidate;
};

const requestGoogleTokenInfo = (idToken) => {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;

    const req = https.get(url, (res) => {
      const { statusCode } = res;
      let rawData = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);

          if (statusCode !== 200) {
            const error = new Error(parsedData.error_description || 'Fallo al verificar el token.');
            error.statusCode = statusCode;
            return reject(error);
          }

          resolve(parsedData);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy(new Error('Tiempo de espera agotado al verificar el token de Google.'));
    });
  });
};

const verifyGoogleIdToken = async (idToken) => {
  const tokenInfo = await requestGoogleTokenInfo(idToken);

  if (!tokenInfo || typeof tokenInfo !== 'object') {
    throw new Error('Respuesta inválida al verificar el token de Google.');
  }

  if (GOOGLE_CLIENT_ID && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
    const error = new Error('El token de Google no corresponde al cliente configurado.');
    error.statusCode = 401;
    throw error;
  }

  if (tokenInfo.expires_in && Number(tokenInfo.expires_in) <= 0) {
    const error = new Error('El token de Google expiró.');
    error.statusCode = 401;
    throw error;
  }

  if (tokenInfo.email_verified !== 'true' && tokenInfo.email_verified !== true) {
    const error = new Error('El correo electrónico de Google no está verificado.');
    error.statusCode = 401;
    throw error;
  }

  return tokenInfo;
};

exports.registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Usuario, correo y contraseña son obligatorios' });
  }

  try {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({ username: normalizedUsername });
    if (userExists) {
      return res.status(400).json({ message: 'El nombre de usuario ya existe' });
    }

    const emailExists = await User.findOne({ email: normalizedEmail });
    if (emailExists) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      authProvider: 'local',
    });

    const createdUser = await User.findById(user._id).select('-password');
    res.status(201).json(buildUserResponse(createdUser));
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.googleAuth = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'El token de Google es obligatorio.' });
  }

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: 'La autenticación con Google no está configurada.' });
  }

  try {
    const payload = await verifyGoogleIdToken(idToken);

    const { sub: googleId, email, given_name: givenName, family_name: familyName, picture } = payload;

    if (!email) {
      return res
        .status(400)
        .json({ message: 'No se pudo obtener el correo electrónico de la cuenta de Google.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }],
    });

    if (!user) {
      const baseUsername = toUsernameCandidate(normalizedEmail);
      const uniqueUsername = await findAvailableUsername(baseUsername);

      user = new User({
        username: uniqueUsername,
        email: normalizedEmail,
        password: crypto.randomBytes(32).toString('hex'),
        authProvider: 'google',
        googleId,
        firstName: typeof givenName === 'string' ? givenName : '',
        lastName: typeof familyName === 'string' ? familyName : '',
        profileImage: typeof picture === 'string' ? picture : '',
      });

      await user.save();
    } else {
      let shouldSave = false;

      if (!user.googleId && googleId) {
        user.googleId = googleId;
        shouldSave = true;
      }

      if (user.authProvider !== 'google') {
        user.authProvider = 'google';
        shouldSave = true;
      }

      if (!user.firstName && typeof givenName === 'string') {
        user.firstName = givenName;
        shouldSave = true;
      }

      if (!user.lastName && typeof familyName === 'string') {
        user.lastName = familyName;
        shouldSave = true;
      }

      if (!user.profileImage && typeof picture === 'string') {
        user.profileImage = picture;
        shouldSave = true;
      }

      if (shouldSave) {
        await user.save();
      }
    }

    const sanitizedUser = await User.findById(user._id).select('-password');
    res.json(buildUserResponse(sanitizedUser));
  } catch (error) {
    const status = error.statusCode || 401;
    res.status(status).json({ message: error.message || 'El token de Google no es válido.' });
  }
};

exports.loginUser = async (req, res) => {
  const { username, password } = req.body;

  const sanitizedUsername = typeof username === 'string' ? username.trim() : '';

  if (!sanitizedUsername || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
  }

  cleanupLoginAttempts();

  const key = toLoginAttemptKey(sanitizedUsername);
  const attempt = LOGIN_ATTEMPTS.get(key);
  const windowMs = LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000;

  if (attempt?.lockUntil && attempt.lockUntil > Date.now()) {
    return sendLockResponse(res, attempt.lockUntil);
  }

  if (attempt?.lockUntil && attempt.lockUntil <= Date.now()) {
    resetLoginAttempts(key);
  } else if (attempt && !attempt.lockUntil && attempt.firstAttempt + windowMs < Date.now()) {
    resetLoginAttempts(key);
  }

  try {
    const user = await User.findOne({ username: sanitizedUsername });

    if (user && (await user.matchPassword(password))) {
      resetLoginAttempts(key);
      const sanitizedUser = await User.findById(user._id).select('-password');
      res.json(buildUserResponse(sanitizedUser));
    } else {
      const updatedAttempt = registerFailedLoginAttempt(key);

      if (updatedAttempt.lockUntil && updatedAttempt.lockUntil > Date.now()) {
        return sendLockResponse(res, updatedAttempt.lockUntil);
      }

      res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(buildUserResponse(user, false));
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.updateProfile = async (req, res) => {
  const {
    username,
    email,
    firstName,
    lastName,
    profession,
    country,
    province,
    city,
    profileImage,
    profileAvatar,
    dashboardPreferences: dashboardPreferencesInput,
  } = req.body;

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (username && username.trim() !== user.username) {
      const sanitizedUsername = username.trim();
      const usernameTaken = await User.findOne({ username: sanitizedUsername });
      if (usernameTaken) {
        return res.status(400).json({ message: 'El nombre de usuario ya existe' });
      }
      user.username = sanitizedUsername;
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const normalizedEmail = email.toLowerCase().trim();
      const emailTaken = await User.findOne({ email: normalizedEmail });
      if (emailTaken) {
        return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
      }
      user.email = normalizedEmail;
    }

    if (typeof firstName !== 'undefined') user.firstName = (firstName || '').trim();
    if (typeof lastName !== 'undefined') user.lastName = (lastName || '').trim();
    if (typeof profession !== 'undefined') user.profession = (profession || '').trim();
    if (typeof country !== 'undefined') user.country = (country || '').trim();
    if (typeof province !== 'undefined') user.province = (province || '').trim();
    if (typeof city !== 'undefined') user.city = (city || '').trim();

    if (typeof profileAvatar !== 'undefined') {
      if (profileAvatar === null || profileAvatar === '') {
        user.profileAvatar = '';
      } else if (ALLOWED_AVATAR_IDS.has(profileAvatar)) {
        user.profileAvatar = profileAvatar;
      } else {
        return res.status(400).json({ message: 'El avatar seleccionado no es válido.' });
      }
    }

    if (typeof profileImage !== 'undefined') {
      if (profileImage === null || profileImage === '') {
        user.profileImage = '';
      } else if (!isSupportedDataUrl(profileImage)) {
        return res.status(400).json({ message: 'El formato de imagen no está soportado.' });
      } else if (getDataUrlSize(profileImage) > MAX_PROFILE_IMAGE_SIZE_BYTES) {
        return res.status(400).json({ message: 'La imagen de perfil supera el límite de 2 MB.' });
      } else {
        user.profileImage = profileImage;
      }
    }

    if (user.profileImage) {
      user.profileAvatar = '';
    }

    if (typeof dashboardPreferencesInput !== 'undefined') {
      if (dashboardPreferencesInput === null) {
        user.dashboardPreferences = [];
      } else {
        const sanitizedPreferences = sanitizeDashboardPreferences(dashboardPreferencesInput);
        if (sanitizedPreferences === null) {
          return res.status(400).json({ message: 'Las preferencias del panel deben ser un listado válido.' });
        }
        user.dashboardPreferences = sanitizedPreferences;
      }
    }

    const mandatoryFields = [user.firstName, user.lastName, user.profession, user.country, user.province, user.city];
    user.profileCompleted = mandatoryFields.every((field) => field && field.trim() !== '');

    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    res.json(buildUserResponse(updatedUser));
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'El correo electrónico es obligatorio.' });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const { token, hashed } = createResetToken();
      user.passwordResetToken = hashed;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      try {
        await emailService.sendPasswordResetEmail({ to: user.email, token });
        console.info(
          `Solicitud de restablecimiento de contraseña procesada para ${user.email}. Se envió un correo de restablecimiento.`,
        );
      } catch (emailError) {
        console.error(
          `No se pudo enviar el correo de restablecimiento de contraseña para ${user.email}.`,
          emailError,
        );
      }
    }

    res.json({
      message:
        'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token y nueva contraseña son obligatorios.' });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'El token de restablecimiento no es válido o expiró.' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'La contraseña se restableció correctamente.' });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: 'La contraseña actual y la nueva contraseña son obligatorias.' });
  }

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta.' });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};
