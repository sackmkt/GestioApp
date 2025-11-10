const { performance } = require('node:perf_hooks');

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

class RequestMetrics {
  constructor() {
    this.slowRequestThresholdMs = toPositiveInteger(
      process.env.SLOW_REQUEST_THRESHOLD_MS,
      1200,
    );
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.completedRequests = 0;
    this.totalResponseTimeMs = 0;
    this.longestRequestMs = 0;
    this.slowRequests = 0;
    this.activeRequests = 0;
    this.peakActiveRequests = 0;
    this.statusCounts = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    };
  }

  startRequest() {
    this.totalRequests += 1;
    this.activeRequests += 1;
    if (this.activeRequests > this.peakActiveRequests) {
      this.peakActiveRequests = this.activeRequests;
    }

    return {
      startTime: performance.now(),
    };
  }

  finishRequest(context, res) {
    if (!context || typeof context.startTime !== 'number') {
      return 0;
    }

    const durationMs = performance.now() - context.startTime;
    this.completedRequests += 1;
    this.totalResponseTimeMs += durationMs;
    this.longestRequestMs = Math.max(this.longestRequestMs, durationMs);

    if (durationMs >= this.slowRequestThresholdMs) {
      this.slowRequests += 1;
    }

    const statusCode = Number.parseInt(res.statusCode, 10);
    const statusFamily = Number.isFinite(statusCode) ? `${Math.floor(statusCode / 100)}xx` : 'unknown';
    if (!this.statusCounts[statusFamily]) {
      this.statusCounts[statusFamily] = 0;
    }
    this.statusCounts[statusFamily] += 1;

    this.activeRequests = Math.max(0, this.activeRequests - 1);

    return durationMs;
  }

  getSnapshot() {
    const averageResponseTimeMs =
      this.completedRequests === 0 ? 0 : this.totalResponseTimeMs / this.completedRequests;

    return {
      timestamp: new Date().toISOString(),
      slowRequestThresholdMs: this.slowRequestThresholdMs,
      totalRequests: this.totalRequests,
      completedRequests: this.completedRequests,
      activeRequests: this.activeRequests,
      peakActiveRequests: this.peakActiveRequests,
      averageResponseTimeMs,
      longestRequestMs: this.longestRequestMs,
      slowRequests: this.slowRequests,
      statusCounts: { ...this.statusCounts },
    };
  }

  configure({ slowRequestThresholdMs } = {}) {
    if (slowRequestThresholdMs) {
      const parsed = toPositiveInteger(slowRequestThresholdMs, this.slowRequestThresholdMs);
      this.slowRequestThresholdMs = parsed;
    }
  }
}

module.exports = new RequestMetrics();
