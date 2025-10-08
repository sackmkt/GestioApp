const METHODS_TO_LOG = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

module.exports = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    if (!METHODS_TO_LOG.has(req.method)) {
      return;
    }

    const duration = Date.now() - startTime;
    const userId = req.user?._id ? req.user._id.toString() : 'anónimo';
    const role = req.user?.role || 'sin-rol';
    const message = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} | usuario=${userId} rol=${role} status=${res.statusCode} ${duration}ms`;

    const RED = '\u001b[31m';
    const YELLOW = '\u001b[33m';
    const CYAN = '\u001b[36m';
    const RESET = '\u001b[0m';

    if (res.statusCode >= 500) {
      console.error(`${RED}${message}${RESET}`);
    } else if (res.statusCode >= 400) {
      console.warn(`${YELLOW}${message}${RESET}`);
    } else {
      console.info(`${CYAN}${message}${RESET}`);
    }
  });

  next();
};
