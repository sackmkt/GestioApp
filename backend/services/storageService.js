const mongoose = require('mongoose');
const { Readable } = require('stream');

const getBucket = () => {
  const connection = mongoose.connection;
  if (!connection || connection.readyState !== 1) {
    throw new Error('No hay conexión activa con la base de datos.');
  }
  return new mongoose.mongo.GridFSBucket(connection.db, {
    bucketName: process.env.DOCUMENTS_BUCKET || 'gestio-uploads',
  });
};

const bufferToStream = (buffer) => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

exports.saveDocument = async ({ buffer, filename, mimeType }) => {
  const bucket = getBucket();

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: mimeType,
    });

    uploadStream.once('finish', () => {
      resolve({
        storageKey: uploadStream.id.toString(),
        length: uploadStream.length,
      });
    });

    uploadStream.once('error', reject);

    bufferToStream(buffer).pipe(uploadStream);
  });
};

exports.deleteDocument = async (storageKey) => {
  if (!storageKey || !mongoose.Types.ObjectId.isValid(storageKey)) {
    return;
  }

  try {
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(storageKey));
  } catch (error) {
    if (error.code !== 26 && error.code !== 'ENOENT') {
      throw error;
    }
  }
};

exports.getDownloadStream = (storageKey) => {
  if (!storageKey || !mongoose.Types.ObjectId.isValid(storageKey)) {
    throw new Error('Identificador de archivo inválido.');
  }
  const bucket = getBucket();
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(storageKey));
};
