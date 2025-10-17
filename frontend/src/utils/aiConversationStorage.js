const STORAGE_PREFIX = 'gestio:ai-conversation:';

const isBrowserEnvironment = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getStorage = () => {
  if (!isBrowserEnvironment()) {
    return null;
  }
  return window.localStorage;
};

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const sanitizeMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const role = message.role === 'assistant' ? 'assistant' : 'user';
  const content = typeof message.content === 'string' ? message.content : '';

  if (!content.trim()) {
    return null;
  }

  const sanitized = {
    ...message,
    role,
    content,
    id: typeof message.id === 'string' && message.id ? message.id : createId(),
  };

  if (typeof sanitized.createdAt !== 'string' || Number.isNaN(Date.parse(sanitized.createdAt))) {
    sanitized.createdAt = new Date().toISOString();
  }

  return sanitized;
};

const buildStorageKey = (userId) => {
  if (!userId || typeof userId !== 'string') {
    return null;
  }
  return `${STORAGE_PREFIX}${userId}`;
};

export const loadConversation = (userId) => {
  const storage = getStorage();
  const key = buildStorageKey(userId);
  if (!storage || !key) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      storage.removeItem(key);
      return null;
    }

    const sanitizedMessages = parsed
      .map((item) => sanitizeMessage(item))
      .filter(Boolean);

    return sanitizedMessages.length > 0 ? sanitizedMessages : null;
  } catch (error) {
    console.warn('No se pudo recuperar la conversación del asistente IA almacenada.', error);
    storage.removeItem(key);
    return null;
  }
};

export const saveConversation = (userId, messages) => {
  const storage = getStorage();
  const key = buildStorageKey(userId);
  if (!storage || !key || !Array.isArray(messages)) {
    return;
  }

  const sanitizedMessages = messages
    .map((item) => sanitizeMessage(item))
    .filter(Boolean);

  if (sanitizedMessages.length === 0) {
    storage.removeItem(key);
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(sanitizedMessages));
  } catch (error) {
    console.warn('No se pudo guardar la conversación del asistente IA.', error);
  }
};

export const clearConversation = (userId) => {
  const storage = getStorage();
  const key = buildStorageKey(userId);
  if (!storage || !key) {
    return;
  }
  storage.removeItem(key);
};

export const clearAllConversations = () => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const keysToRemove = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === 'string' && key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    storage.removeItem(key);
  });
};
