import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaRobot, FaUser, FaInfoCircle, FaLightbulb } from 'react-icons/fa';
import aiAssistantService from '../services/AIAssistantService';
import { useFeedback } from '../context/FeedbackContext.jsx';
import '../styles/ai-assistant.css';

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

const renderMessageContent = (text) => {
  if (!text) {
    return null;
  }

  return (
    <div className="ai-message__paragraphs">
      {text
        .split(/\n{2,}/)
        .map((block, blockIndex) => {
          const fragments = block.split(/(\*\*[^*]+\*\*)/g);
          return (
            <p key={`block-${blockIndex}`}>
              {fragments.map((fragment, fragmentIndex) => {
                if (fragment.startsWith('**') && fragment.endsWith('**')) {
                  return (
                    <strong key={`fragment-${fragmentIndex}`}>
                      {fragment.slice(2, -2).replace(/\n+/g, ' ')}
                    </strong>
                  );
                }
                return (
                  <React.Fragment key={`fragment-${fragmentIndex}`}>
                    {fragment.replace(/\n+/g, ' ')}
                  </React.Fragment>
                );
              })}
            </p>
          );
        })}
    </div>
  );
};

function AIAssistantPage({ currentUser }) {
  const { showError } = useFeedback();
  const [messages, setMessages] = useState(() => [
    createMessage(
      'assistant',
      '¡Hola! Soy GestioBot. Pregúntame por pacientes, turnos, facturación u obras sociales y te compartiré datos claros para seguir.',
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
    <div className="ai-assistant-page">
      <div className="ai-assistant-shell" role="main">
        <header className="ai-assistant-header">
          <div className="ai-assistant-header__icon" aria-hidden="true">
            <FaRobot size={26} />
          </div>
          <div className="ai-assistant-header__copy">
            <h1>Asistente inteligente</h1>
            <p>
              Consulta en lenguaje natural por pacientes, turnos, facturación, obras sociales y más. GestioBot te responde con datos actualizados y próximos pasos claros.
            </p>
          </div>
        </header>
        <section className="ai-assistant-banner" aria-live="polite">
          <FaInfoCircle aria-hidden="true" />
          <p>
            Las respuestas se basan en la información registrada en GestioApp. Si falta algo, el asistente te guiará para completarlo.
            {professionalName ? ` ¡Vamos, ${professionalName}!` : ''}
          </p>
        </section>
        <div className="ai-chat" role="region" aria-live="polite" aria-label="Conversación con GestioBot">
          <div className="ai-chat__messages">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <article
                  key={message.id}
                  className={`ai-message ${isUser ? 'ai-message--user' : 'ai-message--assistant'}`}
                >
                  <div className="ai-message__avatar" aria-hidden="true">
                    {isUser ? <FaUser /> : <FaRobot />}
                  </div>
                  <div className="ai-message__bubble">
                    <div className="ai-message__meta">
                      <span>{isUser ? 'Tú' : 'GestioBot'}</span>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <div className="ai-message__content">{renderMessageContent(message.content)}</div>
                  </div>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className="ai-chat__composer">
            <textarea
              id="aiMessage"
              className="ai-chat__input"
              rows="2"
              placeholder="Escribe tu consulta..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              aria-label="Consulta para el asistente de GestioApp"
            ></textarea>
            <button type="submit" className="ai-chat__send" disabled={isSending || !input.trim()}>
              <FaPaperPlane aria-hidden="true" />
              <span>{isSending ? 'Enviando…' : 'Enviar consulta'}</span>
            </button>
          </form>
        </div>
        <section className="ai-assistant-suggestions" aria-label="Preguntas sugeridas">
          <div className="ai-assistant-suggestions__title">
            <FaLightbulb aria-hidden="true" />
            <span>Ideas para comenzar</span>
          </div>
          <div className="ai-assistant-suggestions__list">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="ai-assistant-chip"
                onClick={() => handleSuggestionClick(question)}
                disabled={isSending}
              >
                {question}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AIAssistantPage;
