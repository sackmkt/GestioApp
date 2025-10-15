import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';
import centrosSaludService from '../services/CentrosSaludService';
import { useFeedback } from '../context/FeedbackContext.jsx';

const ESTADO_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'presentada', label: 'Presentada' },
  { value: 'observada', label: 'Observada' },
  { value: 'pagada_parcial', label: 'Pagada Parcialmente' },
  { value: 'pagada', label: 'Pagada' },
];

const ESTADO_LABELS = ESTADO_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const ESTADO_BADGES = {
  pendiente: 'bg-warning text-dark',
  presentada: 'bg-info text-dark',
  observada: 'bg-danger',
  pagada_parcial: 'bg-primary',
  pagada: 'bg-success',
};

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const getMonthFromDateInput = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string' && value.length >= 7) {
    return value.slice(0, 7);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const resolveMesServicio = (factura) => {
  if (!factura) {
    return '';
  }

  if (factura.mesServicio && MONTH_KEY_REGEX.test(factura.mesServicio)) {
    return factura.mesServicio;
  }

  return getMonthFromDateInput(factura.fechaEmision);
};

const getMonthFilterKey = (factura) => {
  const key = resolveMesServicio(factura);
  return key && MONTH_KEY_REGEX.test(key) ? key : 'sin-fecha';
};

const formatMonthLabel = (value) => {
  if (!value || !MONTH_KEY_REGEX.test(value)) {
    return 'Sin asignar';
  }

  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return 'Sin asignar';
  }

  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return 'Sin asignar';
  }

  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

const EMPTY_FORM = {
  paciente: '',
  obraSocial: '',
  puntoVenta: '',
  numeroFactura: '',
  montoTotal: '',
  fechaEmision: '',
  fechaVencimiento: '',
  mesServicio: '',
  estado: 'pendiente',
  observaciones: '',
  centroSalud: '',
};

const EMPTY_PAYMENT_FORM = {
  monto: '',
  fecha: '',
  metodo: '',
  nota: '',
};

const ITEMS_PER_PAGE = 10;

const getMontoCobrado = (factura) => {
  if (!factura) {
    return 0;
  }

  const montoCobrado = Number(factura.montoCobrado);
  if (Number.isFinite(montoCobrado)) {
    return montoCobrado;
  }

  if (Array.isArray(factura.pagos) && factura.pagos.length > 0) {
    return factura.pagos.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);
  }

  const montoPagado = Number(factura.montoPagado);
  return Number.isFinite(montoPagado) ? montoPagado : 0;
};

const getSaldoPendiente = (factura) => {
  if (!factura) {
    return 0;
  }

  const saldo = Number(factura.saldoPendiente);
  if (Number.isFinite(saldo)) {
    return saldo;
  }

  const montoTotal = Number(factura.montoTotal) || 0;
  const montoCobrado = getMontoCobrado(factura);
  const resultado = montoTotal - montoCobrado;
  return resultado > 0 ? resultado : 0;
};

const getCentroRetencionPorcentaje = (factura) => {
  if (!factura) {
    return 0;
  }

  const porcentaje = factura.centroRetencionPorcentaje ?? factura.centroSalud?.porcentajeRetencion;
  const numeric = Number(porcentaje);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getCentroTotal = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroTotal))) {
    return Number(factura.centroTotal);
  }

  const porcentaje = getCentroRetencionPorcentaje(factura);
  const montoTotal = Number(factura.montoTotal) || 0;
  return (montoTotal * porcentaje) / 100;
};

const getCentroPagado = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroPagado))) {
    return Number(factura.centroPagado);
  }

  const pagosCentro = Array.isArray(factura.pagosCentro) ? factura.pagosCentro : [];
  return pagosCentro.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);
};

const getCentroSaldoPendiente = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroSaldoPendiente))) {
    return Math.max(Number(factura.centroSaldoPendiente), 0);
  }

  const total = getCentroTotal(factura);
  const pagado = getCentroPagado(factura);
  const saldo = total - pagado;
  return saldo > 0 ? saldo : 0;
};

const formatCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '$0,00';
  }
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(numericValue);
};


const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Sin fecha';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};




const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toBase64 = (file) => new Promise((resolve, reject) => {
  if (!file) {
    resolve(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
  reader.readAsDataURL(file);
});

const normalizeEstado = (factura) => {
  if (!factura) {
    return 'pendiente';
  }
  if (factura.estado) {
    return factura.estado;
  }
  return factura.pagado ? 'pagada' : 'pendiente';
};

const esFacturaVencida = (factura) => {
  if (!factura || factura.pagado) {
    return false;
  }
  if (!factura.fechaVencimiento) {
    return false;
  }
  const vencimiento = new Date(factura.fechaVencimiento);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return !Number.isNaN(vencimiento.getTime()) && vencimiento < hoy;
};

const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(['application/pdf', 'application/x-pdf', 'image/jpeg', 'image/pjpeg']);
const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg'];

const getFileExtension = (filename = '') => {
  if (typeof filename !== 'string') {
    return '';
  }
  const trimmed = filename.trim().toLowerCase();
  const lastDotIndex = trimmed.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return '';
  }
  return trimmed.slice(lastDotIndex);
};

const isAllowedDocumentFile = (file) => {
  if (!file) {
    return true;
  }
  const type = (file.type || '').toLowerCase();
  if (ALLOWED_DOCUMENT_TYPES.has(type)) {
    return true;
  }
  const extension = getFileExtension(file.name);
  return ALLOWED_DOCUMENT_EXTENSIONS.includes(extension);
};

const exceedsMaxDocumentSize = (file) => Boolean(file && file.size > MAX_DOCUMENT_SIZE_BYTES);

function FacturaForm({
  data,
  pacientes,
  obrasSociales,
  centrosSalud,
  onChange,
  onPacienteChange,
  onSubmit,
  submitLabel,
  onCancel,
  errorMessage,
  formRef,
  idPrefix = 'factura',
  submitButtonClass = 'btn btn-success',
}) {
  const values = data || EMPTY_FORM;
  const fieldId = (name) => `${idPrefix}-${name}`;

  return (
    <form onSubmit={onSubmit} ref={formRef}>
      {errorMessage && (
        <div className="alert alert-danger" role="alert">
          {errorMessage}
        </div>
      )}
      <div className="row g-3">
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('paciente')} className="form-label">Paciente</label>
          <select
            id={fieldId('paciente')}
            name="paciente"
            className="form-select"
            value={values.paciente}
            onChange={onPacienteChange}
            required
          >
            <option value="">Seleccione Paciente</option>
            {pacientes.map((paciente) => (
              <option key={paciente._id} value={paciente._id}>
                {`${paciente.nombre} ${paciente.apellido}`}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('obraSocial')} className="form-label">Obra Social</label>
          <select
            id={fieldId('obraSocial')}
            name="obraSocial"
            className="form-select"
            value={values.obraSocial}
            onChange={onChange}
          >
            <option value="">Sin obra social</option>
            {obrasSociales.map((obra) => (
              <option key={obra._id} value={obra._id}>{obra.nombre}</option>
            ))}
          </select>
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('centroSalud')} className="form-label">Centro de Salud</label>
          <select
            id={fieldId('centroSalud')}
            name="centroSalud"
            className="form-select"
            value={values.centroSalud}
            onChange={onChange}
          >
            <option value="">Sin centro asociado</option>
            {centrosSalud.map((centro) => (
              <option key={centro._id} value={centro._id}>
                {centro.nombre} ({centro.porcentajeRetencion}% ret.)
              </option>
            ))}
          </select>
          <small className="text-muted">Se completa automáticamente si el paciente proviene de un centro.</small>
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('puntoVenta')} className="form-label">Punto de Venta</label>
          <input
            type="number"
            id={fieldId('puntoVenta')}
            name="puntoVenta"
            className="form-control"
            placeholder="Ej. 1"
            value={values.puntoVenta}
            onChange={onChange}
            min="0"
            required
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('numeroFactura')} className="form-label">Número de Factura</label>
          <input
            type="number"
            id={fieldId('numeroFactura')}
            name="numeroFactura"
            className="form-control"
            placeholder="Ej. 12345"
            value={values.numeroFactura}
            onChange={onChange}
            required
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('montoTotal')} className="form-label">Monto Total</label>
          <input
            type="number"
            id={fieldId('montoTotal')}
            name="montoTotal"
            className="form-control"
            placeholder="Ej. 500.50"
            value={values.montoTotal}
            onChange={onChange}
            min="0"
            step="0.01"
            required
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('fechaEmision')} className="form-label">Fecha de Emisión</label>
          <input
            type="date"
            id={fieldId('fechaEmision')}
            name="fechaEmision"
            className="form-control"
            value={values.fechaEmision}
            onChange={onChange}
            required
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('mesServicio')} className="form-label">Mes del servicio</label>
          <input
            type="month"
            id={fieldId('mesServicio')}
            name="mesServicio"
            className="form-control"
            value={values.mesServicio}
            onChange={onChange}
            placeholder="Seleccioná el mes correspondiente"
          />
          <small className="text-muted">Utilizá este campo para indicar el mes real en el que se prestó el servicio.</small>
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('fechaVencimiento')} className="form-label">Fecha de Vencimiento</label>
          <input
            type="date"
            id={fieldId('fechaVencimiento')}
            name="fechaVencimiento"
            className="form-control"
            value={values.fechaVencimiento}
            onChange={onChange}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor={fieldId('estado')} className="form-label">Estado de Cobranza</label>
          <select
            id={fieldId('estado')}
            name="estado"
            className="form-select"
            value={values.estado}
            onChange={onChange}
          >
            {ESTADO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="col-12">
          <label htmlFor={fieldId('observaciones')} className="form-label">Observaciones</label>
          <textarea
            id={fieldId('observaciones')}
            name="observaciones"
            className="form-control"
            rows="2"
            placeholder="Notas internas sobre la factura"
            value={values.observaciones}
            onChange={onChange}
          />
        </div>
        <div className="col-12 mt-3 d-flex justify-content-end">
          {onCancel && (
            <button type="button" className="btn btn-outline-secondary me-2" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button type="submit" className={submitButtonClass}>
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function FacturasPage() {
  const { showError, showSuccess, showInfo } = useFeedback();
  const location = useLocation();
  const [facturas, setFacturas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [centrosSalud, setCentrosSalud] = useState([]);
  const [createFormData, setCreateFormData] = useState(() => ({ ...EMPTY_FORM }));
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [error, setError] = useState(null);
  const [editError, setEditError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [expandedFacturaId, setExpandedFacturaId] = useState(null);
  const [paymentForms, setPaymentForms] = useState({});
  const [paymentEditForms, setPaymentEditForms] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [centerPaymentForms, setCenterPaymentForms] = useState({});
  const [centerPaymentEditForms, setCenterPaymentEditForms] = useState({});
  const [centerPaymentErrors, setCenterPaymentErrors] = useState({});
  const [documentForms, setDocumentForms] = useState({});
  const [documentInputKeys, setDocumentInputKeys] = useState({});
  const [documentUploadLoadingId, setDocumentUploadLoadingId] = useState(null);
  const [documentDeleteLoadingId, setDocumentDeleteLoadingId] = useState(null);
  const [documentDownloadLoadingId, setDocumentDownloadLoadingId] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFilters, setExportFilters] = useState({ startDate: '', endDate: '', userId: '' });
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState('last10Days');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateSectionOpen, setIsCreateSectionOpen] = useState(true);
  const [isListSectionOpen, setIsListSectionOpen] = useState(true);
  const [showDeudores, setShowDeudores] = useState(false);
  const formRef = useRef(null);

  const scrollToForm = useCallback(() => {
    setIsCreateSectionOpen(true);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [setIsCreateSectionOpen]);

  const fetchFacturas = useCallback(async () => {
    try {
      const data = await facturasService.getFacturas();
      setFacturas(data);
    } catch (fetchError) {
      console.error('No se pudieron cargar las facturas.', fetchError);
      showError('No se pudieron cargar las facturas. Intenta nuevamente.');
    }
  }, [showError]);

  const fetchPacientes = useCallback(async () => {
    try {
      const response = await pacientesService.getPacientes({
        limit: 0,
        fields: 'nombre,apellido,dni,tipoAtencion,obraSocial,centroSalud,email,telefono',
      });
      setPacientes(Array.isArray(response?.data) ? response.data : []);
    } catch (fetchError) {
      console.error('No se pudieron cargar los pacientes.', fetchError);
      showError('No se pudieron cargar los pacientes.');
    }
  }, [showError]);

  const fetchObrasSociales = useCallback(async () => {
    try {
      const data = await obrasSocialesService.getObrasSociales();
      setObrasSociales(data);
    } catch (fetchError) {
      console.error('No se pudieron cargar las obras sociales.', fetchError);
      showError('No se pudieron cargar las obras sociales.');
    }
  }, [showError]);

  const fetchCentrosSalud = useCallback(async () => {
    try {
      const data = await centrosSaludService.getCentros();
      setCentrosSalud(data);
    } catch (fetchError) {
      console.error('No se pudieron cargar los centros de salud.', fetchError);
      showError('No se pudieron cargar los centros de salud.');
    }
  }, [showError]);

  useEffect(() => {
    fetchFacturas();
    fetchPacientes();
    fetchObrasSociales();
    fetchCentrosSalud();
  }, [fetchCentrosSalud, fetchFacturas, fetchObrasSociales, fetchPacientes]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const createParam = params.get('nueva') || params.get('create');
    if (!createParam) {
      return;
    }

    setEditingId(null);
    setCreateFormData((prev) => ({
      ...EMPTY_FORM,
      fechaEmision: new Date().toISOString().substring(0, 10),
      centroSalud: prev.centroSalud,
    }));

    window.setTimeout(scrollToForm, 120);

    params.delete('nueva');
    params.delete('create');
    const remaining = params.toString();
    window.history.replaceState({}, '', `${location.pathname}${remaining ? `?${remaining}` : ''}`);
  }, [location.pathname, location.search, scrollToForm]);
  const handleCreateChange = (event) => {
    const { name, value } = event.target;
    setCreateFormData((prev) => {
      if (name === 'fechaEmision') {
        const updated = { ...prev, fechaEmision: value };
        const previousEmissionMonth = getMonthFromDateInput(prev.fechaEmision);
        if (!prev.mesServicio || prev.mesServicio === previousEmissionMonth) {
          updated.mesServicio = getMonthFromDateInput(value);
        }
        return updated;
      }

      return { ...prev, [name]: value };
    });
  };

  const handleCreatePacienteChange = (event) => {
    const pacienteId = event.target.value;
    const pacienteSeleccionado = pacientes.find((p) => p._id === pacienteId);

    const obraSocialId = pacienteSeleccionado?.obraSocial?._id || '';
    const centroId =
      pacienteSeleccionado?.tipoAtencion === 'centro'
        ? pacienteSeleccionado?.centroSalud?._id || ''
        : '';

    setCreateFormData((prev) => ({
      ...prev,
      paciente: pacienteId,
      obraSocial: obraSocialId,
      centroSalud: centroId,
    }));
  };

  const resetCreateForm = () => {
    setCreateFormData(() => ({ ...EMPTY_FORM }));
  };

  const buildFacturaPayload = (data) => {
    const payload = {
      ...data,
      puntoVenta: Number(data.puntoVenta),
      numeroFactura: Number(data.numeroFactura),
      montoTotal: Number(data.montoTotal),
    };

    payload.fechaVencimiento = payload.fechaVencimiento || null;
    payload.mesServicio = data.mesServicio || getMonthFromDateInput(data.fechaEmision) || null;
    payload.observaciones = payload.observaciones ? payload.observaciones.trim() : '';
    payload.obraSocial = payload.obraSocial || null;
    payload.centroSalud = payload.centroSalud || null;

    return payload;
  };

  const validateFacturaPayload = (payload, onError) => {
    if (!Number.isFinite(payload.puntoVenta) || !Number.isFinite(payload.numeroFactura) || !Number.isFinite(payload.montoTotal)) {
      onError('El punto de venta, el número de factura y el monto deben ser valores numéricos.');
      return false;
    }

    if (payload.puntoVenta < 0 || payload.numeroFactura < 0) {
      onError('El punto de venta y el número de factura no pueden ser negativos.');
      return false;
    }

    return true;
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const payload = buildFacturaPayload(createFormData);
    if (!validateFacturaPayload(payload, setError)) {
      return;
    }

    try {
      await facturasService.createFactura(payload);
      showSuccess('Factura creada correctamente.');
      resetCreateForm();
      await fetchFacturas();
    } catch (submitError) {
      if (submitError.response && submitError.response.status === 400) {
        const message = submitError.response.data?.error
          || 'Ya existe una factura con el mismo punto de venta y número. Verifique los datos ingresados.';
        setError(message);
        showError(message);
      } else {
        const message = 'Ocurrió un error al intentar crear la factura.';
        setError(message);
        showError(message);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Deseas eliminar esta factura?')) {
      return;
    }
    try {
      await facturasService.deleteFactura(id);
      if (expandedFacturaId === id) {
        setExpandedFacturaId(null);
      }
      await fetchFacturas();
      showInfo('La factura se eliminó correctamente.');
    } catch (deleteError) {
      const message = deleteError.response?.data?.error || 'No se pudo eliminar la factura.';
      showError(message);
    }
  };

  const handleEdit = (factura) => {
    const estado = normalizeEstado(factura);
    setEditingId(factura._id);
    setEditError(null);
    setIsListSectionOpen(true);
    setEditFormData({
      paciente: factura.paciente?._id || '',
      obraSocial: factura.obraSocial?._id || '',
      puntoVenta: factura.puntoVenta ?? '',
      numeroFactura: factura.numeroFactura,
      montoTotal: factura.montoTotal,
      fechaEmision: factura.fechaEmision ? new Date(factura.fechaEmision).toISOString().substring(0, 10) : '',
      fechaVencimiento: factura.fechaVencimiento ? new Date(factura.fechaVencimiento).toISOString().substring(0, 10) : '',
      mesServicio: resolveMesServicio(factura),
      estado,
      observaciones: factura.observaciones || '',
      centroSalud: factura.centroSalud?._id || '',
    });
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditFormData((prev) => {
      if (!prev) {
        return prev;
      }

      if (name === 'fechaEmision') {
        const updated = { ...prev, fechaEmision: value };
        const previousEmissionMonth = getMonthFromDateInput(prev.fechaEmision);
        if (!prev.mesServicio || prev.mesServicio === previousEmissionMonth) {
          updated.mesServicio = getMonthFromDateInput(value);
        }
        return updated;
      }

      return { ...prev, [name]: value };
    });
  };

  const handleEditPacienteChange = (event) => {
    const pacienteId = event.target.value;
    const pacienteSeleccionado = pacientes.find((p) => p._id === pacienteId);

    const obraSocialId = pacienteSeleccionado?.obraSocial?._id || '';
    const centroId =
      pacienteSeleccionado?.tipoAtencion === 'centro'
        ? pacienteSeleccionado?.centroSalud?._id || ''
        : '';

    setEditFormData((prev) => (prev ? {
      ...prev,
      paciente: pacienteId,
      obraSocial: obraSocialId,
      centroSalud: centroId,
    } : prev));
  };

  const handleUpdateSubmit = async (event) => {
    event.preventDefault();
    if (!editingId || !editFormData) {
      return;
    }

    setEditError(null);

    const payload = buildFacturaPayload(editFormData);
    if (!validateFacturaPayload(payload, setEditError)) {
      return;
    }

    try {
      await facturasService.updateFactura(editingId, payload);
      showSuccess('Factura actualizada correctamente.');
      setEditingId(null);
      setEditFormData(null);
      await fetchFacturas();
    } catch (submitError) {
      if (submitError.response && submitError.response.status === 400) {
        const message = submitError.response.data?.error
          || 'Ya existe una factura con el mismo punto de venta y número. Verifique los datos ingresados.';
        setEditError(message);
        showError(message);
      } else {
        const message = 'Ocurrió un error al intentar actualizar la factura.';
        setEditError(message);
        showError(message);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData(null);
    setEditError(null);
  };

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchClick = () => {
    setFilterSearchTerm(searchTerm);
  };

  const handleDateFilterChange = (event) => {
    const { value } = event.target;
    setDateFilter(value);
    setCurrentPage(1);
  };

  const handleCustomDateChange = (field, value) => {
    setCustomDateRange((prev) => ({
      ...prev,
      [field]: value,
    }));
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    if (page < 1 || page === currentPage || page > totalPages) {
      return;
    }
    setCurrentPage(page);
  };

  const toggleExpandFactura = (facturaId) => {
    setExpandedFacturaId((prev) => (prev === facturaId ? null : facturaId));
    setPaymentErrors((prev) => ({ ...prev, [facturaId]: null }));
    setCenterPaymentErrors((prev) => ({ ...prev, [facturaId]: null }));
  };

  const handleEstadoUpdate = async (facturaId, nuevoEstado) => {
    try {
      await facturasService.updateFactura(facturaId, { estado: nuevoEstado });
      await fetchFacturas();
      showSuccess('Estado de la factura actualizado.');
    } catch (estadoError) {
      console.error('No se pudo actualizar el estado de la factura.', estadoError);
      showError('No se pudo actualizar el estado de la factura.');
    }
  };

  const handlePaymentFormChange = (facturaId, field, value) => {
    setPaymentForms((prev) => ({
      ...prev,
      [facturaId]: {
        ...(prev[facturaId] || EMPTY_PAYMENT_FORM),
        [field]: value,
      },
    }));
  };

  const resetPaymentForm = (facturaId) => {
    setPaymentForms((prev) => ({
      ...prev,
      [facturaId]: { ...EMPTY_PAYMENT_FORM },
    }));
  };

  const startEditPayment = (facturaId, pago) => {
    setPaymentEditForms((prev) => ({
      ...prev,
      [pago._id]: {
        facturaId,
        monto: Number.isFinite(Number(pago.monto)) ? Number(pago.monto).toString() : '',
        fecha: pago.fecha ? new Date(pago.fecha).toISOString().substring(0, 10) : '',
        metodo: pago.metodo || '',
        nota: pago.nota || '',
      },
    }));
  };

  const cancelEditPayment = (pagoId) => {
    setPaymentEditForms((prev) => {
      const next = { ...prev };
      delete next[pagoId];
      return next;
    });
  };

  const handlePaymentEditChange = (pagoId, field, value) => {
    setPaymentEditForms((prev) => ({
      ...prev,
      [pagoId]: {
        ...prev[pagoId],
        [field]: value,
      },
    }));
  };

  const handleSavePaymentEdit = async (pagoId) => {
    const form = paymentEditForms[pagoId];
    if (!form) {
      return;
    }

    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setPaymentErrors((prev) => ({
        ...prev,
        [form.facturaId]: 'Ingrese un monto válido para actualizar el pago.',
      }));
      return;
    }

    try {
      await facturasService.actualizarPago(form.facturaId, pagoId, {
        monto,
        fecha: form.fecha || undefined,
        metodo: form.metodo || undefined,
        nota: form.nota || undefined,
      });
      cancelEditPayment(pagoId);
      setPaymentErrors((prev) => ({ ...prev, [form.facturaId]: null }));
      await fetchFacturas();
      showSuccess('Pago actualizado correctamente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al actualizar el pago.';
      setPaymentErrors((prev) => ({
        ...prev,
        [form.facturaId]: message,
      }));
      showError(message);
    }
  };

  const handleCenterPaymentFormChange = (facturaId, field, value) => {
    setCenterPaymentForms((prev) => ({
      ...prev,
      [facturaId]: {
        ...(prev[facturaId] || EMPTY_PAYMENT_FORM),
        [field]: value,
      },
    }));
  };

  const resetCenterPaymentForm = (facturaId) => {
    setCenterPaymentForms((prev) => ({
      ...prev,
      [facturaId]: { ...EMPTY_PAYMENT_FORM },
    }));
  };

  const startEditCenterPayment = (facturaId, pago) => {
    setCenterPaymentEditForms((prev) => ({
      ...prev,
      [pago._id]: {
        facturaId,
        monto: Number.isFinite(Number(pago.monto)) ? Number(pago.monto).toString() : '',
        fecha: pago.fecha ? new Date(pago.fecha).toISOString().substring(0, 10) : '',
        metodo: pago.metodo || '',
        nota: pago.nota || '',
      },
    }));
  };

  const cancelEditCenterPayment = (pagoId) => {
    setCenterPaymentEditForms((prev) => {
      const next = { ...prev };
      delete next[pagoId];
      return next;
    });
  };

  const handleCenterPaymentEditChange = (pagoId, field, value) => {
    setCenterPaymentEditForms((prev) => ({
      ...prev,
      [pagoId]: {
        ...prev[pagoId],
        [field]: value,
      },
    }));
  };

  const handleSaveCenterPaymentEdit = async (pagoId) => {
    const form = centerPaymentEditForms[pagoId];
    if (!form) {
      return;
    }

    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setCenterPaymentErrors((prev) => ({
        ...prev,
        [form.facturaId]: 'Ingrese un monto válido para actualizar el pago al centro.',
      }));
      return;
    }

    try {
      await facturasService.actualizarPagoCentro(form.facturaId, pagoId, {
        monto,
        fecha: form.fecha || undefined,
        metodo: form.metodo || undefined,
        nota: form.nota || undefined,
      });
      cancelEditCenterPayment(pagoId);
      setCenterPaymentErrors((prev) => ({ ...prev, [form.facturaId]: null }));
      await fetchFacturas();
      showSuccess('Pago al centro actualizado correctamente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al actualizar el pago al centro.';
      setCenterPaymentErrors((prev) => ({
        ...prev,
        [form.facturaId]: message,
      }));
      showError(message);
    }
  };

  const handleRegisterPayment = async (facturaId) => {
    const form = paymentForms[facturaId] || EMPTY_PAYMENT_FORM;
    const monto = Number(form.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
      setPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: 'Ingrese un monto válido para registrar el pago.',
      }));
      return;
    }

    try {
      await facturasService.registrarPago(facturaId, {
        monto,
        fecha: form.fecha || undefined,
        metodo: form.metodo || undefined,
        nota: form.nota || undefined,
      });
      resetPaymentForm(facturaId);
      setPaymentErrors((prev) => ({ ...prev, [facturaId]: null }));
      await fetchFacturas();
      showSuccess('Pago registrado correctamente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al registrar el pago.';
      setPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: message,
      }));
      showError(message);
    }
  };

  const handleDeletePayment = async (facturaId, pagoId) => {
    try {
      await facturasService.eliminarPago(facturaId, pagoId);
      cancelEditPayment(pagoId);
      await fetchFacturas();
      showInfo('El pago se eliminó correctamente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al eliminar el pago.';
      setPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: message,
      }));
      showError(message);
    }
  };

  const handleRegisterCenterPayment = async (facturaId) => {
    const form = centerPaymentForms[facturaId] || EMPTY_PAYMENT_FORM;
    const monto = Number(form.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
      setCenterPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: 'Ingrese un monto válido para registrar el pago al centro.',
      }));
      return;
    }

    try {
      await facturasService.registrarPagoCentro(facturaId, {
        monto,
        fecha: form.fecha || undefined,
        metodo: form.metodo || undefined,
        nota: form.nota || undefined,
      });
      resetCenterPaymentForm(facturaId);
      setCenterPaymentErrors((prev) => ({ ...prev, [facturaId]: null }));
      await fetchFacturas();
      showSuccess('Pago al centro registrado correctamente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al registrar el pago al centro.';
      setCenterPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: message,
      }));
      showError(message);
    }
  };

  const handleDeleteCenterPayment = async (facturaId, pagoId) => {
    try {
      await facturasService.eliminarPagoCentro(facturaId, pagoId);
      cancelEditCenterPayment(pagoId);
      await fetchFacturas();
      showInfo('El pago al centro se eliminó correctamente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al eliminar el pago al centro.';
      setCenterPaymentErrors((prev) => ({
        ...prev,
        [facturaId]: message,
      }));
      showError(message);
    }
  };

  const handleLiquidarSaldo = async (factura) => {
    const saldoPendiente = getSaldoPendiente(factura);
    if (saldoPendiente <= 0) {
      return;
    }

    try {
      await facturasService.registrarPago(factura._id, {
        monto: saldoPendiente,
        fecha: new Date().toISOString(),
        metodo: 'Liquidación',
        nota: 'Liquidación rápida del saldo pendiente',
      });
      await fetchFacturas();
      showSuccess('Se registró la liquidación completa del saldo pendiente.');
    } catch (paymentError) {
      const message = paymentError.response?.data?.error || 'Error al liquidar la factura.';
      setPaymentErrors((prev) => ({
        ...prev,
        [factura._id]: message,
      }));
      showError(message);
    }
  };

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start = null;
    let end = null;

    switch (dateFilter) {
      case 'last10Days': {
        start = new Date(today);
        start.setDate(start.getDate() - 9);
        start.setHours(0, 0, 0, 0);
        end = new Date(today);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'last30Days': {
        start = new Date(today);
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        end = new Date(today);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'thisMonth': {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case 'thisYear': {
        start = new Date(today.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      }
      case 'custom': {
        if (customDateRange.start) {
          const parsedStart = new Date(customDateRange.start);
          if (!Number.isNaN(parsedStart.getTime())) {
            start = new Date(parsedStart);
            start.setHours(0, 0, 0, 0);
          }
        }
        if (customDateRange.end) {
          const parsedEnd = new Date(customDateRange.end);
          if (!Number.isNaN(parsedEnd.getTime())) {
            end = new Date(parsedEnd);
            end.setHours(23, 59, 59, 999);
          }
        }
        break;
      }
      case 'all':
      default: {
        start = null;
        end = null;
        break;
      }
    }

    return { startDate: start, endDate: end };
  }, [dateFilter, customDateRange]);

  const startDateTime = startDate ? startDate.getTime() : null;
  const endDateTime = endDate ? endDate.getTime() : null;

  const appliedSearch = useMemo(() => filterSearchTerm.trim().toLowerCase(), [filterSearchTerm]);

  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    let hasUnassigned = false;

    facturas.forEach((factura) => {
      const key = resolveMesServicio(factura);
      if (key && MONTH_KEY_REGEX.test(key)) {
        monthSet.add(key);
      } else {
        hasUnassigned = true;
      }
    });

    const sorted = Array.from(monthSet).sort((a, b) => (a > b ? -1 : 1));
    const options = sorted.map((key) => ({ value: key, label: formatMonthLabel(key) }));

    if (hasUnassigned) {
      options.push({ value: 'sin-fecha', label: 'Sin mes asignado' });
    }

    return options;
  }, [facturas]);

  const facturasByMonth = useMemo(() => {
    if (monthFilter === 'all') {
      return facturas;
    }

    return facturas.filter((factura) => {
      const key = getMonthFilterKey(factura);
      if (monthFilter === 'sin-fecha') {
        return key === 'sin-fecha';
      }
      return key === monthFilter;
    });
  }, [facturas, monthFilter]);

  const filteredFacturas = useMemo(() => {
    return facturasByMonth.filter((factura) => {
      const estado = normalizeEstado(factura);
      const matchesStatus = (() => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'vencidas') return esFacturaVencida(factura);
        return estado === statusFilter;
      })();

      if (!matchesStatus) {
        return false;
      }

      if (startDateTime || endDateTime) {
        const fechaEmision = factura.fechaEmision ? new Date(factura.fechaEmision) : null;
        if (!fechaEmision || Number.isNaN(fechaEmision.getTime())) {
          return false;
        }
        const fechaNormalizada = new Date(fechaEmision);
        fechaNormalizada.setHours(0, 0, 0, 0);

        if (startDateTime && fechaNormalizada.getTime() < startDateTime) {
          return false;
        }

        if (endDateTime) {
          const fechaFin = endDateTime;
          if (fechaNormalizada.getTime() > fechaFin) {
            return false;
          }
        }
      }

      if (!appliedSearch) {
        return true;
      }

      const numeroFactura = factura.numeroFactura !== null && factura.numeroFactura !== undefined
        ? String(factura.numeroFactura)
        : '';

      const puntoVenta = factura.puntoVenta !== null && factura.puntoVenta !== undefined
        ? String(factura.puntoVenta)
        : '';

      const comprobante = puntoVenta && numeroFactura
        ? `${puntoVenta}-${numeroFactura}`
        : numeroFactura;

      const pacienteNombre = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
        : '';

      const obraSocialNombre = factura.obraSocial?.nombre || '';

      const valuesToSearch = [numeroFactura, puntoVenta, comprobante, pacienteNombre, obraSocialNombre]
        .map((value) => value.toLowerCase());
      return valuesToSearch.some((value) => value.includes(appliedSearch));
    });
  }, [facturasByMonth, statusFilter, appliedSearch, startDateTime, endDateTime]);

  const deudores = useMemo(() => {
    const acumulado = new Map();

    filteredFacturas.forEach((factura) => {
      const saldoPendiente = getSaldoPendiente(factura);
      if (saldoPendiente <= 0) {
        return;
      }

      const pacienteId = factura.paciente?._id || `sin-paciente-${factura._id}`;
      const nombreBase = factura.paciente
        ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim()
        : '';
      const nombre = nombreBase || 'Paciente sin identificar';

      if (!acumulado.has(pacienteId)) {
        acumulado.set(pacienteId, { id: pacienteId, nombre, total: 0, facturas: 0 });
      }

      const entry = acumulado.get(pacienteId);
      entry.total += saldoPendiente;
      entry.facturas += 1;
    });

    return Array.from(acumulado.values()).sort((a, b) => b.total - a.total);
  }, [filteredFacturas]);

  const totalFacturas = filteredFacturas.length;
  const totalPages = Math.max(Math.ceil(totalFacturas / ITEMS_PER_PAGE), 1);
  const paginatedFacturas = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredFacturas.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredFacturas, currentPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = [];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    pages.push(1);

    if (start > 2) {
      pages.push('start-ellipsis');
    }

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    if (end < totalPages - 1) {
      pages.push('end-ellipsis');
    }

    pages.push(totalPages);

    return pages;
  }, [totalPages, currentPage]);

  const showingFrom = totalFacturas === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingTo = totalFacturas === 0 ? 0 : Math.min(currentPage * ITEMS_PER_PAGE, totalFacturas);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, appliedSearch, startDateTime, endDateTime, monthFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: facturasByMonth.length,
      vencidas: facturasByMonth.filter((factura) => esFacturaVencida(factura)).length,
      pendiente: 0,
      presentada: 0,
      observada: 0,
      pagada_parcial: 0,
      pagada: 0,
    };

    facturasByMonth.forEach((factura) => {
      const estado = normalizeEstado(factura);
      if (counts[estado] !== undefined) {
        counts[estado] += 1;
      }
    });

    return counts;
  }, [facturasByMonth]);

  const saldoPendienteTotal = useMemo(
    () => facturasByMonth.reduce((total, factura) => total + getSaldoPendiente(factura), 0),
    [facturasByMonth],
  );

  const facturasPendientes = Math.max(statusCounts.all - statusCounts.pagada, 0);


  const renderStatusTabs = () => {
    const tabs = [
      { key: 'all', label: `Todas (${statusCounts.all})` },
      { key: 'vencidas', label: `Vencidas (${statusCounts.vencidas})` },
      { key: 'pendiente', label: `Pendientes (${statusCounts.pendiente})` },
      { key: 'presentada', label: `Presentadas (${statusCounts.presentada})` },
      { key: 'observada', label: `Observadas (${statusCounts.observada})` },
      { key: 'pagada_parcial', label: `Parciales (${statusCounts.pagada_parcial})` },
      { key: 'pagada', label: `Pagadas (${statusCounts.pagada})` },
    ];

    return (
      <ul className="nav nav-tabs card-header-tabs mt-3 flex-nowrap overflow-auto">
        {tabs.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <button
              type="button"
              className={`nav-link ${statusFilter === tab.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const getPaymentForm = (facturaId) => paymentForms[facturaId] || EMPTY_PAYMENT_FORM;
  const getCenterPaymentForm = (facturaId) => centerPaymentForms[facturaId] || EMPTY_PAYMENT_FORM;
  const getDocumentForm = (facturaId) => documentForms[facturaId] || { nombre: '', descripcion: '', archivo: null };

  const handleDocumentFormChange = (facturaId, field, value) => {
    setDocumentForms((prev) => ({
      ...prev,
      [facturaId]: {
        ...getDocumentForm(facturaId),
        [field]: value,
      },
    }));
  };

  const handleDocumentFileChange = (facturaId, file) => {
    if (file) {
      if (exceedsMaxDocumentSize(file)) {
        showError('El archivo supera el tamaño máximo permitido de 20 MB.');
        setDocumentForms((prev) => ({
          ...prev,
          [facturaId]: { ...getDocumentForm(facturaId), archivo: null },
        }));
        setDocumentInputKeys((prev) => ({
          ...prev,
          [facturaId]: (prev[facturaId] || 0) + 1,
        }));
        return;
      }

      if (!isAllowedDocumentFile(file)) {
        showError('Solo se permiten archivos en formato PDF o JPG.');
        setDocumentForms((prev) => ({
          ...prev,
          [facturaId]: { ...getDocumentForm(facturaId), archivo: null },
        }));
        setDocumentInputKeys((prev) => ({
          ...prev,
          [facturaId]: (prev[facturaId] || 0) + 1,
        }));
        return;
      }
    }

    setDocumentForms((prev) => ({
      ...prev,
      [facturaId]: {
        ...getDocumentForm(facturaId),
        archivo: file || null,
      },
    }));
  };

  const resetDocumentForm = (facturaId) => {
    setDocumentForms((prev) => ({
      ...prev,
      [facturaId]: { nombre: '', descripcion: '', archivo: null },
    }));
    setDocumentInputKeys((prev) => ({
      ...prev,
      [facturaId]: (prev[facturaId] || 0) + 1,
    }));
  };

  const handleDocumentoSubmit = async (event, facturaId) => {
    event.preventDefault();
    const form = getDocumentForm(facturaId);
    const nombre = form.nombre?.trim();

    if (!nombre) {
      showError('Ingresa un nombre para identificar el documento.');
      return;
    }

    if (!form.archivo) {
      showError('Selecciona un archivo para adjuntar.');
      return;
    }

    if (exceedsMaxDocumentSize(form.archivo)) {
      showError('El archivo supera el tamaño máximo permitido de 20 MB.');
      return;
    }

    if (!isAllowedDocumentFile(form.archivo)) {
      showError('Solo se permiten archivos en formato PDF o JPG.');
      return;
    }

    try {
      setDocumentUploadLoadingId(facturaId);
      const base64 = await toBase64(form.archivo);
      if (!base64) {
        throw new Error('No se pudo procesar el archivo seleccionado.');
      }

      const payload = {
        nombre,
        descripcion: form.descripcion?.trim() || '',
        archivo: {
          nombre: form.archivo.name,
          tipo: form.archivo.type,
          base64,
        },
      };

      const nuevoDocumento = await facturasService.uploadDocumento(facturaId, payload);
      setFacturas((prev) => prev.map((factura) => (
        factura._id === facturaId
          ? { ...factura, documentos: [...(factura.documentos || []), nuevoDocumento] }
          : factura
      )));
      resetDocumentForm(facturaId);
      showSuccess('Documento adjuntado a la factura.');
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo adjuntar el documento.';
      showError(message);
    } finally {
      setDocumentUploadLoadingId(null);
    }
  };

  const handleExportFilterChange = (field, value) => {
    setExportFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetExportFilters = () => {
    setExportFilters({ startDate: '', endDate: '', userId: '' });
  };

  const handleDocumentoDelete = async (facturaId, documentoId) => {
    if (!window.confirm('¿Eliminar este documento?')) {
      return;
    }
    try {
      setDocumentDeleteLoadingId(documentoId);
      await facturasService.deleteDocumento(facturaId, documentoId);
      setFacturas((prev) => prev.map((factura) => (
        factura._id === facturaId
          ? { ...factura, documentos: (factura.documentos || []).filter((doc) => doc._id !== documentoId) }
          : factura
      )));
      showInfo('Documento eliminado correctamente.');
    } catch (err) {
      const message = err.response?.data?.error || 'No se pudo eliminar el documento.';
      showError(message);
    } finally {
      setDocumentDeleteLoadingId(null);
    }
  };

  const handleDocumentoDownload = async (facturaId, documentoId) => {
    try {
      setDocumentDownloadLoadingId(documentoId);
      const { blob, filename } = await facturasService.downloadDocumento(facturaId, documentoId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err.response?.data?.error || 'No se pudo descargar el documento.';
      showError(message);
    } finally {
      setDocumentDownloadLoadingId(null);
    }
  };

  const handleExportFacturas = async () => {
    try {
      const trimmedStartDate = exportFilters.startDate?.trim() || '';
      const trimmedEndDate = exportFilters.endDate?.trim() || '';
      const trimmedUserId = exportFilters.userId?.trim() || '';

      if (trimmedStartDate && trimmedEndDate && trimmedStartDate > trimmedEndDate) {
        showError('La fecha desde no puede ser posterior a la fecha hasta.');
        return;
      }

      setExportLoading(true);
      const mesServicioFilter = monthFilter !== 'all' ? monthFilter : undefined;

      const { blob, filename } = await facturasService.exportFacturas({
        startDate: trimmedStartDate || undefined,
        endDate: trimmedEndDate || undefined,
        userId: trimmedUserId || undefined,
        mesServicio: mesServicioFilter,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Exportación de facturas generada correctamente.');
    } catch (err) {
      const message = err.response?.data?.error || 'No se pudo exportar el listado de facturas.';
      showError(message);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="gestio-page container">
      <header className="gestio-page__header" aria-labelledby="facturas-heading">
        <div className="gestio-page__title-group">
          <h1 id="facturas-heading" className="gestio-page__title">
            Gestión de facturación
          </h1>
          <p className="gestio-page__description">
            Controlá la emisión, seguimiento y cobranzas de tus comprobantes en un único lugar.
          </p>
        </div>
        <div className="gestio-page__actions">
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={handleExportFacturas}
            disabled={exportLoading}
          >
            {exportLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Generando...
              </>
            ) : (
              <>Exportar facturas</>
            )}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setExportOptionsOpen((prev) => !prev)}
            aria-expanded={exportOptionsOpen}
          >
            {exportOptionsOpen ? 'Ocultar opciones' : 'Opciones de exportación'}
          </button>
        </div>
      </header>

      <section className="gestio-page__meta" aria-label="Resumen de facturación">
        <div className="gestio-page__meta-item">
          <span className="gestio-page__meta-label">Facturas registradas</span>
          <span className="gestio-page__meta-value">{statusCounts.all}</span>
        </div>
        <div className="gestio-page__meta-item">
          <span className="gestio-page__meta-label">Pendientes de cobro</span>
          <span className="gestio-page__meta-value text-warning">{facturasPendientes}</span>
        </div>
        <div className="gestio-page__meta-item">
          <span className="gestio-page__meta-label">Pagadas</span>
          <span className="gestio-page__meta-value text-success">{statusCounts.pagada}</span>
        </div>
        <div className="gestio-page__meta-item">
          <span className="gestio-page__meta-label">Saldo pendiente</span>
          <span className="gestio-page__meta-value text-danger">{formatCurrency(saldoPendienteTotal)}</span>
        </div>
      </section>

      <section className="mb-4">
        <button
          type="button"
          className="btn btn-light border w-100 d-flex justify-content-between align-items-center"
          onClick={() => setIsCreateSectionOpen((prev) => !prev)}
          aria-expanded={isCreateSectionOpen}
          aria-controls="facturas-create-section"
        >
          <span className="fw-semibold text-start">Carga de facturas</span>
          <span className="ms-2" aria-hidden="true">{isCreateSectionOpen ? '▲' : '▼'}</span>
        </button>
        <div
          id="facturas-create-section"
          className={`collapse mt-3 ${isCreateSectionOpen ? 'show' : ''}`}
        >
          <div className="card shadow-sm">
            <div className="card-header bg-success text-white">
              <h2 className="mb-0 fs-5">Carga de facturas</h2>
            </div>
            <div className="card-body">
              <FacturaForm
                data={createFormData}
                pacientes={pacientes}
                obrasSociales={obrasSociales}
                centrosSalud={centrosSalud}
                onChange={handleCreateChange}
                onPacienteChange={handleCreatePacienteChange}
                onSubmit={handleCreateSubmit}
                submitLabel="Agregar factura"
                errorMessage={error}
                formRef={formRef}
                idPrefix="create"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <button
          type="button"
          className="btn btn-light border w-100 d-flex justify-content-between align-items-center"
          onClick={() => setIsListSectionOpen((prev) => !prev)}
          aria-expanded={isListSectionOpen}
          aria-controls="facturas-list-section"
        >
          <span className="fw-semibold text-start">Listado de facturas</span>
          <span className="ms-2" aria-hidden="true">{isListSectionOpen ? '▲' : '▼'}</span>
        </button>
        <div
          id="facturas-list-section"
          className={`collapse mt-3 ${isListSectionOpen ? 'show' : ''}`}
        >
          <div className="card shadow-sm">
            <div className="card-header">
          <div className="d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
            <h4 className="mb-0">Listado de Facturas</h4>
            <div className="d-flex flex-column flex-sm-row align-items-stretch gap-2 w-100 w-lg-auto" style={{ maxWidth: '100%' }}>
              <div className="input-group" style={{ minWidth: '240px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Buscar por paciente, punto de venta, factura u obra social"
                  value={searchTerm}
                  onChange={handleInputChange}
                />
                <button className="btn btn-outline-secondary" type="button" onClick={handleSearchClick}>
                  Buscar
                </button>
              </div>
              <div className="d-flex align-items-stretch" style={{ minWidth: '200px' }}>
                <label className="visually-hidden" htmlFor="monthFilterSelect">Mes del servicio</label>
                <select
                  id="monthFilterSelect"
                  className="form-select"
                  value={monthFilter}
                  onChange={(event) => setMonthFilter(event.target.value)}
                >
                  <option value="all">Todos los meses</option>
                  {availableMonths.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
            {exportOptionsOpen && (
              <div className="border rounded bg-light p-3 mt-3">
                <div className="row g-3">
                  <div className="col-12 col-md-4 col-lg-3">
                    <label className="form-label text-muted small mb-1" htmlFor="exportStartDate">
                      Fecha desde
                    </label>
                    <input
                      id="exportStartDate"
                      type="date"
                      className="form-control form-control-sm"
                      value={exportFilters.startDate}
                      max={exportFilters.endDate || undefined}
                      onChange={(event) => handleExportFilterChange('startDate', event.target.value)}
                      disabled={exportLoading}
                    />
                  </div>
                  <div className="col-12 col-md-4 col-lg-3">
                    <label className="form-label text-muted small mb-1" htmlFor="exportEndDate">
                      Fecha hasta
                    </label>
                    <input
                      id="exportEndDate"
                      type="date"
                      className="form-control form-control-sm"
                      value={exportFilters.endDate}
                      min={exportFilters.startDate || undefined}
                      onChange={(event) => handleExportFilterChange('endDate', event.target.value)}
                      disabled={exportLoading}
                    />
                  </div>
                  <div className="col-12 col-md-4 col-lg-3">
                    <label className="form-label text-muted small mb-1" htmlFor="exportUserId">
                      Usuario (opcional)
                    </label>
                    <input
                      id="exportUserId"
                      type="text"
                      className="form-control form-control-sm"
                      value={exportFilters.userId}
                      onChange={(event) => handleExportFilterChange('userId', event.target.value)}
                      placeholder="ID de usuario"
                      disabled={exportLoading}
                    />
                    <small className="text-muted">Deja vacío para exportar tus propias facturas.</small>
                  </div>
                  <div className="col-12 col-lg-3 d-flex align-items-end justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={resetExportFilters}
                      disabled={exportLoading}
                    >
                      Limpiar filtros
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-lg-between gap-3">
              <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-2">
                <label className="form-label mb-0 text-muted text-uppercase small fw-semibold" htmlFor="dateFilter">
                  Período
                </label>
                <div className="d-flex flex-column flex-sm-row gap-2">
                  <select
                    id="dateFilter"
                    className="form-select form-select-sm"
                    value={dateFilter}
                    onChange={handleDateFilterChange}
                  >
                    <option value="last10Days">Últimos 10 días</option>
                    <option value="last30Days">Últimos 30 días</option>
                    <option value="thisMonth">Este mes</option>
                    <option value="thisYear">Este año</option>
                    <option value="all">Todo el período</option>
                    <option value="custom">Personalizado</option>
                  </select>
                  {dateFilter === 'custom' && (
                    <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-2">
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={customDateRange.start}
                        max={customDateRange.end || undefined}
                        onChange={(event) => handleCustomDateChange('start', event.target.value)}
                      />
                      <span className="text-muted small">a</span>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={customDateRange.end}
                        min={customDateRange.start || undefined}
                        onChange={(event) => handleCustomDateChange('end', event.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="text-muted small">
                {totalFacturas === 0
                  ? 'Sin facturas para mostrar con los filtros actuales'
                  : `Mostrando ${showingFrom}-${showingTo} de ${totalFacturas} facturas`}
              </div>
            </div>
          </div>
          {renderStatusTabs()}
        </div>
        <div className="card-body">
          {editingId && editFormData && (
            <div className="card border-warning mb-4">
              <div className="card-header bg-warning text-dark d-flex justify-content-between align-items-center">
                <h3 className="fs-6 mb-0">Modificar factura</h3>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Cancelar edición"
                  onClick={handleCancelEdit}
                ></button>
              </div>
              <div className="card-body">
                <FacturaForm
                  data={editFormData}
                  pacientes={pacientes}
                  obrasSociales={obrasSociales}
                  centrosSalud={centrosSalud}
                  onChange={handleEditChange}
                  onPacienteChange={handleEditPacienteChange}
                  onSubmit={handleUpdateSubmit}
                  submitLabel="Guardar cambios"
                  onCancel={handleCancelEdit}
                  errorMessage={editError}
                  idPrefix="edit"
                  submitButtonClass="btn btn-warning"
                />
              </div>
            </div>
          )}
          <div className="mb-4">
            <button
              type="button"
              className="btn btn-outline-primary w-100 d-flex justify-content-between align-items-center"
              onClick={() => setShowDeudores((prev) => !prev)}
              aria-expanded={showDeudores}
              aria-controls="deudores-section"
            >
              <span className="fw-semibold text-start">Pacientes con saldo pendiente</span>
              <span className="ms-2" aria-hidden="true">{showDeudores ? '▲' : '▼'}</span>
            </button>
            <div
              id="deudores-section"
              className={`collapse ${showDeudores ? 'show' : ''} mt-3`}
            >
              {deudores.length === 0 ? (
                <p className="text-muted mb-0 small">No hay pacientes con saldo pendiente en el período seleccionado.</p>
              ) : (
                <div className="list-group small">
                  {deudores.map((deudor) => (
                    <div key={deudor.id} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-semibold">{deudor.nombre}</div>
                        <span className="text-muted">{deudor.facturas} {deudor.facturas === 1 ? 'factura' : 'facturas'} con saldo</span>
                      </div>
                      <span className="badge bg-warning text-dark fs-6">{formatCurrency(deudor.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {totalFacturas === 0 ? (
            <p className="text-center text-muted my-4">No se encontraron facturas con los filtros seleccionados.</p>
          ) : (
            <>
              <div className="table-responsive d-none d-md-block">
            <table className="table table-striped table-hover mb-0 align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Factura</th>
                  <th>Paciente</th>
                  <th>Monto</th>
                  <th>Emitida</th>
                  <th>Mes servicio</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th>Saldo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFacturas.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center text-muted py-4">No hay facturas para mostrar.</td>
                  </tr>
                ) : paginatedFacturas.map((factura) => {
                    const estado = normalizeEstado(factura);
                    const badgeClass = ESTADO_BADGES[estado] || 'bg-secondary';
                    const isVencida = esFacturaVencida(factura);
                    const puntoVentaValue = Number.isFinite(factura.puntoVenta) ? factura.puntoVenta : null;
                    const numeroFacturaValue = Number.isFinite(factura.numeroFactura) ? factura.numeroFactura : null;
                    const puntoVentaDisplay = puntoVentaValue ?? '—';
                    const numeroFacturaDisplay = numeroFacturaValue ?? '—';
                    const facturaDisplay = puntoVentaValue !== null || numeroFacturaValue !== null
                      ? [puntoVentaValue, numeroFacturaValue].filter((value) => value !== null).join('-')
                      : '—';
                    const montoCobrado = getMontoCobrado(factura);
                    const saldoPendiente = getSaldoPendiente(factura);
                    const centroTotal = getCentroTotal(factura);
                    const centroPagado = getCentroPagado(factura);
                    const centroSaldo = getCentroSaldoPendiente(factura);
                    const mesServicioKey = resolveMesServicio(factura);
                    const mesServicioLabel = formatMonthLabel(mesServicioKey);
                    return (
                      <React.Fragment key={factura._id}>
                        <tr className={factura.pagado ? 'table-success' : ''}>
                          <td>{facturaDisplay}</td>
                          <td>{factura.paciente ? `${factura.paciente.nombre} ${factura.paciente.apellido}` : 'N/A'}</td>
                          <td>{formatCurrency(factura.montoTotal)}</td>
                          <td>{formatDate(factura.fechaEmision)}</td>
                          <td>{mesServicioLabel}</td>
                          <td>
                            {formatDate(factura.fechaVencimiento)}
                            {isVencida && (
                              <span className="badge bg-danger ms-2">Vencida</span>
                            )}
                          </td>
                          <td>
                            <div className="d-flex flex-column gap-2">
                              <span className={`badge rounded-pill ${badgeClass}`}>
                                {ESTADO_LABELS[estado] || estado}
                              </span>
                              <select
                                className="form-select form-select-sm"
                                value={estado}
                                onChange={(e) => handleEstadoUpdate(factura._id, e.target.value)}
                              >
                                {ESTADO_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>{formatCurrency(saldoPendiente)}</td>
                          <td>
                            <div className="d-flex flex-column gap-2">
                              <button
                                className="btn btn-outline-primary btn-sm"
                                type="button"
                                onClick={() => toggleExpandFactura(factura._id)}
                              >
                                {expandedFacturaId === factura._id ? 'Ocultar' : 'Detalles'}
                              </button>
                              <button
                                className="btn btn-warning btn-sm"
                                type="button"
                                onClick={() => handleEdit(factura)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                type="button"
                                onClick={() => handleDelete(factura._id)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedFacturaId === factura._id && (
                        <tr>
                          <td colSpan="8">
                            <div className="p-3 bg-light border rounded">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <h6 className="text-uppercase text-muted">Detalle</h6>
                                  <p className="mb-1"><strong>Monto Total:</strong> {formatCurrency(factura.montoTotal)}</p>
                                  <p className="mb-1"><strong>Monto Cobrado:</strong> {formatCurrency(montoCobrado)}</p>
                                  <p className="mb-1"><strong>Obra Social:</strong> {factura.obraSocial ? factura.obraSocial.nombre : 'Sin obra social'}</p>
                                  <p className="mb-1"><strong>Centro:</strong> {factura.centroSalud ? `${factura.centroSalud.nombre} · Ret. ${factura.centroSalud.porcentajeRetencion}%` : 'Sin centro asociado'}</p>
                                  <p className="mb-1"><strong>Observaciones:</strong> {factura.observaciones || '—'}</p>
                                  <p className="mb-1"><strong>Punto de venta:</strong> {puntoVentaDisplay}</p>
                                  <p className="mb-1"><strong>Número de factura:</strong> {numeroFacturaDisplay}</p>
                                  <p className="mb-1"><strong>Mes del servicio:</strong> {mesServicioLabel}</p>
                                  <p className="mb-1"><strong>Saldo Pendiente:</strong> {formatCurrency(saldoPendiente)}</p>
                                  <p className="mb-1"><strong>Total a centro:</strong> {factura.centroSalud ? formatCurrency(centroTotal) : '—'}</p>
                                  <p className="mb-1"><strong>Pagado al centro:</strong> {factura.centroSalud ? formatCurrency(centroPagado) : '—'}</p>
                                  <p className="mb-1"><strong>Saldo con centro:</strong> {factura.centroSalud ? formatCurrency(centroSaldo) : '—'}</p>
                                  <div className="d-flex gap-2 mt-3">
                                    <button
                                      className="btn btn-success btn-sm"
                                      type="button"
                                      onClick={() => handleLiquidarSaldo(factura)}
                                      disabled={saldoPendiente <= 0}
                                    >
                                      Liquidar saldo
                                    </button>
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      type="button"
                                      onClick={() => handleEstadoUpdate(factura._id, 'presentada')}
                                    >
                                      Marcar como presentada
                                    </button>
                                  </div>
                                  {paymentErrors[factura._id] && (
                                    <div className="alert alert-danger mt-3 mb-0" role="alert">
                                      {paymentErrors[factura._id]}
                                    </div>
                                  )}
                                </div>
                                <div className="col-md-8">
                                  <h6 className="text-uppercase text-muted">Pagos registrados</h6>
                                  {factura.pagos && factura.pagos.length > 0 ? (
                                    <div className="table-responsive">
                                      <table className="table table-sm align-middle">
                                        <thead>
                                          <tr>
                                            <th>Monto</th>
                                            <th>Fecha</th>
                                            <th>Método</th>
                                            <th>Nota</th>
                                            <th></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {factura.pagos.map((pago) => {
                                            const editForm = paymentEditForms[pago._id];
                                            return (
                                              <tr key={pago._id}>
                                                <td className="w-25">
                                                  {editForm ? (
                                                    <input
                                                      type="number"
                                                      className="form-control form-control-sm"
                                                      min="0"
                                                      step="0.01"
                                                      value={editForm.monto}
                                                      onChange={(event) => handlePaymentEditChange(pago._id, 'monto', event.target.value)}
                                                    />
                                                  ) : (
                                                    formatCurrency(pago.monto)
                                                  )}
                                                </td>
                                                <td className="w-25">
                                                  {editForm ? (
                                                    <input
                                                      type="date"
                                                      className="form-control form-control-sm"
                                                      value={editForm.fecha}
                                                      onChange={(event) => handlePaymentEditChange(pago._id, 'fecha', event.target.value)}
                                                    />
                                                  ) : (
                                                    formatDate(pago.fecha)
                                                  )}
                                                </td>
                                                <td>
                                                  {editForm ? (
                                                    <select
                                                      className="form-select form-select-sm"
                                                      value={editForm.metodo}
                                                      onChange={(event) => handlePaymentEditChange(pago._id, 'metodo', event.target.value)}
                                                    >
                                                      <option value="">Selecciona el método</option>
                                                      <option value="Efectivo">Efectivo</option>
                                                      <option value="Transferencia bancaria">Transferencia bancaria</option>
                                                    </select>
                                                  ) : (
                                                    pago.metodo || '—'
                                                  )}
                                                </td>
                                                <td className="w-25">
                                                  {editForm ? (
                                                    <input
                                                      type="text"
                                                      className="form-control form-control-sm"
                                                      value={editForm.nota}
                                                      placeholder="Nota"
                                                      onChange={(event) => handlePaymentEditChange(pago._id, 'nota', event.target.value)}
                                                    />
                                                  ) : (
                                                    pago.nota || '—'
                                                  )}
                                                </td>
                                                <td className="text-end">
                                                  {editForm ? (
                                                    <div className="btn-group btn-group-sm" role="group">
                                                      <button
                                                        type="button"
                                                        className="btn btn-success"
                                                        onClick={() => handleSavePaymentEdit(pago._id)}
                                                      >
                                                        Guardar
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="btn btn-outline-secondary"
                                                        onClick={() => cancelEditPayment(pago._id)}
                                                      >
                                                        Cancelar
                                                      </button>
                                                    </div>
                                                  ) : (
                                                    <div className="btn-group btn-group-sm" role="group">
                                                      <button
                                                        className="btn btn-outline-primary"
                                                        type="button"
                                                        onClick={() => startEditPayment(factura._id, pago)}
                                                      >
                                                        Editar
                                                      </button>
                                                      <button
                                                        className="btn btn-outline-danger"
                                                        type="button"
                                                        onClick={() => handleDeletePayment(factura._id, pago._id)}
                                                      >
                                                        Eliminar
                                                      </button>
                                                    </div>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-muted">Aún no se registraron pagos para esta factura.</p>
                                  )}

                                  <div className="mt-4">
                                    <h6 className="text-uppercase text-muted">Registrar nuevo pago</h6>
                                    <div className="row g-2">
                                      <div className="col-sm-3">
                                        <label htmlFor={`nuevoPagoMonto-${factura._id}`} className="form-label form-label-sm text-muted">
                                          Monto
                                        </label>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="form-control"
                                          placeholder="Monto"
                                          id={`nuevoPagoMonto-${factura._id}`}
                                          value={getPaymentForm(factura._id).monto}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'monto', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-sm-3">
                                        <label htmlFor={`nuevoPagoFecha-${factura._id}`} className="form-label form-label-sm text-muted">
                                          Fecha de cobro
                                        </label>
                                        <input
                                          type="date"
                                          className="form-control"
                                          id={`nuevoPagoFecha-${factura._id}`}
                                          value={getPaymentForm(factura._id).fecha}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'fecha', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-sm-3">
                                        <label htmlFor={`nuevoPagoMetodo-${factura._id}`} className="form-label form-label-sm text-muted">
                                          Método
                                        </label>
                                        <select
                                          className="form-select"
                                          id={`nuevoPagoMetodo-${factura._id}`}
                                          value={getPaymentForm(factura._id).metodo || ''}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'metodo', e.target.value)}
                                        >
                                          <option value="">Selecciona el método</option>
                                          <option value="Efectivo">Efectivo</option>
                                          <option value="Transferencia bancaria">Transferencia bancaria</option>
                                        </select>
                                      </div>
                                      <div className="col-sm-3">
                                        <label htmlFor={`nuevoPagoNota-${factura._id}`} className="form-label form-label-sm text-muted">
                                          Nota (opcional)
                                        </label>
                                        <input
                                          type="text"
                                          className="form-control"
                                          placeholder="Nota"
                                          id={`nuevoPagoNota-${factura._id}`}
                                          value={getPaymentForm(factura._id).nota}
                                          onChange={(e) => handlePaymentFormChange(factura._id, 'nota', e.target.value)}
                                        />
                                      </div>
                                      <div className="col-12 d-flex justify-content-end gap-2">
                                        <button
                                          className="btn btn-outline-secondary btn-sm"
                                          type="button"
                                          onClick={() => resetPaymentForm(factura._id)}
                                        >
                                          Limpiar
                                        </button>
                                        <button
                                          className="btn btn-primary btn-sm"
                                          type="button"
                                          onClick={() => handleRegisterPayment(factura._id)}
                                        >
                                          Registrar pago
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-5">
                                    <h6 className="text-uppercase text-muted">Pagos al centro de salud</h6>
                                    {factura.centroSalud ? (
                                      <>
                                        <p className="mb-2 small text-muted">
                                          Total a pagar: <strong>{formatCurrency(centroTotal)}</strong> · Pagado:{' '}
                                          <strong>{formatCurrency(centroPagado)}</strong> · Pendiente:{' '}
                                          <strong>{formatCurrency(centroSaldo)}</strong>
                                        </p>
                                        {factura.pagosCentro && factura.pagosCentro.length > 0 ? (
                                          <div className="table-responsive">
                                            <table className="table table-sm align-middle">
                                              <thead>
                                                <tr>
                                                  <th>Monto</th>
                                                  <th>Fecha</th>
                                                  <th>Método</th>
                                                  <th>Nota</th>
                                                  <th></th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {factura.pagosCentro.map((pago) => {
                                                  const editForm = centerPaymentEditForms[pago._id];
                                                  return (
                                                    <tr key={pago._id}>
                                                      <td className="w-25">
                                                        {editForm ? (
                                                          <input
                                                            type="number"
                                                            className="form-control form-control-sm"
                                                            min="0"
                                                            step="0.01"
                                                            value={editForm.monto}
                                                            onChange={(event) => handleCenterPaymentEditChange(pago._id, 'monto', event.target.value)}
                                                          />
                                                        ) : (
                                                          formatCurrency(pago.monto)
                                                        )}
                                                      </td>
                                                      <td className="w-25">
                                                        {editForm ? (
                                                          <input
                                                            type="date"
                                                            className="form-control form-control-sm"
                                                            value={editForm.fecha}
                                                            onChange={(event) => handleCenterPaymentEditChange(pago._id, 'fecha', event.target.value)}
                                                          />
                                                        ) : (
                                                          formatDate(pago.fecha)
                                                        )}
                                                      </td>
                                                      <td>
                                                        {editForm ? (
                                                          <select
                                                            className="form-select form-select-sm"
                                                            value={editForm.metodo}
                                                            onChange={(event) => handleCenterPaymentEditChange(pago._id, 'metodo', event.target.value)}
                                                          >
                                                            <option value="">Selecciona el método</option>
                                                            <option value="Efectivo">Efectivo</option>
                                                            <option value="Transferencia bancaria">Transferencia bancaria</option>
                                                          </select>
                                                        ) : (
                                                          pago.metodo || '—'
                                                        )}
                                                      </td>
                                                      <td className="w-25">
                                                        {editForm ? (
                                                          <input
                                                            type="text"
                                                            className="form-control form-control-sm"
                                                            value={editForm.nota}
                                                            placeholder="Nota"
                                                            onChange={(event) => handleCenterPaymentEditChange(pago._id, 'nota', event.target.value)}
                                                          />
                                                        ) : (
                                                          pago.nota || '—'
                                                        )}
                                                      </td>
                                                      <td className="text-end">
                                                        {editForm ? (
                                                          <div className="btn-group btn-group-sm" role="group">
                                                            <button
                                                              type="button"
                                                              className="btn btn-success"
                                                              onClick={() => handleSaveCenterPaymentEdit(pago._id)}
                                                            >
                                                              Guardar
                                                            </button>
                                                            <button
                                                              type="button"
                                                              className="btn btn-outline-secondary"
                                                              onClick={() => cancelEditCenterPayment(pago._id)}
                                                            >
                                                              Cancelar
                                                            </button>
                                                          </div>
                                                        ) : (
                                                          <div className="btn-group btn-group-sm" role="group">
                                                            <button
                                                              className="btn btn-outline-primary"
                                                              type="button"
                                                              onClick={() => startEditCenterPayment(factura._id, pago)}
                                                            >
                                                              Editar
                                                            </button>
                                                            <button
                                                              className="btn btn-outline-danger"
                                                              type="button"
                                                              onClick={() => handleDeleteCenterPayment(factura._id, pago._id)}
                                                            >
                                                              Eliminar
                                                            </button>
                                                          </div>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <p className="text-muted">Aún no se registraron pagos al centro para esta factura.</p>
                                        )}

                                        <div className="mt-3">
                                          <div className="row g-2">
                                            <div className="col-sm-3">
                                              <label htmlFor={`nuevoPagoCentroMonto-${factura._id}`} className="form-label form-label-sm text-muted">
                                                Monto
                                              </label>
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="form-control"
                                                placeholder="Monto"
                                                id={`nuevoPagoCentroMonto-${factura._id}`}
                                                value={getCenterPaymentForm(factura._id).monto}
                                                onChange={(e) => handleCenterPaymentFormChange(factura._id, 'monto', e.target.value)}
                                              />
                                            </div>
                                            <div className="col-sm-3">
                                              <label htmlFor={`nuevoPagoCentroFecha-${factura._id}`} className="form-label form-label-sm text-muted">
                                                Fecha de pago
                                              </label>
                                              <input
                                                type="date"
                                                className="form-control"
                                                id={`nuevoPagoCentroFecha-${factura._id}`}
                                                value={getCenterPaymentForm(factura._id).fecha}
                                                onChange={(e) => handleCenterPaymentFormChange(factura._id, 'fecha', e.target.value)}
                                              />
                                            </div>
                                            <div className="col-sm-3">
                                              <label htmlFor={`nuevoPagoCentroMetodo-${factura._id}`} className="form-label form-label-sm text-muted">
                                                Método
                                              </label>
                                              <select
                                                className="form-select"
                                                id={`nuevoPagoCentroMetodo-${factura._id}`}
                                                value={getCenterPaymentForm(factura._id).metodo || ''}
                                                onChange={(e) => handleCenterPaymentFormChange(factura._id, 'metodo', e.target.value)}
                                              >
                                                <option value="">Selecciona el método</option>
                                                <option value="Efectivo">Efectivo</option>
                                                <option value="Transferencia bancaria">Transferencia bancaria</option>
                                              </select>
                                            </div>
                                            <div className="col-sm-3">
                                              <label htmlFor={`nuevoPagoCentroNota-${factura._id}`} className="form-label form-label-sm text-muted">
                                                Nota (opcional)
                                              </label>
                                              <input
                                                type="text"
                                                className="form-control"
                                                placeholder="Nota"
                                                id={`nuevoPagoCentroNota-${factura._id}`}
                                                value={getCenterPaymentForm(factura._id).nota}
                                                onChange={(e) => handleCenterPaymentFormChange(factura._id, 'nota', e.target.value)}
                                              />
                                            </div>
                                            <div className="col-12 d-flex justify-content-end gap-2">
                                              <button
                                                className="btn btn-outline-secondary btn-sm"
                                                type="button"
                                                onClick={() => resetCenterPaymentForm(factura._id)}
                                              >
                                                Limpiar
                                              </button>
                                              <button
                                                className="btn btn-outline-primary btn-sm"
                                                type="button"
                                                onClick={() => handleRegisterCenterPayment(factura._id)}
                                              >
                                                Registrar pago al centro
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                        {centerPaymentErrors[factura._id] && (
                                          <div className="alert alert-danger mt-3 mb-0" role="alert">
                                            {centerPaymentErrors[factura._id]}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-muted">La factura no está asociada a un centro de salud.</p>
                                    )}
                                  </div>

                                  <div className="mt-5">
                                    <h6 className="text-uppercase text-muted">Documentos adjuntos</h6>
                                    {factura.documentos && factura.documentos.length > 0 ? (
                                      <ul className="list-group mb-3">
                                        {factura.documentos.map((documento) => (
                                          <li
                                            key={documento._id}
                                            className="list-group-item d-flex flex-column flex-lg-row gap-2 justify-content-between align-items-lg-center"
                                          >
                                            <div className="me-lg-3">
                                              <div className="fw-semibold">{documento.nombre}</div>
                                              <div className="small text-muted">
                                                {formatDateTime(documento.createdAt)} · {formatFileSize(documento.size)}
                                              </div>
                                              {documento.descripcion && (
                                                <div className="small text-muted fst-italic">{documento.descripcion}</div>
                                              )}
                                            </div>
                                            <div className="d-flex gap-2">
                                              <button
                                                type="button"
                                                className="btn btn-outline-primary btn-sm"
                                                onClick={() => handleDocumentoDownload(factura._id, documento._id)}
                                                disabled={documentDownloadLoadingId === documento._id}
                                              >
                                                {documentDownloadLoadingId === documento._id ? 'Descargando…' : 'Descargar'}
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={() => handleDocumentoDelete(factura._id, documento._id)}
                                                disabled={documentDeleteLoadingId === documento._id}
                                              >
                                                {documentDeleteLoadingId === documento._id ? 'Eliminando…' : 'Eliminar'}
                                              </button>
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-muted">Aún no se cargaron documentos para esta factura.</p>
                                    )}

                                    <form className="row g-2 align-items-end" onSubmit={(event) => handleDocumentoSubmit(event, factura._id)}>
                                      <div className="col-md-4">
                                        <label className="form-label" htmlFor={`documentoNombre-${factura._id}`}>
                                          Nombre del documento
                                        </label>
                                        <input
                                          id={`documentoNombre-${factura._id}`}
                                          type="text"
                                          className="form-control"
                                          value={getDocumentForm(factura._id).nombre || ''}
                                          onChange={(e) => handleDocumentFormChange(factura._id, 'nombre', e.target.value)}
                                          placeholder="Ej. Comprobante"
                                        />
                                      </div>
                                      <div className="col-md-4">
                                        <label className="form-label" htmlFor={`documentoDescripcion-${factura._id}`}>
                                          Descripción (opcional)
                                        </label>
                                        <input
                                          id={`documentoDescripcion-${factura._id}`}
                                          type="text"
                                          className="form-control"
                                          value={getDocumentForm(factura._id).descripcion || ''}
                                          onChange={(e) => handleDocumentFormChange(factura._id, 'descripcion', e.target.value)}
                                          placeholder="Observaciones"
                                        />
                                      </div>
                                      <div className="col-md-4">
                                        <label className="form-label" htmlFor={`documentoArchivo-${factura._id}`}>
                                          Archivo
                                        </label>
                                        <input
                                          key={documentInputKeys[factura._id] || 0}
                                          id={`documentoArchivo-${factura._id}`}
                                          type="file"
                                          className="form-control"
                                          accept=".pdf,.jpg,.jpeg"
                                          onChange={(e) => handleDocumentFileChange(factura._id, e.target.files?.[0] || null)}
                                        />
                                      </div>
                                      <div className="col-12 d-flex justify-content-end gap-2">
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary btn-sm"
                                          onClick={() => resetDocumentForm(factura._id)}
                                          disabled={documentUploadLoadingId === factura._id}
                                        >
                                          Limpiar
                                        </button>
                                        <button
                                          type="submit"
                                          className="btn btn-secondary btn-sm"
                                          disabled={documentUploadLoadingId === factura._id}
                                        >
                                          {documentUploadLoadingId === factura._id ? 'Adjuntando…' : 'Adjuntar documento'}
                                        </button>
                                      </div>
                                    </form>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

              <div className="d-md-none">
            <div className="row g-3">
              {paginatedFacturas.length === 0 ? (
                <div className="col-12">
                  <div className="alert alert-light border text-center mb-0">No hay facturas para mostrar.</div>
                </div>
              ) : (
                paginatedFacturas.map((factura) => {
                  const estado = normalizeEstado(factura);
                  const badgeClass = ESTADO_BADGES[estado] || 'bg-secondary';
                  const paymentForm = getPaymentForm(factura._id);
                  const puntoVentaValue = Number.isFinite(factura.puntoVenta) ? factura.puntoVenta : null;
                  const numeroFacturaValue = Number.isFinite(factura.numeroFactura) ? factura.numeroFactura : null;
                  const puntoVentaDisplay = puntoVentaValue ?? '—';
                  const numeroFacturaDisplay = numeroFacturaValue ?? '—';
                  const facturaDisplay = puntoVentaValue !== null || numeroFacturaValue !== null
                    ? [puntoVentaValue, numeroFacturaValue].filter((value) => value !== null).join('-')
                    : '—';
                  const montoCobrado = getMontoCobrado(factura);
                  const saldoPendiente = getSaldoPendiente(factura);
                  const centroTotal = getCentroTotal(factura);
                  const centroPagado = getCentroPagado(factura);
                  const centroSaldo = getCentroSaldoPendiente(factura);
                  const mesServicioKey = resolveMesServicio(factura);
                  const mesServicioLabel = formatMonthLabel(mesServicioKey);
                  const isVencida = esFacturaVencida(factura);
                  const isExpanded = expandedFacturaId === factura._id;
                  return (
                  <div className="col-12" key={factura._id}>
                    <div className="card shadow-sm">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <h5 className="card-title mb-1">Factura {facturaDisplay}</h5>
                            <p className="mb-1"><strong>Paciente:</strong> {factura.paciente ? `${factura.paciente.nombre} ${factura.paciente.apellido}` : 'N/A'}</p>
                            <p className="mb-1"><strong>Monto:</strong> {formatCurrency(factura.montoTotal)}</p>
                            <p className="mb-1"><strong>Emitida:</strong> {formatDate(factura.fechaEmision)}</p>
                            <p className="mb-1"><strong>Mes del servicio:</strong> {mesServicioLabel}</p>
                            <p className="mb-1">
                              <strong>Vence:</strong> {formatDate(factura.fechaVencimiento)}
                              {isVencida && <span className="badge bg-danger ms-2">Vencida</span>}
                            </p>
                          </div>
                          <span className={`badge rounded-pill ${badgeClass}`}>{ESTADO_LABELS[estado] || estado}</span>
                        </div>
                        <p className="mb-2"><strong>Saldo:</strong> {formatCurrency(saldoPendiente)}</p>
                        <p className="mb-3"><strong>Observaciones:</strong> {factura.observaciones || '—'}</p>

                        <div className="mb-3">
                          <label className="form-label">Estado de Cobranza</label>
                          <select
                            className="form-select"
                            value={estado}
                            onChange={(e) => handleEstadoUpdate(factura._id, e.target.value)}
                          >
                            {ESTADO_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="d-flex flex-wrap gap-2 mb-3">
                          <button className="btn btn-warning btn-sm" type="button" onClick={() => handleEdit(factura)}>
                            Editar
                          </button>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDelete(factura._id)}>
                            Eliminar
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            type="button"
                            onClick={() => handleLiquidarSaldo(factura)}
                            disabled={saldoPendiente <= 0}
                          >
                            Liquidar saldo
                          </button>
                          <button
                            className="btn btn-outline-primary btn-sm"
                            type="button"
                            onClick={() => toggleExpandFactura(factura._id)}
                          >
                            {isExpanded ? 'Ocultar detalles' : 'Detalles'}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mb-3 p-3 bg-light border rounded">
                            <h6 className="text-uppercase text-muted">Detalle de facturación</h6>
                            <p className="mb-1"><strong>Punto de venta:</strong> {puntoVentaDisplay}</p>
                            <p className="mb-1"><strong>Número de factura:</strong> {numeroFacturaDisplay}</p>
                            <p className="mb-1"><strong>Mes del servicio:</strong> {mesServicioLabel}</p>
                            <p className="mb-1"><strong>Monto cobrado:</strong> {formatCurrency(montoCobrado)}</p>
                            <p className="mb-1"><strong>Obra Social:</strong> {factura.obraSocial ? factura.obraSocial.nombre : 'Sin obra social'}</p>
                            <p className="mb-1"><strong>Centro:</strong> {factura.centroSalud ? `${factura.centroSalud.nombre} · Ret. ${factura.centroSalud.porcentajeRetencion}%` : 'Sin centro asociado'}</p>
                            <p className="mb-1"><strong>Total a centro:</strong> {factura.centroSalud ? formatCurrency(centroTotal) : '—'}</p>
                            <p className="mb-1"><strong>Pagado al centro:</strong> {factura.centroSalud ? formatCurrency(centroPagado) : '—'}</p>
                            <p className="mb-1"><strong>Saldo con centro:</strong> {factura.centroSalud ? formatCurrency(centroSaldo) : '—'}</p>
                          </div>
                        )}

                        <div className="mb-3">
                          <h6 className="text-uppercase text-muted">Pagos</h6>
                          {factura.pagos && factura.pagos.length > 0 ? (
                            <ul className="list-group mb-2">
                              {factura.pagos.map((pago) => {
                                const editForm = paymentEditForms[pago._id];
                                return (
                                  <li className="list-group-item" key={pago._id}>
                                    {editForm ? (
                                      <div className="row g-2">
                                        <div className="col-6">
                                          <label htmlFor={`editPagoMonto-${pago._id}`} className="form-label form-label-sm text-muted">Monto</label>
                                          <input
                                            id={`editPagoMonto-${pago._id}`}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="form-control form-control-sm"
                                            value={editForm.monto}
                                            onChange={(event) => handlePaymentEditChange(pago._id, 'monto', event.target.value)}
                                          />
                                        </div>
                                        <div className="col-6">
                                          <label htmlFor={`editPagoFecha-${pago._id}`} className="form-label form-label-sm text-muted">Fecha</label>
                                          <input
                                            id={`editPagoFecha-${pago._id}`}
                                            type="date"
                                            className="form-control form-control-sm"
                                            value={editForm.fecha}
                                            onChange={(event) => handlePaymentEditChange(pago._id, 'fecha', event.target.value)}
                                          />
                                        </div>
                                        <div className="col-6">
                                          <label htmlFor={`editPagoMetodo-${pago._id}`} className="form-label form-label-sm text-muted">Método</label>
                                          <select
                                            id={`editPagoMetodo-${pago._id}`}
                                            className="form-select form-select-sm"
                                            value={editForm.metodo}
                                            onChange={(event) => handlePaymentEditChange(pago._id, 'metodo', event.target.value)}
                                          >
                                            <option value="">Selecciona el método</option>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Transferencia bancaria">Transferencia bancaria</option>
                                          </select>
                                        </div>
                                        <div className="col-6">
                                          <label htmlFor={`editPagoNota-${pago._id}`} className="form-label form-label-sm text-muted">Nota</label>
                                          <input
                                            id={`editPagoNota-${pago._id}`}
                                            type="text"
                                            className="form-control form-control-sm"
                                            value={editForm.nota}
                                            onChange={(event) => handlePaymentEditChange(pago._id, 'nota', event.target.value)}
                                          />
                                        </div>
                                        <div className="col-12 d-flex justify-content-end gap-2">
                                          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => cancelEditPayment(pago._id)}>
                                            Cancelar
                                          </button>
                                          <button className="btn btn-success btn-sm" type="button" onClick={() => handleSavePaymentEdit(pago._id)}>
                                            Guardar
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="d-flex justify-content-between align-items-start">
                                        <div>
                                          <div>{formatCurrency(pago.monto)} • {formatDate(pago.fecha)}</div>
                                          <small className="text-muted">{pago.metodo || 'Método no especificado'} - {pago.nota || 'Sin nota'}</small>
                                        </div>
                                        <div className="btn-group btn-group-sm" role="group">
                                          <button className="btn btn-outline-primary" type="button" onClick={() => startEditPayment(factura._id, pago)}>
                                            Editar
                                          </button>
                                          <button className="btn btn-outline-danger" type="button" onClick={() => handleDeletePayment(factura._id, pago._id)}>
                                            Eliminar
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-muted">Sin pagos registrados.</p>
                          )}
                          {paymentErrors[factura._id] && (
                            <div className="alert alert-danger mt-2 mb-0" role="alert">
                              {paymentErrors[factura._id]}
                            </div>
                          )}
                        </div>

                        <div className="mb-3">
                          <h6 className="text-uppercase text-muted">Pagos al centro</h6>
                          {factura.centroSalud ? (
                            <>
                              <p className="mb-2 small text-muted">
                                Total a pagar: <strong>{formatCurrency(centroTotal)}</strong> · Pagado:{' '}
                                <strong>{formatCurrency(centroPagado)}</strong> · Pendiente:{' '}
                                <strong>{formatCurrency(centroSaldo)}</strong>
                              </p>
                              {factura.pagosCentro && factura.pagosCentro.length > 0 ? (
                                <ul className="list-group mb-2">
                                  {factura.pagosCentro.map((pago) => {
                                    const editForm = centerPaymentEditForms[pago._id];
                                    return (
                                      <li className="list-group-item" key={pago._id}>
                                        {editForm ? (
                                          <div className="row g-2">
                                            <div className="col-6">
                                              <label htmlFor={`editPagoCentroMonto-${pago._id}`} className="form-label form-label-sm text-muted">Monto</label>
                                              <input
                                                id={`editPagoCentroMonto-${pago._id}`}
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="form-control form-control-sm"
                                                value={editForm.monto}
                                                onChange={(event) => handleCenterPaymentEditChange(pago._id, 'monto', event.target.value)}
                                              />
                                            </div>
                                            <div className="col-6">
                                              <label htmlFor={`editPagoCentroFecha-${pago._id}`} className="form-label form-label-sm text-muted">Fecha</label>
                                              <input
                                                id={`editPagoCentroFecha-${pago._id}`}
                                                type="date"
                                                className="form-control form-control-sm"
                                                value={editForm.fecha}
                                                onChange={(event) => handleCenterPaymentEditChange(pago._id, 'fecha', event.target.value)}
                                              />
                                            </div>
                                            <div className="col-6">
                                              <label htmlFor={`editPagoCentroMetodo-${pago._id}`} className="form-label form-label-sm text-muted">Método</label>
                                              <select
                                                id={`editPagoCentroMetodo-${pago._id}`}
                                                className="form-select form-select-sm"
                                                value={editForm.metodo}
                                                onChange={(event) => handleCenterPaymentEditChange(pago._id, 'metodo', event.target.value)}
                                              >
                                                <option value="">Selecciona el método</option>
                                                <option value="Efectivo">Efectivo</option>
                                                <option value="Transferencia bancaria">Transferencia bancaria</option>
                                              </select>
                                            </div>
                                            <div className="col-6">
                                              <label htmlFor={`editPagoCentroNota-${pago._id}`} className="form-label form-label-sm text-muted">Nota</label>
                                              <input
                                                id={`editPagoCentroNota-${pago._id}`}
                                                type="text"
                                                className="form-control form-control-sm"
                                                value={editForm.nota}
                                                onChange={(event) => handleCenterPaymentEditChange(pago._id, 'nota', event.target.value)}
                                              />
                                            </div>
                                            <div className="col-12 d-flex justify-content-end gap-2">
                                              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => cancelEditCenterPayment(pago._id)}>
                                                Cancelar
                                              </button>
                                              <button className="btn btn-success btn-sm" type="button" onClick={() => handleSaveCenterPaymentEdit(pago._id)}>
                                                Guardar
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="d-flex justify-content-between align-items-start">
                                            <div>
                                              <div>{formatCurrency(pago.monto)} • {formatDate(pago.fecha)}</div>
                                              <small className="text-muted">{pago.metodo || 'Método no especificado'} - {pago.nota || 'Sin nota'}</small>
                                            </div>
                                            <div className="btn-group btn-group-sm" role="group">
                                              <button className="btn btn-outline-primary" type="button" onClick={() => startEditCenterPayment(factura._id, pago)}>
                                                Editar
                                              </button>
                                              <button className="btn btn-outline-danger" type="button" onClick={() => handleDeleteCenterPayment(factura._id, pago._id)}>
                                                Eliminar
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <p className="text-muted">Sin pagos registrados al centro.</p>
                              )}
                              {centerPaymentErrors[factura._id] && (
                                <div className="alert alert-danger mt-2 mb-0" role="alert">
                                  {centerPaymentErrors[factura._id]}
                                </div>
                              )}

                              <div className="row g-2 mb-2">
                                <div className="col-6">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="form-control"
                                    placeholder="Monto"
                                    value={getCenterPaymentForm(factura._id).monto}
                                    onChange={(e) => handleCenterPaymentFormChange(factura._id, 'monto', e.target.value)}
                                  />
                                </div>
                                <div className="col-6">
                                  <input
                                    type="date"
                                    className="form-control"
                                    value={getCenterPaymentForm(factura._id).fecha}
                                    onChange={(e) => handleCenterPaymentFormChange(factura._id, 'fecha', e.target.value)}
                                  />
                                </div>
                                <div className="col-6">
                                  <select
                                    className="form-select"
                                    value={getCenterPaymentForm(factura._id).metodo || ''}
                                    onChange={(e) => handleCenterPaymentFormChange(factura._id, 'metodo', e.target.value)}
                                  >
                                    <option value="">Selecciona el método</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia bancaria">Transferencia bancaria</option>
                                  </select>
                                </div>
                                <div className="col-6">
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Nota"
                                    value={getCenterPaymentForm(factura._id).nota}
                                    onChange={(e) => handleCenterPaymentFormChange(factura._id, 'nota', e.target.value)}
                                  />
                                </div>
                                <div className="col-12 d-flex justify-content-end gap-2">
                                  <button
                                    className="btn btn-outline-secondary btn-sm"
                                    type="button"
                                    onClick={() => resetCenterPaymentForm(factura._id)}
                                  >
                                    Limpiar
                                  </button>
                                  <button
                                    className="btn btn-outline-primary btn-sm"
                                    type="button"
                                    onClick={() => handleRegisterCenterPayment(factura._id)}
                                  >
                                    Registrar pago al centro
                                  </button>
                                </div>
                              </div>
                              {centerPaymentErrors[factura._id] && (
                                <div className="alert alert-danger mb-2" role="alert">
                                  {centerPaymentErrors[factura._id]}
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-muted">La factura no está asociada a un centro de salud.</p>
                          )}
                        </div>

                        <div className="mb-3">
                          <h6 className="text-uppercase text-muted">Documentos</h6>
                          {factura.documentos && factura.documentos.length > 0 ? (
                            <ul className="list-group mb-3">
                              {factura.documentos.map((documento) => (
                                <li key={documento._id} className="list-group-item">
                                  <div className="fw-semibold">{documento.nombre}</div>
                                  <div className="small text-muted">
                                    {formatDateTime(documento.createdAt)} · {formatFileSize(documento.size)}
                                  </div>
                                  {documento.descripcion && (
                                    <div className="small text-muted fst-italic">{documento.descripcion}</div>
                                  )}
                                  <div className="d-flex flex-wrap gap-2 mt-2">
                                    <button
                                      className="btn btn-outline-primary btn-sm"
                                      type="button"
                                      onClick={() => handleDocumentoDownload(factura._id, documento._id)}
                                      disabled={documentDownloadLoadingId === documento._id}
                                    >
                                      {documentDownloadLoadingId === documento._id ? 'Descargando…' : 'Descargar'}
                                    </button>
                                    <button
                                      className="btn btn-outline-danger btn-sm"
                                      type="button"
                                      onClick={() => handleDocumentoDelete(factura._id, documento._id)}
                                      disabled={documentDeleteLoadingId === documento._id}
                                    >
                                      {documentDeleteLoadingId === documento._id ? 'Eliminando…' : 'Eliminar'}
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted">Sin documentos adjuntos.</p>
                          )}

                          <form onSubmit={(event) => handleDocumentoSubmit(event, factura._id)}>
                            <div className="mb-2">
                              <label className="form-label" htmlFor={`documentoNombre-mobile-${factura._id}`}>
                                Nombre del documento
                              </label>
                              <input
                                id={`documentoNombre-mobile-${factura._id}`}
                                type="text"
                                className="form-control"
                                value={getDocumentForm(factura._id).nombre || ''}
                                onChange={(e) => handleDocumentFormChange(factura._id, 'nombre', e.target.value)}
                              />
                            </div>
                            <div className="mb-2">
                              <label className="form-label" htmlFor={`documentoDescripcion-mobile-${factura._id}`}>
                                Descripción (opcional)
                              </label>
                              <input
                                id={`documentoDescripcion-mobile-${factura._id}`}
                                type="text"
                                className="form-control"
                                value={getDocumentForm(factura._id).descripcion || ''}
                                onChange={(e) => handleDocumentFormChange(factura._id, 'descripcion', e.target.value)}
                              />
                            </div>
                            <div className="mb-3">
                              <label className="form-label" htmlFor={`documentoArchivo-mobile-${factura._id}`}>
                                Archivo
                              </label>
                              <input
                                key={`${documentInputKeys[factura._id] || 0}-mobile`}
                                id={`documentoArchivo-mobile-${factura._id}`}
                                type="file"
                                className="form-control"
                                accept=".pdf,.jpg,.jpeg"
                                onChange={(e) => handleDocumentFileChange(factura._id, e.target.files?.[0] || null)}
                              />
                            </div>
                            <div className="d-flex flex-wrap justify-content-end gap-2">
                              <button
                                className="btn btn-outline-secondary btn-sm"
                                type="button"
                                onClick={() => resetDocumentForm(factura._id)}
                                disabled={documentUploadLoadingId === factura._id}
                              >
                                Limpiar
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                type="submit"
                                disabled={documentUploadLoadingId === factura._id}
                              >
                                {documentUploadLoadingId === factura._id ? 'Adjuntando…' : 'Adjuntar documento'}
                              </button>
                            </div>
                          </form>
                        </div>

                        <div className="mb-3">
                          <h6 className="text-uppercase text-muted">Registrar pago</h6>
                          <div className="row g-2">
                            <div className="col-12">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="form-control"
                                placeholder="Monto"
                                value={paymentForm.monto}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'monto', e.target.value)}
                              />
                            </div>
                            <div className="col-12">
                              <input
                                type="date"
                                className="form-control"
                                value={paymentForm.fecha}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'fecha', e.target.value)}
                              />
                            </div>
                            <div className="col-12">
                              <select
                                className="form-select"
                                value={paymentForm.metodo || ''}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'metodo', e.target.value)}
                              >
                                <option value="">Selecciona el método</option>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Transferencia bancaria">Transferencia bancaria</option>
                              </select>
                            </div>
                            <div className="col-12">
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Nota"
                                value={paymentForm.nota}
                                onChange={(e) => handlePaymentFormChange(factura._id, 'nota', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="d-flex justify-content-end gap-2 mt-2">
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              type="button"
                              onClick={() => resetPaymentForm(factura._id)}
                            >
                              Limpiar
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => handleRegisterPayment(factura._id)}
                            >
                              Registrar pago
                            </button>
                          </div>
                          {paymentErrors[factura._id] && (
                            <div className="alert alert-danger mt-3 mb-0" role="alert">
                              {paymentErrors[factura._id]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })
              )}
            </div>
          </div>

              <nav className="d-flex justify-content-center mt-4" aria-label="Paginación de facturas">
            <ul className="pagination mb-0">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button
                  className="page-link"
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
              </li>
              {pageNumbers.map((page, index) => (
                <li
                  key={`${page}-${index}`}
                  className={`page-item ${page === currentPage ? 'active' : ''} ${typeof page === 'string' ? 'disabled' : ''}`}
                >
                  {typeof page === 'string' ? (
                    <span className="page-link">…</span>
                  ) : (
                    <button
                      className="page-link"
                      type="button"
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </button>
                  )}
                </li>
              ))}
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button
                  className="page-link"
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </button>
              </li>
            </ul>
          </nav>
        </>
      )}
        </div>
      </div>
    </div>
      </section>

    </div>
  );
}

export default FacturasPage;
