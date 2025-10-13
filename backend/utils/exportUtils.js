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
    return Number.isFinite(value) ? value : '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  if (value instanceof Date) {
    return formatDateTime(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)).join('\n');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const escapeXml = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const resolveCell = (rawValue) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return '<Cell><Data ss:Type="String"></Data></Cell>';
  }

  if (typeof rawValue === 'number') {
    return `<Cell><Data ss:Type="Number">${rawValue}</Data></Cell>`;
  }

  const normalized = normalizeValue(rawValue);
  if (typeof normalized === 'number') {
    return `<Cell><Data ss:Type="Number">${normalized}</Data></Cell>`;
  }

  const escaped = escapeXml(normalized).replace(/\n/g, '&#10;');
  return `<Cell ss:StyleID="WrappedText"><Data ss:Type="String">${escaped}</Data></Cell>`;
};

const resolveHeaderCell = (header) => {
  const escaped = escapeXml(header);
  return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escaped}</Data></Cell>`;
};

const generateExcelBuffer = async (rows, columns, options = {}) => {
  const sheetName = escapeXml(options.sheetName || 'Datos');
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];

  const headerRow = safeColumns.length > 0
    ? `<Row>${safeColumns.map((column) => resolveHeaderCell(column.header || '')).join('')}</Row>`
    : '';

  const bodyRows = safeRows.map((row) => {
    const cells = safeColumns.map((column) => {
      const value = typeof column.value === 'function'
        ? column.value(row)
        : column.field
          ? row[column.field]
          : undefined;
      return resolveCell(value);
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const columnDefinitions = safeColumns.map(() => '<Column ss:AutoFitWidth="1" />').join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<?mso-application progid="Excel.Sheet"?>\n`
    + `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" `
    + `xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:x="urn:schemas-microsoft-com:office:excel" `
    + `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" `
    + `xmlns:html="http://www.w3.org/TR/REC-html40">`
    + `<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">`
    + `<Author>${escapeXml(options.creator || 'GestioApp')}</Author>`
    + `</DocumentProperties>`
    + `<Styles>`
    + `<Style ss:ID="Default" ss:Name="Normal">`
    + '<Alignment ss:Vertical="Bottom"/>'
    + '<Font ss:FontName="Calibri" ss:Size="11"/>'
    + '</Style>'
    + '<Style ss:ID="Header">'
    + '<Font ss:Bold="1"/>'
    + '<Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>'
    + '<Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>'
    + '</Style>'
    + '<Style ss:ID="WrappedText">'
    + '<Alignment ss:Horizontal="Left" ss:Vertical="Top" ss:WrapText="1"/>'
    + '</Style>'
    + '</Styles>'
    + `<Worksheet ss:Name="${sheetName}">`
    + `<Table ss:DefaultRowHeight="15">`
    + columnDefinitions
    + headerRow
    + bodyRows
    + '</Table>'
    + '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">'
    + '<Selected/>'
    + `<FreezePanes/>`
    + `<FrozenNoSplit/>`
    + `<SplitHorizontal>1</SplitHorizontal>`
    + `<TopRowBottomPane>1</TopRowBottomPane>`
    + '<ActivePane>2</ActivePane>'
    + '</WorksheetOptions>'
    + '</Worksheet>'
    + '</Workbook>';

  return Buffer.from(xml, 'utf8');
};

module.exports = {
  generateExcelBuffer,
  formatDateTime,
};
