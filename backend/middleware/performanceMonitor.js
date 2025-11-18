const { randomUUID } = require('node:crypto');
const requestMetrics = require('../utils/requestMetrics');

const formatMs = (value) => Math.round(value * 10) / 10;

module.exports = (req, res, next) => {
  const context = requestMetrics.startRequest();
  const requestId = randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = requestMetrics.finishRequest(context, res);

    if (durationMs >= requestMetrics.slowRequestThresholdMs) {
      const message = `Solicitud lenta ${req.method} ${req.originalUrl} - ${formatMs(durationMs)}ms status=${res.statusCode} requestId=${requestId}`;
      console.warn(`[performance] ${message}`);
    }
  });

  res.on('close', () => {
    requestMetrics.abandonRequest(context);
  });

  next();
};
