import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import facturasService from '../services/FacturasService';
import pacientesService from '../services/PacientesService';
import obrasSocialesService from '../services/ObrasSocialesService';
import centrosSaludService from '../services/CentrosSaludService';
import turnosService from '../services/TurnosService';
import userService from '../services/UserService';
import DailyAgendaTimeline from '../components/DailyAgendaTimeline.jsx';
import { useFeedback } from '../context/FeedbackContext.jsx';
import { FaMoneyBillWave, FaChartBar, FaCalendarAlt, FaAngleDoubleUp, FaAngleDoubleDown, FaHospital, FaClock, FaFileInvoiceDollar, FaUsers, FaStar, FaExclamationTriangle, FaCalendarPlus, FaUserPlus, FaPhoneAlt, FaWhatsapp, FaSms, FaBullseye, FaLightbulb } from 'react-icons/fa';
import { DASHBOARD_WIDGET_OPTIONS, DEFAULT_DASHBOARD_PREFERENCES, DASHBOARD_WIDGET_IDS, resolveDashboardPreferences } from '../constants/dashboardPreferences.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  presentada: 'Presentada',
  observada: 'Observada',
  pagada_parcial: 'Pagada parcial',
  pagada: 'Pagada',
};

const ESTADO_COLOR_MAP = {
  pendiente: { background: 'rgba(255, 193, 7, 0.6)', border: 'rgba(255, 193, 7, 1)' },
  presentada: { background: 'rgba(23, 162, 184, 0.6)', border: 'rgba(23, 162, 184, 1)' },
  observada: { background: 'rgba(220, 53, 69, 0.6)', border: 'rgba(220, 53, 69, 1)' },
  pagada_parcial: { background: 'rgba(102, 16, 242, 0.6)', border: 'rgba(102, 16, 242, 1)' },
  pagada: { background: 'rgba(40, 167, 69, 0.6)', border: 'rgba(40, 167, 69, 1)' },
};

const WEEKLY_AVAILABLE_MINUTES = 5 * 8 * 60; // 5 días hábiles de 8 horas
const SECTION_USAGE_STORAGE_KEY = 'gestio:section-usage';
const FOCUS_MODE_STORAGE_KEY = 'gestio:focus-mode';
const FOCUS_MODE_WIDGETS = new Set([
  'summaryHighlights',
  'agendaToday',
  'turnosTomorrow',
  'turnosUpcoming',
  'dateRange',
  'financialSummary',
]);

const QUICK_ACTIONS_MAP = {
  turnos: {
    id: 'quick-action-turnos',
    title: 'Crear turno de hoy',
    description: 'Organiza tu agenda en segundos y confirma pacientes desde el panel.',
    icon: FaCalendarPlus,
    to: '/turnos?crear=hoy',
    buttonLabel: 'Ir a la agenda',
  },
  pacientes: {
    id: 'quick-action-pacientes',
    title: 'Agregar paciente',
    description: 'Carga nuevos pacientes y completa sus datos de contacto rápidamente.',
    icon: FaUserPlus,
    to: '/pacientes?nuevo=1',
    buttonLabel: 'Registrar paciente',
  },
  facturas: {
    id: 'quick-action-facturas',
    title: 'Registrar factura',
    description: 'Genera comprobantes y controla tus cobranzas desde un solo lugar.',
    icon: FaFileInvoiceDollar,
    to: '/facturas?nueva=1',
    buttonLabel: 'Cargar factura',
  },
  obrasSociales: {
    id: 'quick-action-obras',
    title: 'Gestionar obra social',
    description: 'Actualiza convenios y requisitos de cada obra social sin salir del panel.',
    icon: FaUsers,
    to: '/obras-sociales',
    buttonLabel: 'Abrir obras sociales',
  },
  centrosSalud: {
    id: 'quick-action-centros',
    title: 'Sumar centro derivador',
    description: 'Integra nuevos centros de salud y vincúlales pacientes en minutos.',
    icon: FaHospital,
    to: '/centros-salud',
    buttonLabel: 'Gestionar centros',
  },
};

const QUICK_ACTION_FALLBACK_ORDER = ['turnos', 'pacientes', 'facturas', 'obrasSociales', 'centrosSalud'];

const normalizeWidgetOrder = (widgets) => {
  if (!Array.isArray(widgets)) {
    return [...DEFAULT_DASHBOARD_PREFERENCES];
  }

  return DEFAULT_DASHBOARD_PREFERENCES.filter((id) => widgets.includes(id));
};

const sanitizeDialValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[^+\d]/g, '');
};

const sanitizeWhatsappValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\D/g, '');
};

const buildContactActions = (turno) => {
  if (!turno) {
    return null;
  }

  const rawPhone = typeof turno.paciente === 'object'
    ? (turno.paciente?.telefono || turno.paciente?.telefonoMovil || '')
    : (turno.telefonoPaciente || turno.telefono || '');

  const trimmed = rawPhone?.trim();

  if (!trimmed) {
    return null;
  }

  const telValue = sanitizeDialValue(trimmed);
  const whatsappValue = sanitizeWhatsappValue(trimmed);

  const contact = {
    phoneLabel: trimmed,
    tel: telValue ? `tel:${telValue}` : null,
    sms: telValue ? `sms:${telValue}` : null,
    whatsapp: whatsappValue ? `https://wa.me/${whatsappValue}` : null,
  };

  if (!contact.tel && !contact.sms && !contact.whatsapp) {
    return null;
  }

  return contact;
};

const getLocalDateKey = (date) => {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function DashboardPage({ currentUser }) {
  const navigate = useNavigate();
  const { showError, showSuccess } = useFeedback();
  const [allFacturas, setAllFacturas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [data, setData] = useState({
    totalFacturacion: 0,
    montoPagado: 0,
    montoPendiente: 0,
    facturasPagadas: 0,
    facturasPendientes: 0,
    totalPacientes: 0,
    totalObrasSociales: 0,
    totalCentros: 0,
    centrosActivos: 0,
    totalRetencionCentros: 0,
    netoParticulares: 0,
    netoCentros: 0,
    pacientesByTipo: { particulares: 0, centro: 0 },
    centrosResumen: [],
    pieChartData: {},
    monthlyBarChartData: {},
    obrasSocialesBarChartData: {},
    facturasEstadoChartData: { labels: [], datasets: [] },
    moraObraSocialData: { labels: [], datasets: [] },
    montoMoraTotal: 0,
    monthlyInsights: { entries: [], lastMonth: null, bestMonth: null, average: 0 },
    estadoInsights: [],
    obrasSocialesInsights: { entries: [], topEntry: null, totalTop5: 0, totalGeneral: 0 },
    moraInsights: { entries: [], topEntry: null },
    turnosProximos: [],
    ocupacionSemanal: 0,
    minutosProgramadosSemana: 0,
    minutosDisponiblesSemana: WEEKLY_AVAILABLE_MINUTES,
    growthMetrics: {
      facturacion: { currentYear: 0, previousYear: 0, percentage: 0 },
      facturas: { currentYear: 0, previousYear: 0, percentage: 0 },
    },
  });
  const [turnos, setTurnos] = useState([]);
  const [preferencesOverride, setPreferencesOverride] = useState(null);
  const [isPreferencesPanelOpen, setIsPreferencesPanelOpen] = useState(false);
  const [preferencesDraft, setPreferencesDraft] = useState(() => []);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [sectionUsageRecords, setSectionUsageRecords] = useState({});
  const [isFocusMode, setIsFocusMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
    } catch (error) {
      console.warn('No se pudo recuperar la preferencia del modo enfoque.', error);
      return false;
    }
  });

  const preferencesSource = preferencesOverride ?? currentUser?.dashboardPreferences;
  const effectivePreferences = useMemo(() => {
    const resolved = resolveDashboardPreferences(preferencesSource);
    return resolved.filter((widget) => DASHBOARD_WIDGET_IDS.has(widget));
  }, [preferencesSource]);
  const activeWidgetsSet = useMemo(() => new Set(effectivePreferences), [effectivePreferences]);
  const shouldShowWidget = useCallback(
    (widgetId) => {
      if (!activeWidgetsSet.has(widgetId)) {
        return false;
      }
      if (isFocusMode && !FOCUS_MODE_WIDGETS.has(widgetId)) {
        return false;
      }
      return true;
    },
    [activeWidgetsSet, isFocusMode],
  );
  const hasUpperWidgets = useMemo(() => {
    return [
      'financialSummary',
      'administrativeMetrics',
      'collectionsHealth',
      'centersSummary',
      'agendaToday',
      'turnosTomorrow',
      'turnosUpcoming',
    ].some((widget) => shouldShowWidget(widget));
  }, [shouldShowWidget]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(SECTION_USAGE_STORAGE_KEY);
      setSectionUsageRecords(raw ? JSON.parse(raw) : {});
    } catch (error) {
      console.warn('No se pudieron recuperar las estadísticas de uso de secciones.', error);
    }
  }, []);

  useEffect(() => {
    if (!isPreferencesPanelOpen) {
      setPreferencesDraft(effectivePreferences);
    }
  }, [effectivePreferences, isPreferencesPanelOpen]);

  useEffect(() => {
    if (Array.isArray(preferencesDraft) && preferencesDraft.length > 0 && preferencesError) {
      setPreferencesError('');
    }
  }, [preferencesDraft, preferencesError]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('gestio-focus-mode', isFocusMode);
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, isFocusMode ? 'true' : 'false');
      } catch (error) {
        console.warn('No se pudo persistir la preferencia del modo enfoque.', error);
      }
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('gestio-focus-mode');
      }
    };
  }, [isFocusMode]);
  const quickActions = (() => {
    const fallback = QUICK_ACTION_FALLBACK_ORDER.map((id) => QUICK_ACTIONS_MAP[id]).filter(Boolean).slice(0, 3);

    if (typeof window === 'undefined') {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(SECTION_USAGE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const sortedIds = Object.entries(parsed)
        .filter(([section]) => Object.prototype.hasOwnProperty.call(QUICK_ACTIONS_MAP, section))
        .sort(([, aCount], [, bCount]) => Number(bCount) - Number(aCount))
        .map(([section]) => section);

      const combined = [...sortedIds, ...QUICK_ACTION_FALLBACK_ORDER];
      const uniqueIds = [];

      combined.forEach((sectionId) => {
        if (QUICK_ACTIONS_MAP[sectionId] && !uniqueIds.includes(sectionId)) {
          uniqueIds.push(sectionId);
        }
      });

      if (uniqueIds.length === 0) {
        return fallback;
      }

      return uniqueIds.slice(0, 3).map((sectionId) => QUICK_ACTIONS_MAP[sectionId]).filter(Boolean);
    } catch (error) {
      console.warn('No se pudieron leer las acciones rápidas personalizadas.', error);
      return fallback;
    }
  })();

  const shouldRenderQuickActions = !isFocusMode && quickActions.length > 0;

  const handleQuickAction = useCallback((path) => {
    if (!path) {
      return;
    }
    navigate(path);
  }, [navigate]);
  const handlePreferencesToggle = useCallback(() => {
    setIsPreferencesPanelOpen((prev) => {
      const next = !prev;
      if (!next) {
        setPreferencesDraft(effectivePreferences);
        setPreferencesError('');
      }
      return next;
    });
  }, [effectivePreferences]);

  const handlePreferencesCancel = useCallback(() => {
    setIsPreferencesPanelOpen(false);
    setPreferencesError('');
    setPreferencesDraft(effectivePreferences);
  }, [effectivePreferences]);

  const handleWidgetToggle = useCallback((widgetId) => {
    if (!DASHBOARD_WIDGET_IDS.has(widgetId)) {
      return;
    }

    setPreferencesDraft((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (current.includes(widgetId)) {
        const filtered = current.filter((id) => id !== widgetId);
        return normalizeWidgetOrder(filtered);
      }

      return normalizeWidgetOrder([...current, widgetId]);
    });
  }, []);

  const handleSavePreferences = useCallback(async () => {
    if (!Array.isArray(preferencesDraft) || preferencesDraft.length === 0) {
      setPreferencesError('Selecciona al menos un módulo para tu panel.');
      return;
    }

    const normalizedDraft = normalizeWidgetOrder(preferencesDraft);

    setIsSavingPreferences(true);
    try {
      await userService.updateProfile({ dashboardPreferences: normalizedDraft });
      setPreferencesOverride(normalizedDraft);
      setIsPreferencesPanelOpen(false);
      setPreferencesDraft(normalizedDraft);
      setPreferencesError('');
      showSuccess('Guardamos tu selección de módulos.');

      if (typeof window !== 'undefined') {
        try {
          const storedUserRaw = window.localStorage.getItem('user');
          if (storedUserRaw) {
            const storedUser = JSON.parse(storedUserRaw);
            const updatedUser = { ...storedUser, dashboardPreferences: normalizedDraft };
            window.localStorage.setItem('user', JSON.stringify(updatedUser));
          }
        } catch (storageError) {
          console.warn('No se pudo sincronizar la preferencia de módulos en almacenamiento local.', storageError);
        }
      }
    } catch (error) {
      console.error('No se pudieron guardar las preferencias del panel.', error);
      showError('No pudimos guardar tus módulos favoritos. Intenta nuevamente.');
    } finally {
      setIsSavingPreferences(false);
    }
  }, [preferencesDraft, showError, showSuccess]);

  const handleFocusModeToggle = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

  const formatNumber = (number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(number);
  };

  const formatCompactCurrency = (value) => {
    if (!Number.isFinite(value)) {
      return 'AR$ 0';
    }
    const absValue = Math.abs(value);
    const formatted = new Intl.NumberFormat('es-AR', {
      notation: 'compact',
      maximumFractionDigits: absValue >= 100 ? 1 : 0,
    }).format(value);
    return `AR$ ${formatted}`;
  };

  const formatCompactNumber = (value) => {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const absValue = Math.abs(value);
    return new Intl.NumberFormat('es-AR', {
      notation: 'compact',
      maximumFractionDigits: absValue >= 100 ? 1 : 0,
    }).format(value);
  };

  const formatPercentage = (value) => {
    if (!Number.isFinite(value)) {
      return '0%';
    }
    const decimals = Math.abs(value) >= 10 ? 0 : 1;
    const multiplier = 10 ** decimals;
    const rounded = Math.round(value * multiplier) / multiplier;
    return `${rounded.toFixed(decimals)}%`;
  };

  const formatMinutes = (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return '0 h';
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    if (hours === 0) {
      return `${remainingMinutes} min`;
    }
    if (remainingMinutes === 0) {
      return `${hours} h`;
    }
    return `${hours} h ${remainingMinutes} min`;
  };

  const formatDateTime = (value) => {
    if (!value) {
      return 'Sin fecha';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Sin fecha';
    }
    return date.toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const buildAgendaMetrics = useCallback((turnosList) => {
    const now = new Date();
    const upcoming = Array.isArray(turnosList)
      ? [...turnosList]
        .filter((turno) => {
          const fecha = new Date(turno.fecha);
          return !Number.isNaN(fecha.getTime()) && fecha >= now;
        })
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .slice(0, 5)
        .map((turno) => ({
          _id: turno._id,
          fecha: turno.fecha,
          titulo: turno.titulo || 'Consulta',
          estado: turno.estado,
          paciente: turno.paciente ? `${turno.paciente.nombre} ${turno.paciente.apellido}` : 'Paciente',
          duracionMinutos: turno.duracionMinutos || 0,
        }))
      : [];

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const programadosSemana = Array.isArray(turnosList)
      ? turnosList.filter((turno) => {
        const fecha = new Date(turno.fecha);
        return !Number.isNaN(fecha.getTime()) && fecha >= startOfWeek && fecha <= endOfWeek;
      })
      : [];

    const minutosProgramados = programadosSemana.reduce((sum, turno) => sum + (turno.duracionMinutos || 0), 0);
    const ocupacion = WEEKLY_AVAILABLE_MINUTES > 0
      ? Math.min((minutosProgramados / WEEKLY_AVAILABLE_MINUTES) * 100, 100)
      : 0;

    return {
      upcoming,
      minutosProgramados,
      ocupacion,
    };
  }, []);

  const userDisplayName = (() => {
    if (!currentUser) {
      return 'Profesional';
    }
    const fullName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim();
    return fullName || currentUser.username || 'Profesional';
  })();
  
  // Función de callback para procesar los datos
  const processAndSetData = useCallback((facturasToProcess) => {
    const filteredFacturas = facturasToProcess.filter(f => {
      const fechaEmision = new Date(f.fechaEmision);
      const startDate = dateRange.startDate ? new Date(dateRange.startDate + 'T00:00:00') : null;
      const endDate = dateRange.endDate ? new Date(dateRange.endDate + 'T23:59:59') : null;
      
      const isAfterStart = startDate ? fechaEmision >= startDate : true;
      const isBeforeEnd = endDate ? fechaEmision <= endDate : true;
      
      return isAfterStart && isBeforeEnd;
    });

    const montoPagado = filteredFacturas.filter(f => f.pagado).reduce((sum, f) => sum + f.montoTotal, 0);
    const montoPendiente = filteredFacturas.filter(f => !f.pagado).reduce((sum, f) => sum + f.montoTotal, 0);
    const totalFacturacion = montoPagado + montoPendiente;
    const facturasPagadas = filteredFacturas.filter(f => f.pagado).length;
    const facturasPendientes = filteredFacturas.filter(f => !f.pagado).length;

    const pieChartData = {
      labels: ['Facturas Pagadas', 'Facturas Pendientes'],
      datasets: [{
        label: '# de Facturas',
        data: [facturasPagadas, facturasPendientes],
        backgroundColor: ['rgba(40, 167, 69, 0.7)', 'rgba(220, 53, 69, 0.7)'],
        borderColor: ['rgba(40, 167, 69, 1)', 'rgba(220, 53, 69, 1)'],
        borderWidth: 1,
      }],
    };

    const monthlyData = {};
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    filteredFacturas.forEach(f => {
      const date = new Date(f.fechaEmision);
      const month = date.getMonth();
      const year = date.getFullYear();
      const key = `${monthNames[month]} ${year}`;
      if (!monthlyData[key]) {
        monthlyData[key] = 0;
      }
      monthlyData[key] += f.montoTotal;
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(a.replace(/(\w{3})\s(\d{4})/, '1 $1 $2')) - new Date(b.replace(/(\w{3})\s(\d{4})/, '1 $1 $2')));
    const monthlyBarChartData = {
      labels: sortedMonths,
      datasets: [{
        label: 'Facturación Mensual',
        data: sortedMonths.map(month => monthlyData[month]),
        backgroundColor: 'rgba(23, 162, 184, 0.6)',
        borderColor: 'rgba(23, 162, 184, 1)',
        borderWidth: 1,
      }],
    };
    const monthlyEntries = sortedMonths.map((label) => ({
      label,
      total: monthlyData[label],
    }));
    const lastMonthEntry = monthlyEntries.length > 0 ? monthlyEntries[monthlyEntries.length - 1] : null;
    const bestMonthEntry = monthlyEntries.reduce((best, entry) => {
      if (!best || entry.total > best.total) {
        return entry;
      }
      return best;
    }, null);
    const monthlyAverage = monthlyEntries.length > 0
      ? monthlyEntries.reduce((sum, entry) => sum + entry.total, 0) / monthlyEntries.length
      : 0;
    const monthlyInsights = {
      entries: monthlyEntries,
      lastMonth: lastMonthEntry,
      bestMonth: bestMonthEntry,
      average: monthlyAverage,
    };

    const totalParticulares = filteredFacturas
      .filter((factura) => !factura.centroSalud)
      .reduce((sum, factura) => sum + (factura.montoTotal || 0), 0);

    const centrosResumen = calculateCentrosResumen(filteredFacturas, centros);
    const totalRetencionCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalRetencion, 0);
    const totalNetoCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalNeto, 0);
    const centrosActivos = centrosResumen.filter((centro) => centro.totalFacturado > 0).length;

    const estadoCounts = filteredFacturas.reduce((acc, factura) => {
      const estadoFactura = factura.estado || (factura.pagado ? 'pagada' : 'pendiente');
      acc[estadoFactura] = (acc[estadoFactura] || 0) + 1;
      return acc;
    }, {});

    const estadoKeys = Object.keys(estadoCounts);
    const totalEstados = estadoKeys.reduce((sum, key) => sum + estadoCounts[key], 0);
    const estadoInsights = estadoKeys
      .map((estado) => ({
        key: estado,
        label: ESTADO_LABELS[estado] || estado,
        count: estadoCounts[estado],
        percentage: totalEstados > 0 ? (estadoCounts[estado] / totalEstados) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const facturasEstadoChartData = estadoKeys.length > 0
      ? {
          labels: estadoKeys.map((estado) => ESTADO_LABELS[estado] || estado),
          datasets: [{
            label: 'Cantidad de facturas',
            data: estadoKeys.map((estado) => estadoCounts[estado]),
            backgroundColor: estadoKeys.map((estado) => ESTADO_COLOR_MAP[estado]?.background || 'rgba(0,0,0,0.15)'),
            borderColor: estadoKeys.map((estado) => ESTADO_COLOR_MAP[estado]?.border || 'rgba(0,0,0,0.3)'),
            borderWidth: 1,
          }],
        }
      : {
          labels: ['Sin datos'],
          datasets: [{
            label: 'Cantidad de facturas',
            data: [0],
            backgroundColor: ['rgba(108, 117, 125, 0.4)'],
            borderColor: ['rgba(108, 117, 125, 1)'],
            borderWidth: 1,
          }],
        };

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const moraPorObra = filteredFacturas.reduce((acc, factura) => {
      const fechaVencimiento = factura.fechaVencimiento ? new Date(factura.fechaVencimiento) : null;
      const saldoPendiente = Number.isFinite(factura.saldoPendiente)
        ? factura.saldoPendiente
        : Math.max((factura.montoTotal || 0) - (factura.montoCobrado || 0), 0);
      if (fechaVencimiento && !Number.isNaN(fechaVencimiento.getTime()) && fechaVencimiento < hoy && saldoPendiente > 0.5) {
        const nombreObra = factura.obraSocial?.nombre || 'Sin obra social';
        acc[nombreObra] = (acc[nombreObra] || 0) + saldoPendiente;
      }
      return acc;
    }, {});

    const moraEntries = Object.entries(moraPorObra).sort(([, a], [, b]) => b - a);
    const moraObraSocialData = moraEntries.length > 0
      ? {
          labels: moraEntries.map(([nombre]) => nombre),
          datasets: [{
            label: 'Saldo vencido',
            data: moraEntries.map(([, monto]) => monto),
            backgroundColor: 'rgba(220, 53, 69, 0.6)',
            borderColor: 'rgba(220, 53, 69, 1)',
            borderWidth: 1,
          }],
        }
      : {
          labels: ['Sin datos'],
          datasets: [{
            label: 'Saldo vencido',
            data: [0],
            backgroundColor: ['rgba(108, 117, 125, 0.4)'],
            borderColor: ['rgba(108, 117, 125, 1)'],
            borderWidth: 1,
          }],
        };

    const montoMoraTotal = moraEntries.reduce((sum, [, monto]) => sum + monto, 0);
    const moraInsights = {
      entries: moraEntries.map(([nombre, monto]) => ({
        nombre,
        monto,
        percentage: montoMoraTotal > 0 ? (monto / montoMoraTotal) * 100 : 0,
      })),
      topEntry: moraEntries.length > 0
        ? {
            nombre: moraEntries[0][0],
            monto: moraEntries[0][1],
            percentage: montoMoraTotal > 0 ? (moraEntries[0][1] / montoMoraTotal) * 100 : 0,
          }
        : null,
    };

    const obrasSocialesSummary = buildObrasSocialesSummary(filteredFacturas);

    setData(prevData => ({
      ...prevData,
      totalFacturacion,
      montoPagado,
      montoPendiente,
      facturasPagadas,
      facturasPendientes,
      pieChartData,
      monthlyBarChartData,
      monthlyInsights,
      centrosResumen,
      totalRetencionCentros,
      centrosActivos,
      netoParticulares: totalParticulares,
      netoCentros: totalNetoCentros,
      facturasEstadoChartData,
      estadoInsights,
      moraObraSocialData,
      montoMoraTotal,
      moraInsights,
      obrasSocialesBarChartData: obrasSocialesSummary.chartData,
      obrasSocialesInsights: obrasSocialesSummary.insights,
    }));
  }, [dateRange, centros]);

  const calculateGrowthMetrics = (facturas) => {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const currentYearFacturas = facturas.filter(f => new Date(f.fechaEmision).getFullYear() === currentYear);
    const previousYearFacturas = facturas.filter(f => new Date(f.fechaEmision).getFullYear() === previousYear);

    const currentYearTotal = currentYearFacturas.reduce((sum, f) => sum + f.montoTotal, 0);
    const previousYearTotal = previousYearFacturas.reduce((sum, f) => sum + f.montoTotal, 0);

    const facturacionPercentage = previousYearTotal > 0
      ? ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100
      : (currentYearTotal > 0 ? 100 : 0);

    const facturasCountPercentage = previousYearFacturas.length > 0
      ? ((currentYearFacturas.length - previousYearFacturas.length) / previousYearFacturas.length) * 100
      : (currentYearFacturas.length > 0 ? 100 : 0);

    return {
      facturacion: {
        currentYear: currentYearTotal,
        previousYear: previousYearTotal,
        percentage: facturacionPercentage,
      },
      facturas: {
        currentYear: currentYearFacturas.length,
        previousYear: previousYearFacturas.length,
        percentage: facturasCountPercentage,
      },
    };
  };

  const buildObrasSocialesSummary = (facturas) => {
    const facturasArray = Array.isArray(facturas) ? facturas : [];
    const obrasSocialesData = facturasArray.reduce((acc, f) => {
      if (f.obraSocial?.nombre) {
        acc[f.obraSocial.nombre] = (acc[f.obraSocial.nombre] || 0) + (f.montoTotal || 0);
      }
      return acc;
    }, {});

    const sortedObrasSociales = Object.entries(obrasSocialesData)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    const totalGeneral = Object.values(obrasSocialesData).reduce((sum, monto) => sum + monto, 0);
    const totalTop5 = sortedObrasSociales.reduce((sum, [, monto]) => sum + monto, 0);

    const entries = sortedObrasSociales.map(([nombre, monto]) => ({
      nombre,
      monto,
      percentage: totalGeneral > 0 ? (monto / totalGeneral) * 100 : 0,
    }));

    return {
      chartData: {
        labels: sortedObrasSociales.map(([nombre]) => nombre),
        datasets: [{
          label: 'Monto facturado',
          data: sortedObrasSociales.map(([, monto]) => monto),
          backgroundColor: 'rgba(52, 58, 64, 0.6)',
          borderColor: 'rgba(52, 58, 64, 1)',
          borderWidth: 1,
        }],
      },
      insights: {
        entries,
        topEntry: entries.length > 0 ? entries[0] : null,
        totalTop5,
        totalGeneral,
      },
    };
  };

  const calculateCentrosResumen = (facturas, centros) => {
    const centrosArray = Array.isArray(centros) ? centros : [];

    const centrosMap = centrosArray.reduce((acc, centro) => {
      acc[centro._id] = {
        _id: centro._id,
        nombre: centro.nombre,
        porcentajeRetencion: centro.porcentajeRetencion || 0,
        totalFacturado: 0,
        totalRetencion: 0,
        totalNeto: 0,
      };
      return acc;
    }, {});

    facturas.forEach((factura) => {
      const centroId = factura.centroSalud?._id || factura.centroSalud;
      if (!centroId) {
        return;
      }

      if (!centrosMap[centroId]) {
        centrosMap[centroId] = {
          _id: centroId,
          nombre: factura.centroSalud?.nombre || 'Centro no registrado',
          porcentajeRetencion: factura.centroSalud?.porcentajeRetencion || 0,
          totalFacturado: 0,
          totalRetencion: 0,
          totalNeto: 0,
        };
      }

      const referencia = centrosMap[centroId];
      const porcentaje = referencia.porcentajeRetencion || 0;
      const monto = factura.montoTotal || 0;
      referencia.totalFacturado += monto;
      const retencion = monto * (porcentaje / 100);
      referencia.totalRetencion += retencion;
      referencia.totalNeto += monto - retencion;
    });

    return Object.values(centrosMap).sort((a, b) => b.totalRetencion - a.totalRetencion);
  };

  // useEffect para la carga inicial de datos
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const now = new Date();
        const horizon = new Date(now);
        horizon.setDate(horizon.getDate() + 30);

        const [facturas, pacientesResponse, obrasSociales, centros, turnosResponse] = await Promise.all([
          facturasService.getFacturas(),
          pacientesService.getPacientes({ limit: 0 }),
          obrasSocialesService.getObrasSociales(),
          centrosSaludService.getCentros(),
          turnosService.getTurnos({ desde: now.toISOString(), hasta: horizon.toISOString() }),
        ]);
        const pacientesData = Array.isArray(pacientesResponse?.data) ? pacientesResponse.data : [];
        const pacientesSummary = pacientesResponse?.summary || {};
        const pacientesByTipo = {
          particulares: pacientesSummary.particulares ?? pacientesData.filter((p) => p.tipoAtencion !== 'centro').length,
          centro: pacientesSummary.porCentro ?? pacientesData.filter((p) => p.tipoAtencion === 'centro').length,
        };
        const centrosResumen = calculateCentrosResumen(facturas, centros);
        const totalRetencionCentros = centrosResumen.reduce((sum, centro) => sum + centro.totalRetencion, 0);
        const centrosActivos = centrosResumen.filter((centro) => centro.totalFacturado > 0).length;
        const obrasSocialesSummary = buildObrasSocialesSummary(facturas);
        setAllFacturas(facturas);
        setCentros(centros);
        const turnosData = Array.isArray(turnosResponse?.agenda)
          ? turnosResponse.agenda
          : (Array.isArray(turnosResponse?.data) ? turnosResponse.data : []);
        setTurnos(turnosData);
        const agendaMetrics = buildAgendaMetrics(turnosData);
        // Los datos de pacientes y obras sociales no necesitan filtrarse por fecha
        setData(prevData => ({
          ...prevData,
          totalPacientes: pacientesSummary.total ?? pacientesData.length,
          totalObrasSociales: obrasSociales.length,
          totalCentros: centros.length,
          centrosActivos,
          totalRetencionCentros,
          pacientesByTipo,
          centrosResumen,
          obrasSocialesBarChartData: obrasSocialesSummary.chartData,
          obrasSocialesInsights: obrasSocialesSummary.insights,
          growthMetrics: calculateGrowthMetrics(facturas),
          turnosProximos: agendaMetrics.upcoming,
          ocupacionSemanal: agendaMetrics.ocupacion,
          minutosProgramadosSemana: agendaMetrics.minutosProgramados,
        }));
      } catch (error) {
        console.error('Error fetching initial dashboard data:', error);
      }
    };
    fetchInitialData();
  }, [buildAgendaMetrics]);

  // useEffect para procesar datos cuando cambian las facturas o el rango de fechas
  useEffect(() => {
    processAndSetData(allFacturas);
  }, [allFacturas, processAndSetData]);

  const handleDateChange = (e) => {
    setDateRange({
      ...dateRange,
      [e.target.name]: e.target.value,
    });
  };

  const applyDateFilter = () => {
    // Al hacer clic, se actualiza el estado de dateRange, lo que activa el useEffect
    // para procesar los datos filtrados.
    // No necesitamos llamar a fetchData() aquí de nuevo.
    processAndSetData(allFacturas);
  };
  
  const tooltipCurrencyFormatter = (context) => {
    const parsed = context.parsed || {};
    const rawValue = Number.isFinite(parsed.y) ? parsed.y : parsed.x;
    if (!Number.isFinite(rawValue)) {
      return context.formattedValue;
    }
    const label = context.dataset?.label ? `${context.dataset.label}: ` : '';
    return `${label}${formatNumber(rawValue)}`;
  };

  const tooltipCountFormatter = (context) => {
    const parsed = context.parsed || {};
    const rawValue = Number.isFinite(parsed.y) ? parsed.y : parsed.x;
    if (!Number.isFinite(rawValue)) {
      return context.formattedValue;
    }
    const label = context.dataset?.label ? `${context.dataset.label}: ` : '';
    return `${label}${new Intl.NumberFormat('es-AR').format(rawValue)}`;
  };

  const currencyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: tooltipCurrencyFormatter } },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value) => formatCompactCurrency(value) },
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
      },
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
      },
    },
  };

  const countChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: tooltipCountFormatter } },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value) => formatCompactNumber(value) },
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
      },
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
      },
    },
  };

  const horizontalCurrencyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: tooltipCurrencyFormatter } },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { callback: (value) => formatCompactCurrency(value) },
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
      },
    },
  };

  const renderGrowthIcon = (percentage) => {
    if (percentage > 0) {
      return <FaAngleDoubleUp className="text-success me-1" />;
    } else if (percentage < 0) {
      return <FaAngleDoubleDown className="text-danger me-1" />;
    }
    return null;
  };

  const cobranzaRate = data.totalFacturacion > 0
    ? Math.round((data.montoPagado / data.totalFacturacion) * 100)
    : 0;
  const facturasTotal = data.facturasPagadas + data.facturasPendientes;
  const facturasPendientesRate = facturasTotal > 0
    ? Math.round((data.facturasPendientes / facturasTotal) * 100)
    : 0;
  const averageTicket = data.totalPacientes > 0
    ? data.totalFacturacion / Math.max(data.totalPacientes, 1)
    : 0;

  const hoyDate = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const mananaDate = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 1);
    return date;
  }, []);

  const agendaHoy = useMemo(() => getLocalDateKey(hoyDate), [hoyDate]);
  const agendaManana = useMemo(() => getLocalDateKey(mananaDate), [mananaDate]);

  const turnosHoy = useMemo(() => {
    if (!Array.isArray(turnos) || !agendaHoy) {
      return [];
    }
    return turnos.filter((turno) => {
      const fecha = new Date(turno.fecha);
      return !Number.isNaN(fecha.getTime()) && getLocalDateKey(fecha) === agendaHoy;
    });
  }, [agendaHoy, turnos]);

  const turnosManana = useMemo(() => {
    if (!Array.isArray(turnos) || !agendaManana) {
      return [];
    }
    return turnos
      .filter((turno) => {
        const fecha = new Date(turno.fecha);
        return !Number.isNaN(fecha.getTime()) && getLocalDateKey(fecha) === agendaManana;
      })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }, [agendaManana, turnos]);

  const turnosPosteriores = useMemo(() => {
    if (!Array.isArray(turnos)) {
      return [];
    }
    const dayAfterTomorrow = new Date(mananaDate.getTime());
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    return turnos
      .filter((turno) => {
        const fecha = new Date(turno.fecha);
        return !Number.isNaN(fecha.getTime()) && fecha >= dayAfterTomorrow;
      })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .slice(0, 5);
  }, [mananaDate, turnos]);

  const userProfession = (currentUser?.profession && currentUser.profession.trim()) || '';
  const monthlyInsights = data.monthlyInsights || { entries: [], lastMonth: null, bestMonth: null, average: 0 };
  const estadoResumen = data.estadoInsights || [];
  const totalFacturasEstados = estadoResumen.reduce((sum, estado) => sum + estado.count, 0);
  const obrasSocialesResumen = data.obrasSocialesInsights || { entries: [], topEntry: null, totalTop5: 0, totalGeneral: 0 };
  const coberturaTop5 = obrasSocialesResumen.totalGeneral > 0
    ? (obrasSocialesResumen.totalTop5 / obrasSocialesResumen.totalGeneral) * 100
    : 0;
  const obrasSocialesEntries = obrasSocialesResumen.entries || [];

  const suggestions = useMemo(() => {
    const tips = [];
    const pendingAmount = Number(data.montoPendiente) || 0;
    const paidAmount = Number(data.montoPagado) || 0;
    const pendingCount = Number(data.facturasPendientes) || 0;
    const observadas = estadoResumen.find((estado) => estado.estado === 'observada')?.count || 0;
    const turnosSinConfirmar = turnosHoy.filter((turno) => (turno.estado || '').toLowerCase() !== 'confirmado').length;
    const turnosMananaCount = turnosManana.length;
    const upcomingCount = turnosPosteriores.length;
    const usageFacturas = Number(sectionUsageRecords.facturas) || 0;
    const usageTurnos = Number(sectionUsageRecords.turnos) || 0;
    const centrosInactivos = Math.max(0, (Number(data.totalCentros) || 0) - (Number(data.centrosActivos) || 0));

    if (pendingAmount > 0 && (pendingAmount >= paidAmount * 0.6 || pendingCount >= 3 || usageFacturas < 2)) {
      tips.push({
        id: 'pending-billing',
        title: 'Seguimiento de cobranzas pendiente',
        description: `Tienes ${pendingCount} factura${pendingCount === 1 ? '' : 's'} sin cobrar por ${formatNumber(pendingAmount)}. Agenda recordatorios para acelerar los pagos.`,
        action: '/facturas?estado=pendiente',
        actionLabel: 'Ver facturas pendientes',
      });
    }

    if (observadas > 0) {
      tips.push({
        id: 'observed-invoices',
        title: 'Resuelve facturas observadas',
        description: `Detectamos ${observadas} comprobante${observadas === 1 ? '' : 's'} observados. Resolverlos evita demoras en la cobranza.`,
        action: '/facturas?estado=observada',
        actionLabel: 'Ir a facturación',
      });
    }

    if (turnosSinConfirmar > 0) {
      tips.push({
        id: 'confirm-appointments',
        title: 'Confirma los turnos del día',
        description: `Hay ${turnosSinConfirmar} turno${turnosSinConfirmar === 1 ? '' : 's'} de hoy sin confirmar. Un mensaje rápido reduce ausencias.`,
        action: '/turnos',
        actionLabel: 'Abrir agenda',
      });
    } else if (turnosMananaCount > 0 && (upcomingCount < 2 || usageTurnos < 2)) {
      tips.push({
        id: 'plan-next-day',
        title: 'Prepará la agenda de mañana',
        description: `Tienes ${turnosMananaCount} turno${turnosMananaCount === 1 ? '' : 's'} agendado${turnosMananaCount === 1 ? '' : 's'} para mañana. Revisa disponibilidad para sumar nuevos pacientes.`,
        action: '/turnos',
        actionLabel: 'Ver agenda',
      });
    }

    if (centrosInactivos > 0) {
      tips.push({
        id: 'reactivate-centers',
        title: 'Revisa centros sin actividad reciente',
        description: `${centrosInactivos} centro${centrosInactivos === 1 ? '' : 's'} derivador${centrosInactivos === 1 ? '' : 'es'} no registran facturación reciente. Actualiza convenios o contacta a tus referentes.`,
        action: '/centros-salud',
        actionLabel: 'Gestionar centros',
      });
    }

    if (coberturaTop5 > 65 && obrasSocialesEntries.length > 0) {
      tips.push({
        id: 'diversify-insurers',
        title: 'Diversifica convenios clave',
        description: `El top 5 de obras sociales concentra el ${Math.round(coberturaTop5)}% de tu facturación. Evalúa sumar opciones para reducir riesgos.`,
        action: '/obras-sociales',
        actionLabel: 'Ver obras sociales',
      });
    }

    const uniqueTips = tips.filter((tip, index, array) => array.findIndex((item) => item.id === tip.id) === index).slice(0, 3);

    if (uniqueTips.length === 0) {
      uniqueTips.push({
        id: 'all-good',
        title: 'Todo en orden',
        description: 'Tus indicadores se mantienen estables. Reserva unos minutos para revisar agenda y cobranzas y sostener el ritmo.',
      });
    }

    return uniqueTips;
  }, [coberturaTop5, data.centrosActivos, data.montoPagado, data.montoPendiente, data.totalCentros, estadoResumen, obrasSocialesEntries.length, sectionUsageRecords.facturas, sectionUsageRecords.turnos, turnosHoy, turnosManana, turnosPosteriores]);

  return (
    <div className={`container mt-4 dashboard-root ${isFocusMode ? 'dashboard-root--focus' : ''}`}>
      <div className="mb-4 text-center text-md-start">
        <div className="d-flex flex-column flex-sm-row align-items-center justify-content-center justify-content-sm-start gap-3">
          <h2 className="fw-bold mb-0">Hola, {userDisplayName} 👋</h2>
          {userProfession ? (
            <div className="d-inline-flex flex-wrap align-items-center gap-2 px-3 py-2 rounded-pill bg-primary-subtle text-primary fw-semibold">
              <span className="text-uppercase small text-primary fw-semibold">Tu profesión</span>
              <span className="text-primary">{userProfession}</span>
            </div>
          ) : null}
        </div>
        {!userProfession && (
          <p className="text-muted small mt-3 mb-2">Actualiza tu profesión desde el perfil para personalizar las métricas.</p>
        )}
        <p className="text-muted mb-0 mt-3 mt-sm-2">Este resumen ejecutivo reúne tus principales indicadores asistenciales y financieros.</p>
      </div>
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3">
          <div>
            <h5 className="card-title mb-1 d-flex align-items-center gap-2">
              <FaBullseye className="text-primary" /> Personaliza tu panel
            </h5>
            <p className="text-muted small mb-0">
              Selecciona los módulos visibles y activa el modo enfoque para trabajar sin distracciones.
            </p>
          </div>
          <div className="d-flex flex-column flex-sm-row gap-2 w-100 w-lg-auto">
            <button type="button" className="btn btn-outline-primary" onClick={handlePreferencesToggle}>
              {isPreferencesPanelOpen ? 'Ocultar selección' : 'Elegir módulos'}
            </button>
            <button
              type="button"
              className={`btn ${isFocusMode ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={handleFocusModeToggle}
              aria-pressed={isFocusMode}
            >
              {isFocusMode ? 'Salir de modo enfoque' : 'Modo enfoque'}
            </button>
          </div>
        </div>
        {isFocusMode ? (
          <div className="alert alert-info mb-0 rounded-0 rounded-bottom">
            El modo enfoque mantiene solo los indicadores esenciales. Desactívalo para volver a ver el panel completo.
          </div>
        ) : null}
        {isPreferencesPanelOpen && (
          <div className="card-body border-top pt-3">
            {preferencesError && <div className="alert alert-danger mb-3">{preferencesError}</div>}
            <div className="row g-3">
              {DASHBOARD_WIDGET_OPTIONS.map((option) => {
                const isChecked = Array.isArray(preferencesDraft) && preferencesDraft.includes(option.id);
                return (
                  <div key={option.id} className="col-md-6 col-xl-4">
                    <label className={`widget-option d-flex align-items-start gap-3 p-3 rounded-3 h-100 ${isChecked ? 'widget-option--active' : ''}`}>
                      <input
                        type="checkbox"
                        className="form-check-input mt-1"
                        checked={isChecked}
                        onChange={() => handleWidgetToggle(option.id)}
                      />
                      <div>
                        <p className="fw-semibold mb-1">{option.label}</p>
                        <p className="text-muted small mb-0">{option.description}</p>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn btn-outline-secondary" onClick={handlePreferencesCancel} disabled={isSavingPreferences}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSavePreferences} disabled={isSavingPreferences}>
                {isSavingPreferences ? 'Guardando...' : 'Guardar selección'}
              </button>
            </div>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body">
            <h5 className="card-title d-flex align-items-center gap-2 mb-3">
              <FaLightbulb className="text-warning" /> Sugerencias contextuales
            </h5>
            <ul className="list-group list-group-flush">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className="list-group-item d-flex flex-column flex-md-row align-items-md-center gap-2">
                  <div>
                    <p className="fw-semibold mb-1">{suggestion.title}</p>
                    <p className="text-muted small mb-0">{suggestion.description}</p>
                  </div>
                  {suggestion.action ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary ms-md-auto"
                      onClick={() => handleQuickAction(suggestion.action)}
                    >
                      {suggestion.actionLabel || 'Ver detalle'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {shouldRenderQuickActions && (
        <div className="row g-3 mb-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <div key={action.id} className="col-md-4">
                <div className="card shadow-sm border-0 h-100">
                  <div className="card-body d-flex flex-column gap-3">
                    <div className="d-flex align-items-center gap-3">
                      <span className="display-6 text-primary d-inline-flex align-items-center justify-content-center rounded-circle bg-primary-subtle p-3">
                        <Icon />
                      </span>
                      <h5 className="mb-0">{action.title}</h5>
                    </div>
                    <p className="text-muted small mb-0 flex-grow-1">{action.description}</p>
                    <button type="button" className="btn btn-outline-primary align-self-start" onClick={() => handleQuickAction(action.to)}>
                      {action.buttonLabel || 'Ver más'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shouldShowWidget('summaryHighlights') && (
        <div className="row g-3 mb-4">
          <div className="col-xl-3 col-md-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-body">
                <p className="text-muted mb-1">Facturación acumulada</p>
                <h4 className="fw-bold mb-1">{formatNumber(data.totalFacturacion)}</h4>
                <small className="text-muted">Incluye montos cobrados y pendientes del período seleccionado.</small>
              </div>
            </div>
          </div>
          <div className="col-xl-3 col-md-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-body">
                <p className="text-muted mb-1">Pacientes activos</p>
                <h4 className="fw-bold mb-1">{data.totalPacientes}</h4>
                <small className="text-muted">Particulares: {data.pacientesByTipo.particulares} · Centros: {data.pacientesByTipo.centro}</small>
              </div>
            </div>
          </div>
          <div className="col-xl-3 col-md-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-body">
                <p className="text-muted mb-1">Retención estimada a centros</p>
                <h4 className="fw-bold mb-1">{formatNumber(data.totalRetencionCentros)}</h4>
                <small className="text-muted">Centros con actividad: {data.centrosActivos}/{data.totalCentros}</small>
              </div>
            </div>
          </div>
          <div className="col-xl-3 col-md-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-body">
                <p className="text-muted mb-1">Ocupación semanal</p>
                <div className="d-flex align-items-baseline gap-2">
                  <FaClock className="text-primary" />
                  <h4 className="fw-bold mb-0">{Math.round(data.ocupacionSemanal)}%</h4>
                </div>
                <div className="progress mt-2" role="progressbar" aria-label="Ocupación semanal" aria-valuenow={Math.round(data.ocupacionSemanal)} aria-valuemin="0" aria-valuemax="100">
                  <div
                    className={`progress-bar ${data.ocupacionSemanal >= 85 ? 'bg-danger' : data.ocupacionSemanal >= 60 ? 'bg-warning text-dark' : 'bg-success'}`}
                    style={{ width: `${Math.min(Math.round(data.ocupacionSemanal), 100)}%` }}
                  ></div>
                </div>
                <small className="text-muted d-block mt-2">
                  Programados: {formatMinutes(data.minutosProgramadosSemana)} · Capacidad semanal: {formatMinutes(data.minutosDisponiblesSemana)}
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {shouldShowWidget('dateRange') && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title"><FaCalendarAlt className="me-2" /> Rango de Fechas</h5>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label htmlFor="startDate" className="form-label">Desde</label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  className="form-control"
                  value={dateRange.startDate}
                  onChange={handleDateChange}
                />
              </div>
              <div className="col-md-5">
                <label htmlFor="endDate" className="form-label">Hasta</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  className="form-control"
                  value={dateRange.endDate}
                  onChange={handleDateChange}
                />
              </div>
              <div className="col-md-2">
                <button
                  className="btn btn-primary w-100"
                  onClick={applyDateFilter}
                >
                  Aplicar Filtro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {hasUpperWidgets && (
        <div className="row g-4">
        {shouldShowWidget('financialSummary') && (
          <div className="col-xl-4 col-lg-6">
            <div className="card shadow-sm h-100">
              <div className="card-header bg-primary text-white">
                <FaMoneyBillWave className="me-2" /> Resumen Financiero
              </div>
              <div className="card-body">
                <ul className="list-group list-group-flush">
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Total Facturación
                    <span className="fw-bold">{formatNumber(data.totalFacturacion)}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Monto Pagado
                    <span className="fw-bold text-success">{formatNumber(data.montoPagado)}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Monto Pendiente
                    <span className="fw-bold text-danger">{formatNumber(data.montoPendiente)}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Ingresos netos de pacientes particulares
                    <span className="fw-bold text-primary">{formatNumber(data.netoParticulares)}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Ingresos netos de centros de salud
                    <span className="fw-bold text-info">{formatNumber(data.netoCentros)}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Total retenido por centros
                    <span className="fw-bold text-warning">{formatNumber(data.totalRetencionCentros)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {shouldShowWidget('administrativeMetrics') && (
        <div className="col-lg-4 col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-info text-white">
              <FaUsers className="me-2" /> Métricas Administrativas
            </div>
            <div className="card-body">
              <ul className="list-group list-group-flush">
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Pacientes totales
                  <span className="badge bg-primary rounded-pill">{data.totalPacientes}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Atendidos de forma particular
                  <span className="badge bg-success rounded-pill">{data.pacientesByTipo.particulares}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Gestionados vía centros de salud
                  <span className="badge bg-info text-dark rounded-pill">{data.pacientesByTipo.centro}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Obras sociales activas
                  <span className="badge bg-secondary rounded-pill">{data.totalObrasSociales}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Centros con facturación
                  <span className="badge bg-warning text-dark rounded-pill">{data.centrosActivos}/{data.totalCentros}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Facturas Pagadas
                  <span className="badge bg-success rounded-pill">{data.facturasPagadas}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  Facturas Pendientes
                  <span className="badge bg-warning text-dark rounded-pill">{data.facturasPendientes}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('collectionsHealth') && (
        <div className="col-lg-4 col-md-12">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-dark text-white">
              <FaFileInvoiceDollar className="me-2" /> Salud de la cobranza
            </div>
            <div className="card-body">
              <p className="text-muted mb-2">
                El <strong>{cobranzaRate}%</strong> de tu facturación está cobrado. Mantén esta tasa por encima del 80% para sostener la liquidez.
              </p>
              <div className="progress" role="progressbar" aria-label="Tasa de cobranza" aria-valuenow={cobranzaRate} aria-valuemin="0" aria-valuemax="100">
                <div
                  className={`progress-bar ${cobranzaRate >= 80 ? 'bg-success' : cobranzaRate >= 60 ? 'bg-warning text-dark' : 'bg-danger'}`}
                  style={{ width: `${Math.min(cobranzaRate, 100)}%` }}
                ></div>
              </div>
              <div className="d-flex justify-content-between small text-muted mt-2">
                <span>Pagadas: {data.facturasPagadas}</span>
                <span>Pendientes: {data.facturasPendientes} ({facturasPendientesRate}%)</span>
              </div>
              <hr />
              <p className="text-muted mb-1">Ticket promedio por paciente</p>
              <h4 className="fw-bold mb-0">{formatNumber(averageTicket)}</h4>
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('centersSummary') && (
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-warning text-dark">
              <FaHospital className="me-2" /> Convenios con Centros
            </div>
            <div className="card-body p-0">
              {data.centrosResumen.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {data.centrosResumen.slice(0, 3).map((centro) => (
                    <li key={centro._id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <strong>{centro.nombre}</strong>
                          <div className="small text-muted">Ret. {centro.porcentajeRetencion}%</div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold text-primary">{formatNumber(centro.totalRetencion)}</div>
                          <small className="text-muted">Facturado: {formatNumber(centro.totalFacturado)}</small>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted text-center py-4 mb-0">Aún no registraste centros con actividad.</p>
              )}
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('agendaToday') && (
        <div className="col-12">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-info text-white">
              <FaCalendarAlt className="me-2" /> Agenda del día
            </div>
            <div className="card-body">
              <DailyAgendaTimeline
                turnos={turnosHoy}
                selectedDate={agendaHoy}
                startHour={8}
                endHour={20}
                emptyMessage="No hay turnos programados para hoy."
              />
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('turnosTomorrow') && (
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white">
              <FaClock className="me-2" /> Turnos de mañana
            </div>
            <div className="card-body">
              {turnosManana.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {turnosManana.map((turno) => {
                    const fecha = new Date(turno.fecha);
                    const horaLabel = Number.isNaN(fecha.getTime())
                      ? 'Sin horario'
                      : fecha.toLocaleTimeString('es-AR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                    const pacienteNombre = turno.paciente
                      ? `${turno.paciente.nombre || ''} ${turno.paciente.apellido || ''}`.trim() || 'Paciente'
                      : 'Paciente';
                    const contact = buildContactActions(turno);
                    return (
                      <li key={turno._id} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <strong>{pacienteNombre}</strong>
                            <div className="small text-muted">{turno.titulo || 'Consulta'}</div>
                            {contact?.phoneLabel && (
                              <div className="small text-muted">{contact.phoneLabel}</div>
                            )}
                          </div>
                          <div className="text-end">
                            <div className="small fw-semibold">{horaLabel}</div>
                            <span className={`badge ${turno.estado === 'confirmado' ? 'bg-success' : turno.estado === 'cancelado' ? 'bg-danger' : 'bg-secondary'}`}>
                              {turno.estado || 'Programado'}
                            </span>
                            {contact && (
                              <div className="d-flex justify-content-end gap-2 mt-2">
                                {contact.tel && (
                                  <a className="btn btn-outline-primary btn-sm" href={contact.tel} title={`Llamar a ${pacienteNombre}`}>
                                    <FaPhoneAlt />
                                  </a>
                                )}
                                {contact.whatsapp && (
                                  <a className="btn btn-outline-success btn-sm" href={contact.whatsapp} target="_blank" rel="noreferrer" title={`Enviar WhatsApp a ${pacienteNombre}`}>
                                    <FaWhatsapp />
                                  </a>
                                )}
                                {contact.sms && (
                                  <a className="btn btn-outline-secondary btn-sm" href={contact.sms} title={`Enviar SMS a ${pacienteNombre}`}>
                                    <FaSms />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted mb-0">No hay turnos agendados para mañana.</p>
              )}
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('turnosUpcoming') && (
        <div className="col-xl-4 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-secondary text-white">
              <FaCalendarAlt className="me-2" /> Próximos turnos
            </div>
            <div className="card-body">
              {turnosPosteriores.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {turnosPosteriores.map((turno) => {
                    const pacienteNombre = turno.paciente
                      ? `${turno.paciente.nombre || ''} ${turno.paciente.apellido || ''}`.trim() || 'Paciente'
                      : turno.paciente || 'Paciente';
                    const contact = buildContactActions(turno);
                    return (
                      <li key={turno._id} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <strong>{pacienteNombre}</strong>
                            <div className="small text-muted">{turno.titulo || 'Consulta'}</div>
                            {contact?.phoneLabel && (
                              <div className="small text-muted">{contact.phoneLabel}</div>
                            )}
                          </div>
                          <div className="text-end">
                            <div className="small fw-semibold">{formatDateTime(turno.fecha)}</div>
                            <span className={`badge ${turno.estado === 'confirmado' ? 'bg-success' : turno.estado === 'cancelado' ? 'bg-danger' : 'bg-secondary'}`}>
                              {turno.estado || 'Programado'}
                            </span>
                            {contact && (
                              <div className="d-flex justify-content-end gap-2 mt-2">
                                {contact.tel && (
                                  <a className="btn btn-outline-primary btn-sm" href={contact.tel} title={`Llamar a ${pacienteNombre}`}>
                                    <FaPhoneAlt />
                                  </a>
                                )}
                                {contact.whatsapp && (
                                  <a className="btn btn-outline-success btn-sm" href={contact.whatsapp} target="_blank" rel="noreferrer" title={`Enviar WhatsApp a ${pacienteNombre}`}>
                                    <FaWhatsapp />
                                  </a>
                                )}
                                {contact.sms && (
                                  <a className="btn btn-outline-secondary btn-sm" href={contact.sms} title={`Enviar SMS a ${pacienteNombre}`}>
                                    <FaSms />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted mb-0">No hay turnos programados a partir de pasado mañana.</p>
              )}
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('growth') && (
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-success text-white">
              <FaChartBar className="me-2" /> Crecimiento Interanual ({new Date().getFullYear() - 1} vs {new Date().getFullYear()})
            </div>
            <div className="card-body">
              <div className="row g-3 text-center">
                <div className="col-md-6">
                  <h5>Facturación Total</h5>
                  <div className="d-flex align-items-center justify-content-center">
                    {renderGrowthIcon(data.growthMetrics.facturacion.percentage)}
                    <h4 className="mb-0 fw-bold">{data.growthMetrics.facturacion.percentage.toFixed(2)}%</h4>
                  </div>
                  <p className="text-muted mt-2 mb-0">
                    <small>
                      {formatNumber(data.growthMetrics.facturacion.previousYear)} vs {formatNumber(data.growthMetrics.facturacion.currentYear)}
                    </small>
                  </p>
                </div>
                <div className="col-md-6">
                  <h5>Número de Facturas</h5>
                  <div className="d-flex align-items-center justify-content-center">
                    {renderGrowthIcon(data.growthMetrics.facturas.percentage)}
                    <h4 className="mb-0 fw-bold">{data.growthMetrics.facturas.percentage.toFixed(2)}%</h4>
                  </div>
                  <p className="text-muted mt-2 mb-0">
                    <small>
                      {data.growthMetrics.facturas.previousYear} vs {data.growthMetrics.facturas.currentYear}
                    </small>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
        
        {shouldShowWidget('monthlyRevenue') && (
        <div className="col-12 col-xl-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 border-bottom">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                <div>
                  <h5 className="mb-0 d-flex align-items-center gap-2">
                    <FaChartBar className="text-primary" /> Facturación mensual
                  </h5>
                  <small className="text-muted">Evolución de tus ingresos mes a mes.</small>
                </div>
                {monthlyInsights.lastMonth && (
                  <span className="badge bg-primary text-white fw-semibold">
                    Último registro: {monthlyInsights.lastMonth.label}
                  </span>
                )}
              </div>
            </div>
            <div className="card-body">
              {data.monthlyBarChartData.labels?.length > 0 ? (
                <>
                  <div className="rounded-3 bg-light-subtle border border-light-subtle px-3 py-3">
                    <div style={{ height: '260px' }}>
                      <Bar data={data.monthlyBarChartData} options={currencyChartOptions} />
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="h-100 d-flex align-items-center justify-content-center text-center text-muted px-3"
                  style={{ minHeight: '260px' }}
                >
                  <p className="mb-0">No hay datos suficientes para el gráfico mensual.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('statusDistribution') && (
        <div className="col-12 col-xl-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 border-bottom">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                <div>
                  <h5 className="mb-0 d-flex align-items-center gap-2">
                    <FaFileInvoiceDollar className="text-secondary" /> Facturas por estado
                  </h5>
                  <small className="text-muted">Cantidad de facturas por etapa del proceso.</small>
                </div>
                {totalFacturasEstados > 0 && (
                  <span className="badge bg-secondary text-white fw-semibold">
                    Total analizado: {totalFacturasEstados}
                  </span>
                )}
              </div>
            </div>
            <div className="card-body">
              {data.facturasEstadoChartData.labels?.length > 0 ? (
                <>
                  <div className="rounded-3 bg-light-subtle border border-light-subtle px-3 py-3">
                    <div style={{ height: '260px' }}>
                      <Bar data={data.facturasEstadoChartData} options={countChartOptions} />
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="h-100 d-flex align-items-center justify-content-center text-center text-muted px-3"
                  style={{ minHeight: '260px' }}
                >
                  <p className="mb-0">No hay información para mostrar la distribución de estados.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('topObrasSociales') && (
        <div className="col-12 col-xl-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 border-bottom">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                <div>
                  <h5 className="mb-0 d-flex align-items-center gap-2">
                    <FaStar className="text-warning" /> Top 5 obras sociales
                  </h5>
                  <small className="text-muted">Quiénes impulsan tu facturación con convenios.</small>
                </div>
                {obrasSocialesEntries.length > 0 && (
                  <span className="badge bg-warning text-dark fw-semibold">
                    El Top 5 concentra {formatPercentage(coberturaTop5)} del total
                  </span>
                )}
              </div>
            </div>
            <div className="card-body">
              {data.obrasSocialesBarChartData.labels?.length > 0 ? (
                <>
                  <div className="rounded-3 bg-light-subtle border border-light-subtle px-3 py-3">
                    <div style={{ height: '260px' }}>
                      <Bar data={data.obrasSocialesBarChartData} options={horizontalCurrencyChartOptions} />
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="h-100 d-flex align-items-center justify-content-center text-center text-muted px-3"
                  style={{ minHeight: '260px' }}
                >
                  <p className="mb-0">No hay datos suficientes para el gráfico de obras sociales.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {shouldShowWidget('moraObrasSociales') && (
        <div className="col-12 col-xl-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 border-bottom">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                <div>
                  <h5 className="mb-0 d-flex align-items-center gap-2">
                    <FaExclamationTriangle className="text-danger" /> Mora por obra social
                  </h5>
                  <small className="text-muted">Saldo vencido según cada obra social.</small>
                </div>
                <span className="badge bg-danger text-white fw-semibold">
                  Total vencido: {formatNumber(data.montoMoraTotal)}
                </span>
              </div>
            </div>
            <div className="card-body">
              {data.moraObraSocialData.labels?.length > 0 ? (
                <>
                  <div className="rounded-3 bg-light-subtle border border-light-subtle px-3 py-3">
                    <div style={{ height: '260px' }}>
                      <Bar data={data.moraObraSocialData} options={horizontalCurrencyChartOptions} />
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="h-100 d-flex align-items-center justify-content-center text-center text-muted px-3"
                  style={{ minHeight: '260px' }}
                >
                  <p className="mb-0">No registras deudas vencidas con obras sociales.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        </div>
      )}
    </div>
  );
}

export default DashboardPage;
