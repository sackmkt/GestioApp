const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getMontoCobrado = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.montoCobrado))) {
    return Number(factura.montoCobrado);
  }

  if (Array.isArray(factura.pagos) && factura.pagos.length > 0) {
    return factura.pagos.reduce((sum, pago) => sum + toNumber(pago.monto), 0);
  }

  if (Number.isFinite(Number(factura.montoPagado))) {
    return Number(factura.montoPagado);
  }

  return 0;
};

const getCentroRetencion = (factura) => {
  if (!factura) {
    return 0;
  }

  const porcentaje = factura.centroRetencionPorcentaje ?? factura.centroSalud?.porcentajeRetencion;
  const numeric = Number(porcentaje);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getCentroPagado = (factura) => {
  if (!factura) {
    return 0;
  }

  if (Number.isFinite(Number(factura.centroPagado))) {
    return Number(factura.centroPagado);
  }

  const pagosCentro = Array.isArray(factura.pagosCentro) ? factura.pagosCentro : [];
  return pagosCentro.reduce((sum, pago) => sum + toNumber(pago.monto), 0);
};

const getCentroSaldoPendiente = (total, pagado) => {
  const saldo = toNumber(total) - toNumber(pagado);
  return saldo > 0 ? saldo : 0;
};

const normalizeEstado = (factura) => {
  if (!factura) {
    return 'pendiente';
  }

  if (factura.estado) {
    return factura.estado;
  }

  return factura.pagado ? 'pagada' : 'pendiente';
};

const getMonthKey = (factura) => {
  const rawDate = factura?.fechaEmision || factura?.fechaVencimiento || factura?.createdAt;

  if (!rawDate) {
    return 'sin-fecha';
  }

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return 'sin-fecha';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthSortValue = (key) => {
  if (!key || key === 'sin-fecha') {
    return Number.NEGATIVE_INFINITY;
  }

  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return Number.NEGATIVE_INFINITY;
  }

  return year * 100 + month;
};

const formatMonthLabel = (key) => {
  if (!key || key === 'sin-fecha') {
    return 'Sin fecha';
  }

  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return key;
  }

  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

export const buildCollectionsSummary = (facturas = []) => {
  const facturasArray = Array.isArray(facturas) ? facturas : [];

  const totals = {
    totalFacturado: 0,
    totalCobrado: 0,
    totalSaldoPacientes: 0,
    totalCentroEsperado: 0,
    totalCentroPagado: 0,
    totalCentroSaldo: 0,
  };

  const pacientesMap = new Map();
  const obrasMap = new Map();
  const centrosMap = new Map();
  const mesesMap = new Map();

  facturasArray.forEach((factura) => {
    const montoTotal = toNumber(factura.montoTotal);
    const montoCobrado = getMontoCobrado(factura);
    const saldoPaciente = Math.max(montoTotal - montoCobrado, 0);

    const centroPorcentaje = getCentroRetencion(factura);
    const centroTotal = (montoTotal * centroPorcentaje) / 100;
    const centroPagado = getCentroPagado(factura);
    const centroSaldo = getCentroSaldoPendiente(centroTotal, centroPagado);

    totals.totalFacturado += montoTotal;
    totals.totalCobrado += montoCobrado;
    totals.totalSaldoPacientes += saldoPaciente;
    totals.totalCentroEsperado += centroTotal;
    totals.totalCentroPagado += centroPagado;
    totals.totalCentroSaldo += centroSaldo;

    const pacienteId = factura.paciente?._id || factura.paciente?.id || factura.pacienteId || factura.paciente || 'sin-identificar';
    const pacienteNombre = factura.paciente
      ? `${factura.paciente?.nombre || ''} ${factura.paciente?.apellido || ''}`.trim() || 'Paciente sin identificar'
      : 'Paciente sin identificar';

    if (!pacientesMap.has(pacienteId)) {
      pacientesMap.set(pacienteId, {
        id: pacienteId,
        nombre: pacienteNombre,
        facturas: 0,
        totalFacturado: 0,
        totalCobrado: 0,
        saldoPendiente: 0,
        centroTotal: 0,
        centroPagado: 0,
        centroSaldo: 0,
      });
    }

    const pacienteEntry = pacientesMap.get(pacienteId);
    pacienteEntry.facturas += 1;
    pacienteEntry.totalFacturado += montoTotal;
    pacienteEntry.totalCobrado += montoCobrado;
    pacienteEntry.saldoPendiente += saldoPaciente;
    pacienteEntry.centroTotal += centroTotal;
    pacienteEntry.centroPagado += centroPagado;
    pacienteEntry.centroSaldo += centroSaldo;

    const obraId = factura.obraSocial?._id || 'particulares';
    const obraNombre = factura.obraSocial?.nombre || 'Pacientes particulares';

    if (!obrasMap.has(obraId)) {
      obrasMap.set(obraId, {
        id: obraId,
        nombre: obraNombre,
        facturas: 0,
        totalCobrado: 0,
        saldoPendiente: 0,
        pagas: 0,
        pendientes: 0,
      });
    }

    const obraEntry = obrasMap.get(obraId);
    obraEntry.facturas += 1;
    obraEntry.totalCobrado += montoCobrado;
    obraEntry.saldoPendiente += saldoPaciente;

    const estado = normalizeEstado(factura);
    if (estado === 'pagada') {
      obraEntry.pagas += 1;
    } else {
      obraEntry.pendientes += 1;
    }

    const centroId = factura.centroSalud?._id || factura.centroSalud || null;
    if (centroId) {
      if (!centrosMap.has(centroId)) {
        centrosMap.set(centroId, {
          id: centroId,
          nombre: factura.centroSalud?.nombre || 'Centro no registrado',
          porcentaje: centroPorcentaje,
          facturas: 0,
          totalFacturado: 0,
          totalEsperado: 0,
          totalPagado: 0,
          saldoPendiente: 0,
        });
      }

      const centroEntry = centrosMap.get(centroId);
      centroEntry.facturas += 1;
      centroEntry.totalFacturado += montoTotal;
      centroEntry.totalEsperado += centroTotal;
      centroEntry.totalPagado += centroPagado;
      centroEntry.saldoPendiente += centroSaldo;
      centroEntry.porcentaje = centroPorcentaje;
    }

    const monthKey = getMonthKey(factura);
    if (!mesesMap.has(monthKey)) {
      mesesMap.set(monthKey, {
        key: monthKey,
        label: formatMonthLabel(monthKey),
        totalFacturado: 0,
        totalCobrado: 0,
        totalPendiente: 0,
        centroEsperado: 0,
        centroPagado: 0,
        centroSaldo: 0,
        facturas: 0,
      });
    }

    const mesEntry = mesesMap.get(monthKey);
    mesEntry.totalFacturado += montoTotal;
    mesEntry.totalCobrado += montoCobrado;
    mesEntry.totalPendiente += saldoPaciente;
    mesEntry.centroEsperado += centroTotal;
    mesEntry.centroPagado += centroPagado;
    mesEntry.centroSaldo += centroSaldo;
    mesEntry.facturas += 1;
  });

  const pacientes = Array.from(pacientesMap.values()).sort((a, b) => b.saldoPendiente - a.saldoPendiente);
  const pacientesConSaldo = pacientes.filter((paciente) => paciente.saldoPendiente > 1e-2);
  const pacientesAlDia = pacientes.filter((paciente) => paciente.saldoPendiente <= 1e-2);
  const obras = Array.from(obrasMap.values()).sort((a, b) => b.totalCobrado - a.totalCobrado);
  const centros = Array.from(centrosMap.values()).sort((a, b) => b.totalEsperado - a.totalEsperado);
  const meses = Array.from(mesesMap.values()).sort((a, b) => getMonthSortValue(b.key) - getMonthSortValue(a.key));

  return {
    totals,
    pacientes,
    pacientesConSaldo,
    pacientesAlDia,
    obras,
    centros,
    meses,
  };
};

export default buildCollectionsSummary;
