const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');

const STORAGE_FOLDER = path.join(__dirname, '..', 'uploads');

const s3Config = {
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
};

const S3_ENABLED = Boolean(
  s3Config.bucket && s3Config.region && s3Config.accessKeyId && s3Config.secretAccessKey,
);

const ensureDirectory = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const sanitizeFilename = (filename) => {
  if (!filename) {
    return 'archivo';
  }
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-_/]/g, '_');
};

const encodeRfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const encodeKeyForUri = (key) => key
  .split('/')
  .map((segment) => encodeRfc3986(segment))
  .join('/');

const toAmzDate = (date = new Date()) => {
  const pad = (num, size = 2) => num.toString().padStart(size, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

const hashHex = (value) => crypto.createHash('sha256').update(value).digest('hex');

const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();

const hmacHex = (key, value) => crypto.createHmac('sha256', key).update(value).digest('hex');

const getSignatureKey = (secretAccessKey, dateStamp, region, service) => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const sendS3Request = ({ method, key, body = null, contentType = null }) => new Promise((resolve, reject) => {
  if (!S3_ENABLED) {
    return reject(new Error('El almacenamiento S3 no está configurado.'));
  }

  const amzDate = toAmzDate();
  const dateStamp = amzDate.slice(0, 8);
  const host = `${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com`;
  const canonicalUri = `/${encodeKeyForUri(key)}`;
  const payloadHash = body ? hashHex(body) : 'UNSIGNED-PAYLOAD';

  const headers = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  if (contentType) {
    headers['content-type'] = contentType;
  }

  if (body) {
    headers['content-length'] = Buffer.byteLength(body).toString();
  }

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${headers[name]}`.trim())
    .join('\n');
  const canonicalHeadersWithNewLine = `${canonicalHeaders}\n`;
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeadersWithNewLine,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${s3Config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(
    s3Config.secretAccessKey,
    dateStamp,
    s3Config.region,
    's3',
  );

  const signature = hmacHex(signingKey, stringToSign);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${s3Config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = {
    ...headers,
    Authorization: authorizationHeader,
  };

  const requestOptions = {
    host,
    method,
    path: canonicalUri,
    headers: requestHeaders,
  };

  const request = https.request(requestOptions, (response) => {
    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
      resolve(response);
      return;
    }

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      const message = Buffer.concat(chunks).toString('utf8');
      reject(new Error(`Error al comunicarse con S3 (${response.statusCode}): ${message}`));
    });
  });

  request.on('error', reject);

  if (body) {
    request.write(body);
  }

  request.end();
});

const uploadToS3 = async ({ buffer, key, contentType }) => {
  await sendS3Request({ method: 'PUT', key, body: buffer, contentType });
  return {
    storage: 's3',
    key,
    bucket: s3Config.bucket,
    contentType,
    size: buffer.length,
  };
};

const deleteFromS3 = async (key) => {
  await sendS3Request({ method: 'DELETE', key });
};

const streamFromS3 = async (key) => {
  const response = await sendS3Request({ method: 'GET', key });
  return response;
};

const getS3SignedUrl = ({ key, expiresInSeconds = 300 }) => {
  if (!S3_ENABLED) {
    return null;
  }

  const expires = Math.min(Math.max(expiresInSeconds, 1), 7 * 24 * 60 * 60);
  const amzDate = toAmzDate();
  const dateStamp = amzDate.slice(0, 8);
  const host = `${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com`;
  const canonicalUri = `/${encodeKeyForUri(key)}`;
  const credentialScope = `${dateStamp}/${s3Config.region}/s3/aws4_request`;

  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${s3Config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(queryParams[name])}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(
    s3Config.secretAccessKey,
    dateStamp,
    s3Config.region,
    's3',
  );

  const signature = hmacHex(signingKey, stringToSign);

  const signedQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `https://${host}${canonicalUri}?${signedQuery}`;
};

const saveLocalFile = async ({ buffer, key }) => {
  const absolutePath = path.join(STORAGE_FOLDER, key);
  const directory = path.dirname(absolutePath);
  await ensureDirectory(directory);
  await fs.writeFile(absolutePath, buffer);
  return {
    storage: 'local',
    key,
    bucket: null,
    contentType: null,
    size: buffer.length,
  };
};

const deleteLocalFile = async (key) => {
  const absolutePath = path.join(STORAGE_FOLDER, key);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const streamLocalFile = async (key) => {
  const absolutePath = path.join(STORAGE_FOLDER, key);
  const stats = await fs.stat(absolutePath);
  return {
    stream: createReadStream(absolutePath),
    size: stats.size,
  };
};

const buildKey = ({ folder, originalName }) => {
  const normalizedFolder = folder
    ? folder
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
    : '';

  const uniqueSegment = `${Date.now()}-${crypto.randomUUID()}`;
  const sanitizedName = sanitizeFilename(originalName);
  const finalName = `${uniqueSegment}-${sanitizedName}`;

  return normalizedFolder ? `${normalizedFolder}/${finalName}` : finalName;
};

const uploadDocument = async ({ buffer, originalName, contentType = 'application/octet-stream', folder = '' }) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('El archivo recibido no es válido.');
  }

  const key = buildKey({ folder, originalName });
  if (S3_ENABLED) {
    return uploadToS3({ buffer, key, contentType });
  }
  return saveLocalFile({ buffer, key });
};

const deleteDocument = async ({ storage, key }) => {
  if (storage === 's3' && S3_ENABLED) {
    await deleteFromS3(key);
    return;
  }

  await deleteLocalFile(key);
};

const getDocumentStream = async ({ storage, key }) => {
  if (storage === 's3' && S3_ENABLED) {
    const response = await streamFromS3(key);
    return {
      stream: response,
      size: Number(response.headers['content-length']) || undefined,
      contentType: response.headers['content-type'] || undefined,
    };
  }

  const local = await streamLocalFile(key);
  return {
    stream: local.stream,
    size: local.size,
  };
};

const getTemporaryUrl = ({ storage, key, expiresInSeconds = 300 }) => {
  if (storage === 's3' && S3_ENABLED) {
    return getS3SignedUrl({ key, expiresInSeconds });
  }
  return null;
};

module.exports = {
  uploadDocument,
  deleteDocument,
  getDocumentStream,
  getTemporaryUrl,
  S3_ENABLED,
  STORAGE_FOLDER,
};
