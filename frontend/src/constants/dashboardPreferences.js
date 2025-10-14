export const DASHBOARD_WIDGET_OPTIONS = [
  {
    id: 'summaryHighlights',
    label: 'Indicadores clave',
    description: 'Tarjetas con facturación, pacientes y ocupación semanal.',
  },
  {
    id: 'dateRange',
    label: 'Filtro por fechas',
    description: 'Selector para acotar los datos del panel a un período específico.',
  },
  {
    id: 'financialSummary',
    label: 'Resumen financiero',
    description: 'Detalle de facturación, cobranzas y neto por tipo de ingreso.',
  },
  {
    id: 'collectionsOverview',
    label: 'Resumen de cobranzas y centros',
    description: 'Tarjetas y tablas resumidas con cobranzas por paciente, obra social, centro y mes.',
  },
  {
    id: 'administrativeMetrics',
    label: 'Métricas administrativas',
    description: 'Totales de pacientes, obras sociales y centros con actividad.',
  },
  {
    id: 'collectionsHealth',
    label: 'Salud de la cobranza',
    description: 'Indicadores de cobranzas y ticket promedio por paciente.',
  },
  {
    id: 'centersSummary',
    label: 'Convenios con centros',
    description: 'Resumen de retenciones y facturación por centro de salud.',
  },
  {
    id: 'agendaToday',
    label: 'Agenda del día',
    description: 'Línea de tiempo con los turnos del día actual.',
  },
  {
    id: 'turnosTomorrow',
    label: 'Turnos de mañana',
    description: 'Listado con los turnos confirmados para el día siguiente.',
  },
  {
    id: 'turnosUpcoming',
    label: 'Próximos turnos',
    description: 'Próximos compromisos luego de mañana con estado y horario.',
  },
  {
    id: 'growth',
    label: 'Crecimiento interanual',
    description: 'Comparativa anual de facturación y cantidad de facturas.',
  },
  {
    id: 'monthlyRevenue',
    label: 'Facturación mensual',
    description: 'Gráfico de evolución de ingresos mes a mes.',
  },
  {
    id: 'statusDistribution',
    label: 'Facturas por estado',
    description: 'Distribución de facturas según su etapa de cobranza.',
  },
  {
    id: 'topObrasSociales',
    label: 'Top obras sociales',
    description: 'Ranking de convenios que explican mayor facturación.',
  },
  {
    id: 'moraObrasSociales',
    label: 'Mora por obra social',
    description: 'Saldo vencido agrupado por cada obra social.',
  },
];

export const DEFAULT_DASHBOARD_PREFERENCES = DASHBOARD_WIDGET_OPTIONS.map((option) => option.id);

export const DASHBOARD_WIDGET_IDS = new Set(DEFAULT_DASHBOARD_PREFERENCES);

export const resolveDashboardPreferences = (rawPreferences) => {
  if (!Array.isArray(rawPreferences)) {
    return [...DEFAULT_DASHBOARD_PREFERENCES];
  }

  const unique = [];

  rawPreferences.forEach((widget) => {
    if (typeof widget !== 'string') {
      return;
    }
    const trimmed = widget.trim();
    if (!trimmed || !DASHBOARD_WIDGET_IDS.has(trimmed)) {
      return;
    }
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  });

  if (unique.length === 0) {
    return [...DEFAULT_DASHBOARD_PREFERENCES];
  }

  return unique;
};
