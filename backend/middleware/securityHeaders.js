const DEFAULT_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
};

module.exports = (req, res, next) => {
  Object.entries(DEFAULT_HEADERS).forEach(([header, value]) => {
    if (!res.getHeader(header)) {
      res.setHeader(header, value);
    }
  });
  next();
};
