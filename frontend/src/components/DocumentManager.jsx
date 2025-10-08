import React, { useEffect, useMemo, useRef, useState } from 'react';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
    } else {
      reject(new Error('No pudimos leer el archivo seleccionado.'));
    }
  };
  reader.onerror = () => reject(new Error('Ocurrió un error al leer el archivo.'));
  reader.readAsDataURL(file);
});

function DocumentManager({
  isOpen,
  onClose,
  title,
  description,
  items = [],
  onUpload,
  onDelete,
  onDownload,
  busy,
}) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setNotes('');
      setError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const itemsSorted = useMemo(() => {
    return [...items].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  }, [items]);

  const handleFileChange = (event) => {
    setError('');
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setError('El archivo supera los 5 MB permitidos.');
      event.target.value = '';
      setSelectedFile(null);
      return;
    }

    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      setError('El tipo de archivo seleccionado no está permitido.');
      event.target.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setError('');

    if (!selectedFile) {
      setError('Seleccioná un archivo para subir.');
      return;
    }

    try {
      setUploading(true);
      const base64Data = await readFileAsDataUrl(selectedFile);
      await onUpload({
        fileName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        base64Data,
        descripcion: notes.trim(),
      });
      setNotes('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (uploadError) {
      setError(uploadError.message || 'No pudimos adjuntar el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (document) => {
    if (!window.confirm('¿Seguro que deseas eliminar este archivo?')) {
      return;
    }
    try {
      setDeletingId(document._id);
      await onDelete(document);
    } catch (deleteError) {
      setError(deleteError.message || 'No pudimos eliminar el archivo.');
    } finally {
      setDeletingId(null);
    }
  };

  const modalClass = `modal fade ${isOpen ? 'show d-block' : ''}`;

  return (
    <div className={modalClass} tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
      <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-1">{title}</h5>
              {description && <p className="text-muted small mb-0">{description}</p>}
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar"></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleUpload} className="border rounded p-3 mb-4 bg-light">
              <div className="row g-3 align-items-end">
                <div className="col-md-5">
                  <label className="form-label fw-semibold">Archivo</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="form-control"
                    onChange={handleFileChange}
                    accept={ALLOWED_TYPES.join(',')}
                    disabled={uploading || busy}
                  />
                  <small className="text-muted d-block mt-1">Hasta 5 MB. Formatos: PDF, PNG, JPG, WebP, DOC.</small>
                </div>
                <div className="col-md-5">
                  <label className="form-label fw-semibold">Descripción (opcional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={120}
                    placeholder="Ej. Informe de estudios"
                    disabled={uploading || busy}
                  />
                </div>
                <div className="col-md-2 d-grid">
                  <button type="submit" className="btn btn-primary" disabled={uploading || busy}>
                    {uploading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Subiendo
                      </>
                    ) : (
                      'Adjuntar'
                    )}
                  </button>
                </div>
              </div>
              {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
            </form>

            <div className="table-responsive">
              <table className="table align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Archivo</th>
                    <th>Tipo</th>
                    <th>Tamaño</th>
                    <th>Subido</th>
                    <th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSorted.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center text-muted py-4">
                        Aún no cargaste archivos para este registro.
                      </td>
                    </tr>
                  ) : (
                    itemsSorted.map((document) => (
                      <tr key={document._id}>
                        <td>
                          <div className="fw-semibold">{document.nombreOriginal}</div>
                          {document.descripcion && <div className="text-muted small">{document.descripcion}</div>}
                        </td>
                        <td>{document.mimeType || '—'}</td>
                        <td>{formatBytes(document.size)}</td>
                        <td>{formatDate(document.uploadedAt)}</td>
                        <td className="text-end">
                          <div className="btn-group btn-group-sm" role="group">
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => onDownload(document)}
                              disabled={busy}
                            >
                              Descargar
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger"
                              onClick={() => handleDelete(document)}
                              disabled={busy || deletingId === document._id}
                            >
                              {deletingId === document._id ? (
                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                              ) : (
                                'Eliminar'
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={uploading || busy}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentManager;
