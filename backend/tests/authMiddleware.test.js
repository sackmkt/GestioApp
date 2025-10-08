process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const User = require('../models/User');

let server;
let baseUrl;
const originalFindById = User.findById;

const startServer = () => new Promise((resolve) => {
  const instance = http.createServer(app);
  instance.listen(0, () => {
    const { port } = instance.address();
    resolve({ instance, url: `http://127.0.0.1:${port}` });
  });
});

const stubUser = (user) => {
  User.findById = () => ({
    select: async () => user,
  });
};

const restoreUser = () => {
  User.findById = originalFindById;
};

before(async () => {
  const started = await startServer();
  server = started.instance;
  baseUrl = started.url;
});

after(async () => {
  restoreUser();
  await new Promise((resolve) => server.close(resolve));
});

test('rechaza el acceso cuando no se envía token', async () => {
  const response = await fetch(`${baseUrl}/__test__/protected`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.message, 'No autorizado, no hay token');
});

test('rechaza peticiones con token inválido', async () => {
  const response = await fetch(`${baseUrl}/__test__/protected`, {
    headers: {
      Authorization: 'Bearer token-invalido',
    },
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.message, 'No autorizado, token inválido');
});

test('bloquea acciones restringidas para asistentes', async () => {
  stubUser({ _id: 'assistant', role: 'assistant' });
  const token = jwt.sign({ id: 'assistant' }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const response = await fetch(`${baseUrl}/__test__/restricted`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.message, 'No cuentas con permisos para realizar esta acción');
  restoreUser();
});

test('permite acciones restringidas para profesionales', async () => {
  stubUser({ _id: 'pro-user', role: 'professional' });
  const token = jwt.sign({ id: 'pro-user' }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const response = await fetch(`${baseUrl}/__test__/restricted`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.message, 'authorized');
  restoreUser();
});
