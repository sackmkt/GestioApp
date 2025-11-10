process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

let app;
let server;
let baseUrl;

const startServer = async () => {
  ({ app } = require('../app'));

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
};

const stopServer = async () => {
  if (!server) {
    return;
  }
  await new Promise((resolve) => {
    server.close(resolve);
  });
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  const data = await response.json();
  return { response, data };
};

const getMetricsSnapshot = async () => {
  const { response, data } = await fetchJson(`${baseUrl}/__test__/metrics`);
  assert.equal(response.status, 200);
  return data;
};

test.before(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
});

test('tracks request metrics and exposes request identifiers', async () => {
  const before = await getMetricsSnapshot();

  const apiResponse = await fetch(`${baseUrl}/api/unknown`);
  assert.notEqual(apiResponse.status, 500);
  const requestId = apiResponse.headers.get('x-request-id');
  assert.ok(requestId, 'response should include a request identifier');

  const after = await getMetricsSnapshot();

  assert.ok(
    after.totalRequests >= before.totalRequests + 2,
    'total requests should include API and metrics calls',
  );

  assert.ok(after.completedRequests >= before.completedRequests + 2);
  assert.ok(after.activeRequests <= 1, 'only the metrics request should remain active');
  assert.ok(after.peakActiveRequests >= 1);

  const before4xx = before.statusCounts?.['4xx'] ?? 0;
  const after4xx = after.statusCounts?.['4xx'] ?? 0;
  assert.ok(after4xx >= before4xx + 1, '404 request should be tracked');

  if (after.completedRequests > 0) {
    assert.ok(after.averageResponseTimeMs >= 0);
  }
});
