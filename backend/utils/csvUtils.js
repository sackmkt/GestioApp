const formatDateTime = (value) => {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const normalizeValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  if (value instanceof Date) {
    return formatDateTime(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)).join(' | ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const escapeCsvValue = (value) => {
  const stringValue = normalizeValue(value);
  if (stringValue === '') {
    return '';
  }

  const needsEscaping = /[",\n\r;]/.test(stringValue);
  if (!needsEscaping) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const toCsv = (rows, columns) => {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(',');
  const lines = rows.map((row) => columns.map((column) => {
    const value = typeof column.value === 'function'
      ? column.value(row)
      : row[column.field];
    return escapeCsvValue(value);
  }).join(','));

  return [header, ...lines].join('\r\n');
};

module.exports = {
  toCsv,
  formatDateTime,
};
