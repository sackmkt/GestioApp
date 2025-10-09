const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_REQUESTS = 200;

const requestLog = new Map();

const cleanOldEntries = () => {
  const now = Date.now();
  requestLog.forEach((value, key) => {
    if (now - value.startTime > WINDOW_MS) {
      requestLog.delete(key);
    }
  });
};

setInterval(cleanOldEntries, WINDOW_MS).unref();

const resolveClientIdentifier = (req) => {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    'unknown'
  );
};

module.exports = (req, res, next) => {
  const identifier = resolveClientIdentifier(req);
  const now = Date.now();
  const entry = requestLog.get(identifier);

  if (!entry || now - entry.startTime > WINDOW_MS) {
    requestLog.set(identifier, { count: 1, startTime: now });
  } else {
    entry.count += 1;
    requestLog.set(identifier, entry);
  }

  const updatedEntry = requestLog.get(identifier);
  const remaining = Math.max(MAX_REQUESTS - updatedEntry.count, 0);

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (updatedEntry.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil(WINDOW_MS / 1000));
    return res.status(429).json({
      message: 'Demasiadas solicitudes desde esta dirección IP. Intenta nuevamente en unos minutos.',
    });
  }

  next();
};
