const path = require('path');

const EXCEL_XML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const EXCEL_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const sanitizeSheetName = (name) => {
  if (!name) {
    return 'Hoja1';
  }
  const invalidChars = /[\\/*?:\[\]]/g;
  const cleaned = name.replace(invalidChars, '').trim();
  if (!cleaned) {
    return 'Hoja1';
  }
  return cleaned.slice(0, 31);
};

const toColumnLetter = (index) => {
  let dividend = index + 1;
  let columnName = '';

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName;
};

const escapeXml = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const createSheetXml = (columns, rows, sheetName) => {
  const safeSheetName = sanitizeSheetName(sheetName);
  const totalColumns = Math.max(columns.length, 1);
  const totalRows = rows.length + 1; // include header row
  const lastColumnLetter = toColumnLetter(totalColumns - 1);
  const dimension = `A1:${lastColumnLetter}${Math.max(totalRows, 1)}`;

  const headerRowXml = (() => {
    const cells = columns.map((column, columnIndex) => {
      const cellRef = `${toColumnLetter(columnIndex)}1`;
      return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(column.header)}</t></is></c>`;
    }).join('');
    return `<row r="1">${cells}</row>`;
  })();

  const dataRowsXml = rows.map((row, rowIndex) => {
    const excelRowIndex = rowIndex + 2;
    const cells = columns.map((column, columnIndex) => {
      const rawValue = typeof column.value === 'function'
        ? column.value(row)
        : row[column.field];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return '';
      }

      const cellRef = `${toColumnLetter(columnIndex)}${excelRowIndex}`;
      const isNumber = typeof rawValue === 'number' && Number.isFinite(rawValue);
      if (isNumber) {
        return `<c r="${cellRef}" t="n"><v>${rawValue}</v></c>`;
      }

      const valueString = (() => {
        if (rawValue instanceof Date) {
          return rawValue.toISOString();
        }
        return escapeXml(rawValue);
      })();

      return `<c r="${cellRef}" t="inlineStr"><is><t>${valueString}</t></is></c>`;
    }).join('');

    return `<row r="${excelRowIndex}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="${EXCEL_XML_NS}">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetData>${headerRowXml}${dataRowsXml}</sheetData>` +
    `</worksheet>`;
};

const buildWorkbookXml = (sheetName) => {
  const safeSheetName = sanitizeSheetName(sheetName);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="${EXCEL_XML_NS}" xmlns:r="${EXCEL_REL_NS}">` +
    `<sheets>` +
    `<sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/>` +
    `</sheets>` +
    `</workbook>`;
};

const buildWorkbookRelsXml = () => {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${EXCEL_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${EXCEL_REL_NS}/styles" Target="styles.xml"/>` +
    `</Relationships>`;
};

const buildRootRelsXml = () => {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${EXCEL_REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
};

const buildContentTypesXml = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;
};

const buildStylesXml = () => {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<styleSheet xmlns="${EXCEL_XML_NS}">` +
    `<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      if ((c & 1) !== 0) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c >>>= 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (let offset = 0; offset < buffer.length; offset += 1) {
    const byte = buffer[offset];
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createZipArchive = (entries) => {
  const fileParts = [];
  const centralDirectoryParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const filenameBuffer = Buffer.from(entry.name, 'utf8');
    const dataBuffer = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, 'utf8');

    const crc = crc32(dataBuffer);
    const compressionMethod = 0; // store
    const compressedSize = dataBuffer.length;
    const uncompressedSize = dataBuffer.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(filenameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    fileParts.push(localHeader, filenameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature
    centralHeader.writeUInt16LE(0x0314, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
    centralHeader.writeUInt16LE(compressionMethod, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12); // Last mod file time
    centralHeader.writeUInt16LE(0, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedSize, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(filenameBuffer.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDirectoryParts.push(centralHeader, filenameBuffer);

    offset += localHeader.length + filenameBuffer.length + dataBuffer.length;
  });

  const fileData = Buffer.concat(fileParts);
  const centralDirectory = Buffer.concat(centralDirectoryParts);

  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  endOfCentralDir.writeUInt16LE(0, 4); // Number of this disk
  endOfCentralDir.writeUInt16LE(0, 6); // Disk where central directory starts
  endOfCentralDir.writeUInt16LE(entries.length, 8); // Number of central directory records on this disk
  endOfCentralDir.writeUInt16LE(entries.length, 10); // Total central directory records
  endOfCentralDir.writeUInt32LE(centralDirectory.length, 12); // Size of central directory
  endOfCentralDir.writeUInt32LE(fileData.length, 16); // Offset of central directory
  endOfCentralDir.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([fileData, centralDirectory, endOfCentralDir]);
};

const createExcelFileBuffer = ({ sheetName = 'Hoja1', columns = [], rows = [] }) => {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Debes proporcionar al menos una columna para exportar.');
  }

  const normalizedRows = Array.isArray(rows) ? rows : [];

  const sheetXml = createSheetXml(columns, normalizedRows, sheetName);
  const workbookXml = buildWorkbookXml(sheetName);
  const workbookRelsXml = buildWorkbookRelsXml();
  const rootRelsXml = buildRootRelsXml();
  const contentTypesXml = buildContentTypesXml();
  const stylesXml = buildStylesXml();

  return createZipArchive([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: path.posix.join('_rels', '.rels'), data: rootRelsXml },
    { name: path.posix.join('xl', 'workbook.xml'), data: workbookXml },
    { name: path.posix.join('xl', '_rels', 'workbook.xml.rels'), data: workbookRelsXml },
    { name: path.posix.join('xl', 'worksheets', 'sheet1.xml'), data: sheetXml },
    { name: path.posix.join('xl', 'styles.xml'), data: stylesXml },
  ]);
};

module.exports = {
  createExcelFileBuffer,
};
