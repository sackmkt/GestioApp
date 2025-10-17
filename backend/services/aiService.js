const mongoose = require('mongoose');
const Factura = require('../models/Factura');
const Paciente = require('../models/Paciente');
const Turno = require('../models/Turno');
const ObraSocial = require('../models/ObraSocial');
const CentroSalud = require('../models/CentroSalud');

let GoogleGenerativeAI;
let GoogleGenerativeAIFetchError;

try {
  ({ GoogleGenerativeAI, GoogleGenerativeAIFetchError } = require('@google/genai'));
} catch (error) {
  GoogleGenerativeAI = null;
  GoogleGenerativeAIFetchError = null;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.3;
const MAX_OUTPUT_TOKENS = 1024;

const roundNumber = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
};

const formatDate = (value) => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const formatPaciente = (paciente) => {
  if (!paciente) {
    return null;
  }

  return {
    id: paciente._id?.toString?.() || null,
    nombreCompleto: [paciente.apellido, paciente.nombre].filter(Boolean).join(', '),
    dni: paciente.dni || null,
    email: paciente.email || null,
    telefono: paciente.telefono || null,
    tipoAtencion: paciente.tipoAtencion || null,
    obraSocial: paciente.obraSocial?.nombre || null,
    centroSalud: paciente.centroSalud?.nombre || null,
    actualizadoEn: formatDate(paciente.updatedAt),
  };
};

const formatObraSocial = (obra) => ({
  id: obra._id?.toString?.() || null,
  nombre: obra.nombre,
  telefono: obra.telefono || null,
  email: obra.email || null,
  cuit: obra.cuit || null,
  actualizadoEn: formatDate(obra.updatedAt),
});

const formatCentroSalud = (centro) => ({
  id: centro._id?.toString?.() || null,
  nombre: centro.nombre,
  porcentajeRetencion: roundNumber(centro.porcentajeRetencion),
  actualizadoEn: formatDate(centro.updatedAt),
});

const formatTurno = (turno) => ({
  id: turno._id?.toString?.() || null,
  fecha: formatDate(turno.fecha),
  estado: turno.estado,
  titulo: turno.titulo || null,
  notas: turno.notas || null,
  duracionMinutos: turno.duracionMinutos || null,
  recordatorioHorasAntes: turno.recordatorioHorasAntes ?? null,
  paciente: formatPaciente(turno.paciente) || null,
});

const formatFactura = (factura) => {
  const pagos = Array.isArray(factura.pagos) ? factura.pagos : [];
  const pagosCentro = Array.isArray(factura.pagosCentro) ? factura.pagosCentro : [];

  const montoCobrado = pagos.reduce((total, pago) => total + (pago?.monto || 0), 0);
  const montoPagadoCentros = pagosCentro.reduce((total, pago) => total + (pago?.monto || 0), 0);
  const saldoPendiente = Math.max((factura.montoTotal || 0) - montoCobrado, 0);

  return {
    id: factura._id?.toString?.() || null,
    numeroFactura: factura.numeroFactura || null,
    puntoVenta: factura.puntoVenta ?? null,
    estado: factura.estado,
    montoTotal: roundNumber(factura.montoTotal),
    montoCobrado: roundNumber(montoCobrado),
    montoPagadoCentros: roundNumber(montoPagadoCentros),
    saldoPendiente: roundNumber(saldoPendiente),
    fechaEmision: formatDate(factura.fechaEmision),
    fechaVencimiento: formatDate(factura.fechaVencimiento),
    mesServicio: factura.mesServicio || null,
    paciente: formatPaciente(factura.paciente),
    obraSocial: factura.obraSocial?.nombre || null,
    centroSalud: factura.centroSalud?.nombre || null,
    observaciones: factura.observaciones || null,
    estaVencida: Boolean(
      factura.fechaVencimiento && new Date(factura.fechaVencimiento).getTime() < Date.now() && saldoPendiente > 0,
    ),
  };
};

const sumArrayField = (field) => ({
  $sum: {
    $map: {
      input: { $ifNull: [field, []] },
      as: 'item',
      in: { $ifNull: ['$$item.monto', 0] },
    },
  },
});

const buildOutstandingPipeline = ({ userId, groupField }) => [
  { $match: { user: userId } },
  {
    $addFields: {
      cobrado: sumArrayField('$pagos'),
      pagadoCentros: sumArrayField('$pagosCentro'),
    },
  },
  {
    $addFields: {
      saldoPendiente: {
        $max: [{ $subtract: ['$montoTotal', '$cobrado'] }, 0],
      },
    },
  },
  { $match: { saldoPendiente: { $gt: 0 } } },
  {
    $group: {
      _id: groupField,
      saldoPendiente: { $sum: '$saldoPendiente' },
      cantidadFacturas: { $sum: 1 },
    },
  },
  { $sort: { saldoPendiente: -1 } },
  { $limit: 5 },
];

const resolveEntityName = (docs) => {
  const map = new Map();
  docs.forEach((doc) => {
    if (!doc || !doc._id) {
      return;
    }

    let nombre = doc.nombre;
    if (!nombre && doc.apellido) {
      nombre = [doc.apellido, doc.nombre].filter(Boolean).join(', ');
    }

    map.set(doc._id.toString(), nombre || 'Sin nombre');
  });
  return map;
};

const aggregateOutstanding = async ({ userId, groupBy }) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  let groupField;
  let Model;
  let nullLabel;

  switch (groupBy) {
    case 'obraSocial':
      groupField = '$obraSocial';
      Model = ObraSocial;
      nullLabel = 'Pacientes particulares';
      break;
    case 'centroSalud':
      groupField = '$centroSalud';
      Model = CentroSalud;
      nullLabel = 'Sin centro asociado';
      break;
    case 'paciente':
      groupField = '$paciente';
      Model = Paciente;
      nullLabel = 'Paciente sin identificar';
      break;
    default:
      throw new Error(`Tipo de agrupación no soportado: ${groupBy}`);
  }

  const pipeline = buildOutstandingPipeline({ userId: userObjectId, groupField });
  const results = await Factura.aggregate(pipeline);

  const ids = results
    .map((item) => item._id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id) => id.toString());

  let names = new Map();
  if (ids.length > 0) {
    const documents = await Model.find({ _id: { $in: ids } })
      .select(groupBy === 'paciente' ? 'nombre apellido' : 'nombre')
      .lean();
    names = resolveEntityName(documents);
  }

  return results.map((item) => {
    const key = item._id ? item._id.toString() : null;
    const label = key ? names.get(key) || 'Sin datos' : nullLabel;
    return {
      nombre: label,
      saldoPendiente: roundNumber(item.saldoPendiente),
      cantidadFacturas: item.cantidadFacturas,
    };
  });
};

const buildKnowledgeSnapshot = async ({ user }) => {
  if (!user || !user._id) {
    return null;
  }

  const userId = user._id;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [
    pacientesTotal,
    pacientesRecientes,
    obrasTotal,
    obrasRecientes,
    centrosTotal,
    centrosRecientes,
    turnosProximos,
    facturasTotal,
    facturasRecientes,
    facturasResumen,
    deudaPorObra,
    deudaPorCentro,
    deudaPorPaciente,
  ] = await Promise.all([
    Paciente.countDocuments({ user: userObjectId }),
    Paciente.find({ user: userObjectId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('nombre apellido dni email telefono tipoAtencion obraSocial centroSalud updatedAt')
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre')
      .lean(),
    ObraSocial.countDocuments({ user: userObjectId }),
    ObraSocial.find({ user: userObjectId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('nombre telefono email cuit updatedAt')
      .lean(),
    CentroSalud.countDocuments({ user: userObjectId }),
    CentroSalud.find({ user: userObjectId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('nombre porcentajeRetencion updatedAt')
      .lean(),
    Turno.find({ user: userObjectId, fecha: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } })
      .sort({ fecha: 1 })
      .limit(15)
      .populate('paciente', 'nombre apellido dni telefono email tipoAtencion updatedAt')
      .lean(),
    Factura.countDocuments({ user: userObjectId }),
    Factura.find({ user: userObjectId })
      .sort({ fechaEmision: -1 })
      .limit(15)
      .select(
        'numeroFactura puntoVenta estado montoTotal fechaEmision fechaVencimiento mesServicio paciente obraSocial centroSalud pagos pagosCentro observaciones updatedAt',
      )
      .populate('paciente', 'nombre apellido dni email telefono tipoAtencion updatedAt')
      .populate('obraSocial', 'nombre')
      .populate('centroSalud', 'nombre')
      .lean(),
    Factura.aggregate([
      { $match: { user: userObjectId } },
      {
        $addFields: {
          cobrado: sumArrayField('$pagos'),
          pagadoCentros: sumArrayField('$pagosCentro'),
        },
      },
      {
        $addFields: {
          saldoPendiente: {
            $max: [{ $subtract: ['$montoTotal', '$cobrado'] }, 0],
          },
        },
      },
      {
        $group: {
          _id: '$estado',
          cantidad: { $sum: 1 },
          montoTotal: { $sum: '$montoTotal' },
          montoCobrado: { $sum: '$cobrado' },
          montoPagadoCentros: { $sum: '$pagadoCentros' },
          saldoPendiente: { $sum: '$saldoPendiente' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    aggregateOutstanding({ userId, groupBy: 'obraSocial' }),
    aggregateOutstanding({ userId, groupBy: 'centroSalud' }),
    aggregateOutstanding({ userId, groupBy: 'paciente' }),
  ]);

  const resumenPorEstado = facturasResumen.map((item) => ({
    estado: item._id,
    cantidad: item.cantidad,
    montoTotal: roundNumber(item.montoTotal),
    montoCobrado: roundNumber(item.montoCobrado),
    montoPagadoCentros: roundNumber(item.montoPagadoCentros),
    saldoPendiente: roundNumber(item.saldoPendiente),
  }));

  const deudaTotal = resumenPorEstado.reduce((total, item) => total + (item.saldoPendiente || 0), 0);

  return {
    generadoEn: new Date().toISOString(),
    totales: {
      pacientes: pacientesTotal,
      obrasSociales: obrasTotal,
      centrosSalud: centrosTotal,
      facturas: facturasTotal,
    },
    pacientesRecientes: pacientesRecientes.map(formatPaciente),
    obrasSocialesRecientes: obrasRecientes.map(formatObraSocial),
    centrosSaludRecientes: centrosRecientes.map(formatCentroSalud),
    turnosProximos: turnosProximos.map(formatTurno),
    facturasRecientes: facturasRecientes.map(formatFactura),
    resumenFacturacion: {
      porEstado: resumenPorEstado,
      deudaTotal: roundNumber(deudaTotal),
      deudaPorObraSocial: deudaPorObra,
      deudaPorCentroSalud: deudaPorCentro,
      deudaPorPaciente: deudaPorPaciente,
    },
  };
};

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const rawRole = typeof message.role === 'string' ? message.role.trim().toLowerCase() : 'user';
      const text = typeof message.content === 'string' ? message.content.trim() : '';

      if (!text) {
        return null;
      }

      const role = rawRole === 'assistant' || rawRole === 'model' ? 'model' : 'user';

      return {
        role,
        parts: [{ text }],
      };
    })
    .filter(Boolean);
};

const buildSystemInstruction = ({ user, snapshot }) => {
  const profesional = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const profesionalLabel = profesional || user?.username || 'Profesional';

  const snapshotText = snapshot
    ? JSON.stringify(snapshot, null, 2)
    : 'No hay datos disponibles. Indica al usuario que aún no se registraron datos para esta consulta.';

  return [
    'Eres GestioBot, un asistente virtual especializado en la plataforma GestioApp.',
    'Tu misión es ayudar a profesionales de la salud a consultar datos administrativos, de pacientes, turnos y facturación.',
    'Responde de forma clara, estructurada y accionable. Usa tablas o listas cuando mejoren la comprensión.',
    'Nunca inventes datos: utiliza exclusivamente la información incluida en el snapshot o proporcionada por el usuario. Si algo no figura, aclara cómo obtenerlo desde GestioApp.',
    'Sugiere acciones concretas dentro de la aplicación cuando corresponda (por ejemplo, rutas de menú o filtros que pueden aplicar).',
    `Profesional a cargo: ${profesionalLabel}.`,
    'Snapshot con la información más reciente disponible en formato JSON:',
    snapshotText,
    'Si detectas inconsistencias o ausencia de datos, proponé los pasos para cargarlos en la plataforma.',
    'Finaliza tus respuestas invitando a realizar otra consulta cuando sea apropiado.',
  ].join('\n\n');
};

const callGemini = async ({ contents, systemInstruction, temperature }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('La integración con Gemini no está configurada.');
    error.statusCode = 503;
    throw error;
  }

  const modelName = DEFAULT_MODEL;
  const systemPayload = systemInstruction
    ? {
        role: 'system',
        parts: [{ text: systemInstruction }],
      }
    : undefined;
  const generationConfig = {
    temperature: typeof temperature === 'number' ? Math.min(Math.max(temperature, 0), 1) : DEFAULT_TEMPERATURE,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };

  if (GoogleGenerativeAI) {
    try {
      const client = new GoogleGenerativeAI({ apiKey });
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPayload,
      });

      const result = await model.generateContent({
        contents,
        generationConfig,
      });

      const response = result?.response;
      const textFromMethod = typeof response?.text === 'function' ? response.text().trim() : '';
      const candidate = response?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const textFromParts = parts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();

      const text = textFromMethod || textFromParts;

      return {
        text: text || 'No se obtuvo una respuesta del modelo.',
        usage: response?.usageMetadata || result?.usageMetadata || null,
      };
    } catch (error) {
      if (GoogleGenerativeAIFetchError && error instanceof GoogleGenerativeAIFetchError) {
        let message = error.message || 'No se pudo obtener una respuesta del asistente.';
        let statusCode = error.status ?? error.response?.status ?? 502;

        if (error.response) {
          try {
            const data = await error.response.json();
            message = data?.error?.message || message;
          } catch (parseError) {
            try {
              message = (await error.response.text()) || message;
            } catch (_) {
              // ignore secondary parsing failures
            }
          }
        }

        const wrapped = new Error(message);
        wrapped.statusCode = statusCode;
        throw wrapped;
      }

      throw error;
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(modelName)}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const payload = {
      contents,
      systemInstruction: systemPayload,
      generationConfig,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody?.error?.message || 'No se pudo obtener una respuesta del asistente.';
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    return {
      text: text || 'No se obtuvo una respuesta del modelo.',
      usage: data?.usageMetadata || null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const generateChatResponse = async ({ user, messages, temperature }) => {
  const normalizedMessages = normalizeMessages(messages);
  if (normalizedMessages.length === 0) {
    const error = new Error('Debes proporcionar al menos un mensaje válido.');
    error.statusCode = 400;
    throw error;
  }

  const lastMessage = normalizedMessages[normalizedMessages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    const error = new Error('La última interacción debe ser del usuario.');
    error.statusCode = 400;
    throw error;
  }

  const snapshot = await buildKnowledgeSnapshot({ user });
  const systemInstruction = buildSystemInstruction({ user, snapshot });

  const { text, usage } = await callGemini({
    contents: normalizedMessages,
    systemInstruction,
    temperature,
  });

  return {
    reply: text,
    usage,
    snapshotGeneratedAt: snapshot?.generadoEn || null,
  };
};

module.exports = {
  generateChatResponse,
};
