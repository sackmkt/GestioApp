import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaRobot, FaUser, FaInfoCircle, FaLightbulb } from 'react-icons/fa';
import aiAssistantService from '../services/AIAssistantService';
import { useFeedback } from '../context/FeedbackContext.jsx';

const SUGGESTED_QUESTIONS = [
  '¿Cómo está el estado de mis facturas y qué deudas tengo pendientes?',
  '¿Qué turnos tengo programados para esta semana?',
  '¿Qué pacientes nuevos se registraron recientemente?',
  '¿Qué obras sociales tienen mayor deuda acumulada?',
  '¿Hay centros de salud con pagos pendientes?',
];

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createMessage = (role, content, extra = {}) => ({
  id: generateId(),
  role,
  content,
  createdAt: new Date().toISOString(),
  ...extra,
});

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const renderMessageContent = (text) => (
  <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
);

function AIAssistantPage({ currentUser }) {
  const { showError } = useFeedback();
  const [messages, setMessages] = useState(() => [
    createMessage(
      'assistant',
      '¡Hola! Soy GestioBot. Puedo ayudarte a consultar pacientes, turnos, facturación y obras sociales de tu cuenta. Pregúntame lo que necesites y te guiaré con datos y próximos pasos.',
      { isWelcome: true },
    ),
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  const professionalName = useMemo(() => {
    if (!currentUser) {
      return null;
    }
    if (currentUser.firstName) {
      return [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ');
    }
    return currentUser.username || null;
  }, [currentUser]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const buildConversationPayload = useCallback(
    (conversation) =>
      conversation.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [],
  );

  const appendAssistantMessage = useCallback((reply, metadata = {}) => {
    setMessages((prev) => [
      ...prev,
      createMessage('assistant', reply || 'No recibí contenido del asistente.', metadata),
    ]);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) {
        return;
      }

      const userMessage = createMessage('user', trimmed);
      const nextConversation = [...messages, userMessage];
      setMessages(nextConversation);
      setInput('');
      setIsSending(true);

      try {
        const response = await aiAssistantService.sendMessage({
          messages: buildConversationPayload(nextConversation),
        });

        appendAssistantMessage(response.reply, {
          usage: response.usage || null,
          snapshotGeneratedAt: response.snapshotGeneratedAt || null,
        });
      } catch (error) {
        console.error('No se pudo obtener respuesta del asistente IA:', error);
        const apiMessage = error.response?.data?.message;
        showError(apiMessage || 'No se pudo obtener una respuesta del asistente. Intenta nuevamente en unos instantes.');
        appendAssistantMessage(
          'No pude recuperar la información en este momento. Revisa tu conexión y vuelve a intentarlo o comunícate con soporte si el problema persiste.',
        );
      } finally {
        setIsSending(false);
      }
    },
    [appendAssistantMessage, buildConversationPayload, isSending, messages, showError],
  );

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (input.trim()) {
        void sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const handleSuggestionClick = useCallback(
    (question) => {
      if (!question || isSending) {
        return;
      }
      void sendMessage(question);
    },
    [isSending, sendMessage],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (input.trim()) {
          void sendMessage(input);
        }
      }
    },
    [input, sendMessage],
  );

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-10 col-xl-8">
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white border-0 pb-0">
            <div className="d-flex align-items-start gap-3">
              <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: '48px', height: '48px' }}>
                <FaRobot size={22} />
              </div>
              <div>
                <h2 className="h4 fw-bold mb-1">Asistente inteligente</h2>
                <p className="text-muted mb-2">
                  Consulta en lenguaje natural por pacientes, turnos, facturación, obras sociales y más. GestioBot prepara las respuestas con los datos más recientes de tu cuenta.
                </p>
                <div className="alert alert-info d-flex align-items-center gap-2 py-2 px-3 mb-0">
                  <FaInfoCircle />
                  <small>
                    Las respuestas se basan en la información registrada en GestioApp. Si falta un dato, el asistente te indicará cómo completarlo.
                    {professionalName ? ` ¡Vamos, ${professionalName}!` : ''}
                  </small>
                </div>
              </div>
            </div>
          </div>
          <div className="card-body pt-4 d-flex flex-column" style={{ minHeight: '520px' }}>
            <div className="mb-4">
              <div className="d-flex align-items-center gap-2 text-muted mb-2">
                <FaLightbulb />
                <span className="fw-semibold">Preguntas sugeridas</span>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => handleSuggestionClick(question)}
                    disabled={isSending}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-grow-1 overflow-auto pe-1" style={{ maxHeight: '420px' }}>
              <div className="d-flex flex-column gap-3">
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <div
                      key={message.id}
                      className={`d-flex ${isUser ? 'justify-content-end' : 'justify-content-start'}`}
                      aria-live="polite"
                    >
                      <div className={`d-flex align-items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                        <div
                          className={`rounded-circle d-flex align-items-center justify-content-center ${
                            isUser ? 'bg-primary text-white' : 'bg-light text-primary'
                          }`}
                          style={{ width: '40px', height: '40px' }}
                        >
                          {isUser ? <FaUser /> : <FaRobot />}
                        </div>
                        <div
                          className={`rounded-4 shadow-sm px-3 py-2 ${
                            isUser ? 'bg-primary text-white' : 'bg-white'
                          }`}
                          style={{ maxWidth: '540px' }}
                        >
                          <div className={`small mb-1 ${isUser ? 'text-white-50' : 'text-muted'}`}>
                            {isUser ? 'Tú' : 'GestioBot'} · {formatDateTime(message.createdAt)}
                          </div>
                          {renderMessageContent(message.content)}
                          {!isUser && message.snapshotGeneratedAt ? (
                            <div className="small text-muted mt-2">
                              Datos actualizados: {formatDateTime(message.snapshotGeneratedAt)}
                            </div>
                          ) : null}
                          {!isUser && message.usage ? (
                            <div className="small text-muted mt-1">
                              Tokens — entrada: {message.usage.promptTokenCount ?? '—'}, salida: {message.usage.candidatesTokenCount ?? '—'}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
          <div className="card-footer bg-white border-0 pt-0">
            <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
              <textarea
                className="form-control"
                rows="3"
                placeholder="Escribe tu consulta..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                aria-label="Consulta para el asistente de GestioApp"
              ></textarea>
              <div className="d-flex justify-content-end">
                <button type="submit" className="btn btn-primary d-flex align-items-center gap-2" disabled={isSending || !input.trim()}>
                  <FaPaperPlane />
                  {isSending ? 'Enviando...' : 'Enviar consulta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIAssistantPage;
