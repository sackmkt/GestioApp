const { generateChatResponse } = require('../services/aiService');

const sanitizeMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : 'user';
      const content = typeof message.content === 'string' ? message.content.trim() : '';

      if (!content) {
        return null;
      }

      return {
        role: role === 'assistant' || role === 'model' ? 'assistant' : 'user',
        content,
      };
    })
    .filter(Boolean);
};

exports.chat = async (req, res) => {
  try {
    const { messages, temperature } = req.body || {};
    const sanitizedMessages = sanitizeMessages(messages);

    if (sanitizedMessages.length === 0) {
      return res.status(400).json({ message: 'Debes enviar al menos un mensaje válido.' });
    }

    const lastMessage = sanitizedMessages[sanitizedMessages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({ message: 'La última interacción debe corresponder al usuario.' });
    }

    const response = await generateChatResponse({
      user: req.user,
      messages: sanitizedMessages,
      temperature,
    });

    return res.json(response);
  } catch (error) {
    console.error('Error al generar la respuesta del asistente IA:', error);
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error.message || 'No se pudo obtener una respuesta del asistente en este momento.';
    return res.status(status).json({ message });
  }
};
