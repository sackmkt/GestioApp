process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  requestPasswordReset,
  resetPassword,
  changePassword,
} = require('../controllers/userController');
const User = require('../models/User');

const originalFindOne = User.findOne;
const originalFindById = User.findById;
const originalRandomBytes = crypto.randomBytes;

const createMockRes = () => {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
};

beforeEach(() => {
  User.findOne = originalFindOne;
  User.findById = originalFindById;
  crypto.randomBytes = originalRandomBytes;
});

afterEach(() => {
  User.findOne = originalFindOne;
  User.findById = originalFindById;
  crypto.randomBytes = originalRandomBytes;
});

test('requestPasswordReset rechaza peticiones sin correo', async () => {
  const req = { body: {} };
  const res = createMockRes();

  await requestPasswordReset(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'El correo electrónico es obligatorio.');
});

test('requestPasswordReset genera token para usuarios válidos', async () => {
  const user = {
    email: 'demo@example.com',
    passwordResetToken: null,
    passwordResetExpires: null,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
  };

  crypto.randomBytes = () => Buffer.from('fixed-token-value-fixed-token-value');
  User.findOne = async () => user;

  let loggedMessage = '';
  const originalConsoleInfo = console.info;
  console.info = (message) => {
    loggedMessage = message;
  };

  const req = { body: { email: 'Demo@Example.com ' } };
  const res = createMockRes();

  try {
    await requestPasswordReset(req, res);
  } finally {
    console.info = originalConsoleInfo;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(
    res.body.message,
    'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
  );
  assert.ok(typeof user.passwordResetToken === 'string');
  assert.equal(user.passwordResetToken.length, 64);
  assert.ok(user.passwordResetExpires instanceof Date);
  assert.equal(user.saveCalls, 1);
  assert.match(loggedMessage, /Solicitud de restablecimiento de contraseña/);
});

test('resetPassword valida token y fecha de expiración', async () => {
  const requestToken = 'token-publico';
  const hashedToken = crypto.createHash('sha256').update(requestToken).digest('hex');

  const user = {
    passwordResetToken: hashedToken,
    passwordResetExpires: new Date(Date.now() + 1000),
    password: 'old',
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
  };

  User.findOne = async (criteria) => {
    if (criteria.passwordResetToken === hashedToken) {
      return user;
    }
    return null;
  };

  const req = { body: { token: requestToken, password: 'nueva-contraseña' } };
  const res = createMockRes();

  await resetPassword(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'La contraseña se restableció correctamente.');
  assert.equal(user.password, 'nueva-contraseña');
  assert.equal(user.passwordResetToken, undefined);
  assert.equal(user.passwordResetExpires, undefined);
  assert.equal(user.saveCalls, 1);
});

test('changePassword requiere contraseña actual válida', async () => {
  const user = {
    _id: 'user-id',
    async matchPassword(value) {
      return value === 'correcta';
    },
    async save() {
      this.saved = true;
    },
    password: 'original',
  };

  User.findById = async () => user;

  const req = { body: { currentPassword: 'incorrecta', newPassword: 'nueva' }, user: { _id: 'user-id' } };
  const res = createMockRes();

  await changePassword(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'La contraseña actual no es correcta.');
});

test('changePassword actualiza la contraseña con credenciales válidas', async () => {
  const user = {
    _id: 'user-id',
    async matchPassword(value) {
      return value === 'actual';
    },
    async save() {
      this.saved = true;
    },
    password: 'original',
  };

  User.findById = async () => user;

  const req = { body: { currentPassword: 'actual', newPassword: 'nueva' }, user: { _id: 'user-id' } };
  const res = createMockRes();

  await changePassword(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Contraseña actualizada correctamente.');
  assert.equal(user.password, 'nueva');
  assert.equal(user.passwordResetToken, undefined);
  assert.equal(user.passwordResetExpires, undefined);
  assert.equal(user.saved, true);
});
