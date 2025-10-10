const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(__dirname, '../../frontend/dist');
const indexPath = path.join(distDir, 'index.html');

let originalIndexContent;
let app;
let server;
let baseUrl;

test.before(async () => {
  if (fs.existsSync(indexPath)) {
    originalIndexContent = fs.readFileSync(indexPath);
  } else {
    fs.mkdirSync(distDir, { recursive: true });
  }

  fs.writeFileSync(indexPath, '<!doctype html><html><body>test</body></html>');

  ({ app } = require('../app'));

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (server) {
    server.close();
  }

  if (originalIndexContent) {
    fs.writeFileSync(indexPath, originalIndexContent);
  } else if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
    const remainingFiles = fs.readdirSync(distDir);
    if (remainingFiles.length === 0) {
      fs.rmdirSync(distDir);
    }
  }
});

test('serves the frontend for non-API GET requests', async () => {
  const response = await fetch(`${baseUrl}/some/protected/route`, {
    headers: { Accept: 'text/html' },
  });

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /<!doctype html>/i);
});

test('does not hijack API requests', async () => {
  const response = await fetch(`${baseUrl}/api/unknown`, {
    headers: { Accept: 'text/html' },
  });

  assert.notEqual(response.status, 200);
});
