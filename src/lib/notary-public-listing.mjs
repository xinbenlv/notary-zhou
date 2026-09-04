import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { inflateRawSync } from 'node:zlib';

export const NOTARY_LISTING_URL =
  'https://notary.cdn.sos.ca.gov/export/active-notary.zip';

export const NOTARY_REFRESH_TIME_ZONE = 'America/Los_Angeles';

const EXPECTED_HEADER = [
  'Notary Name',
  'Business Name',
  'Street Address',
  'City',
  'State',
  'Zip Code',
  'County Nbr',
  'Commission Nbr',
  'Expiration Date',
].join('\t');

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MIN_EXPECTED_RECORDS = 100_000;
const MAX_EXPECTED_RECORDS = 500_000;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const pacificDateTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: NOTARY_REFRESH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * @typedef {object} NotaryRecord
 * @property {string} name
 * @property {string | null} businessName
 * @property {string} city
 * @property {string} state
 * @property {string} zipCode
 * @property {string} countyNumber
 * @property {string} commissionNumber
 * @property {string} expirationDate
 */

/**
 * @param {Date} date
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number}}
 */
function getPacificParts(date) {
  const parts = Object.fromEntries(
    pacificDateTimeFormat
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** @param {Date} date */
function getPacificOffsetMilliseconds(date) {
  const parts = getPacificParts(date);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const dateAtWholeSecond = Math.floor(date.getTime() / 1000) * 1000;
  return representedAsUtc - dateAtWholeSecond;
}

/**
 * Converts a local America/Los_Angeles wall-clock time into an instant.
 * The scheduled hour is 07:00, which exists on both DST transition days.
 *
 * @param {{year: number, month: number, day: number, hour: number, minute?: number, second?: number}} parts
 */
function pacificWallClockToDate(parts) {
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute ?? 0,
    parts.second ?? 0,
  );

  let result = wallClockAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const corrected = wallClockAsUtc - getPacificOffsetMilliseconds(new Date(result));
    if (corrected === result) break;
    result = corrected;
  }

  return new Date(result);
}

/**
 * Returns the next 07:00 in California, correctly handling PST/PDT.
 *
 * @param {Date} [now]
 */
export function getNextNotaryRefreshAt(now = new Date()) {
  const local = getPacificParts(now);
  const beforeTodayRefresh = local.hour < 7;

  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (!beforeTodayRefresh) localDate.setUTCDate(localDate.getUTCDate() + 1);

  return pacificWallClockToDate({
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: 7,
  });
}

/** @param {string} value */
function normalizeSearchText(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** @param {string} name */
function makeNameSearchKey(name) {
  const normalized = normalizeSearchText(name);
  const commaIndex = name.indexOf(',');
  if (commaIndex === -1) return normalized;

  const familyName = name.slice(0, commaIndex).trim();
  const givenNames = name.slice(commaIndex + 1).trim();
  const naturalOrder = normalizeSearchText(`${givenNames} ${familyName}`);
  return naturalOrder && naturalOrder !== normalized
    ? `${normalized}\u0000${naturalOrder}`
    : normalized;
}

/**
 * @param {Buffer} zip
 * @returns {Map<string, Buffer>}
 */
export function extractZipEntries(zip) {
  if (zip.length > MAX_ZIP_BYTES) {
    throw new Error(`Notary ZIP is unexpectedly large: ${zip.length} bytes`);
  }

  const minimumEocdOffset = Math.max(0, zip.length - 22 - 65_535);
  let eocdOffset = -1;
  for (let offset = zip.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Notary ZIP has no central directory');

  const diskNumber = zip.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = zip.readUInt16LE(eocdOffset + 6);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = zip.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = zip.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new Error('Multi-disk ZIP files are not supported');
  }
  if (entryCount < 1 || entryCount > 10) {
    throw new Error(`Unexpected ZIP entry count: ${entryCount}`);
  }
  if (centralDirectoryOffset + centralDirectorySize > zip.length) {
    throw new Error('Notary ZIP central directory is out of bounds');
  }

  const entries = new Map();
  let totalUncompressedBytes = 0;
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error('Invalid ZIP central directory entry');
    }

    const flags = zip.readUInt16LE(offset + 8);
    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    if (fileNameEnd + extraLength + commentLength > zip.length) {
      throw new Error('ZIP filename or metadata is out of bounds');
    }
    if (flags & 0x1) throw new Error('Encrypted ZIP entries are not supported');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('ZIP64 entries are not supported');
    }

    const fileName = zip.subarray(fileNameStart, fileNameEnd).toString('utf8');
    if (entries.has(fileName)) throw new Error(`Duplicate ZIP entry: ${fileName}`);
    if (localHeaderOffset + 30 > zip.length) throw new Error('ZIP local header is out of bounds');
    if (zip.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error(`Invalid local ZIP header for ${fileName}`);
    }

    const localFileNameLength = zip.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
    const compressedDataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedDataEnd = compressedDataStart + compressedSize;
    if (compressedDataEnd > zip.length) throw new Error(`ZIP data is out of bounds for ${fileName}`);

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('Notary ZIP expands beyond the configured safety limit');
    }

    const compressed = zip.subarray(compressedDataStart, compressedDataEnd);
    let uncompressed;
    if (compressionMethod === 0) {
      uncompressed = Buffer.from(compressed);
    } else if (compressionMethod === 8) {
      uncompressed = inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
    }

    if (uncompressed.length !== uncompressedSize) {
      throw new Error(`Unexpected uncompressed size for ${fileName}`);
    }
    entries.set(fileName, uncompressed);
    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

/**
 * @param {string} readme
 * @returns {string | null}
 */
export function parseGeneratedAt(readme) {
  const match = readme.match(
    /generated on:\s+\w+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+at:\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i,
  );
  if (!match) return null;

  const month = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ].indexOf(match[1].toLowerCase());
  if (month === -1) return null;

  let hour = Number(match[4]) % 12;
  if (match[6].toUpperCase() === 'PM') hour += 12;

  return pacificWallClockToDate({
    year: Number(match[3]),
    month: month + 1,
    day: Number(match[2]),
    hour,
    minute: Number(match[5]),
  }).toISOString();
}

/**
 * @param {string} text
 * @returns {{rows: string[], nameSearchKeys: string[], byCommission: Map<number, number>}}
 */
export function parseNotaryText(text) {
  const headerEnd = text.indexOf('\n');
  const header = (headerEnd === -1 ? text : text.slice(0, headerEnd)).replace(/\r$/, '');
  if (header !== EXPECTED_HEADER) {
    throw new Error(`Unexpected active-notary.txt header: ${header ?? '<missing>'}`);
  }

  /** @type {string[]} */
  const rows = [];
  /** @type {string[]} */
  const nameSearchKeys = [];
  /** @type {Map<number, number>} */
  const byCommission = new Map();

  let lineStart = headerEnd + 1;
  let lineNumber = 2;
  while (lineStart <= text.length) {
    const nextLineBreak = text.indexOf('\n', lineStart);
    const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, '');
    lineStart = lineEnd + 1;

    if (!line) {
      if (nextLineBreak === -1) break;
      lineNumber += 1;
      continue;
    }

    const fields = line.split('\t');
    if (fields.length !== 9) {
      throw new Error(`Unexpected field count on active-notary.txt line ${lineNumber}`);
    }

    const name = fields[0].trim();
    const commissionNumber = fields[7].trim();
    if (!name || !/^\d+$/.test(commissionNumber)) {
      throw new Error(`Invalid notary record on line ${lineNumber}`);
    }
    const numericCommissionNumber = Number(commissionNumber);
    if (byCommission.has(numericCommissionNumber)) {
      throw new Error(`Duplicate commission number ${commissionNumber}`);
    }

    // Keep a compact, address-free row in memory. Materialize objects only for
    // matching results; 136k JavaScript objects retain substantially more heap.
    rows.push(
      [
        name,
        fields[1].trim(),
        fields[3].trim(),
        fields[4].trim(),
        fields[5].trim(),
        fields[6].trim(),
        commissionNumber,
        fields[8].trim(),
      ].join('\t'),
    );
    nameSearchKeys.push(makeNameSearchKey(name));
    byCommission.set(numericCommissionNumber, rows.length - 1);

    if (nextLineBreak === -1) break;
    lineNumber += 1;
  }

  if (rows.length < MIN_EXPECTED_RECORDS || rows.length > MAX_EXPECTED_RECORDS) {
    throw new Error(`Unexpected notary record count: ${rows.length}`);
  }

  return { rows, nameSearchKeys, byCommission };
}

/**
 * @param {string} row
 * @returns {NotaryRecord}
 */
function materializeRecord(row) {
  const fields = row.split('\t');
  return {
    name: fields[0],
    businessName: fields[1] || null,
    city: fields[2],
    state: fields[3],
    zipCode: fields[4],
    countyNumber: fields[5],
    commissionNumber: fields[6],
    expirationDate: fields[7],
  };
}

/**
 * @param {Buffer | Uint8Array | ArrayBuffer} input
 * @param {{retrievedAt?: string, etag?: string | null, lastModified?: string | null, downloadMs?: number}} [source]
 */
export function buildNotarySnapshot(input, source = {}) {
  const startedAt = performance.now();
  const zip = Buffer.isBuffer(input)
    ? input
    : input instanceof ArrayBuffer
      ? Buffer.from(input)
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  const unzipStartedAt = performance.now();
  const entries = extractZipEntries(zip);
  const activeNotary = entries.get('active-notary.txt');
  const readme = entries.get('readme.txt');
  if (!activeNotary || !readme) {
    throw new Error('Notary ZIP must contain active-notary.txt and readme.txt');
  }
  const unzipMs = performance.now() - unzipStartedAt;

  const parseStartedAt = performance.now();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(activeNotary);
  const parsed = parseNotaryText(text);
  const parseAndIndexMs = performance.now() - parseStartedAt;

  const snapshot = {
    rows: parsed.rows,
    nameSearchKeys: parsed.nameSearchKeys,
    byCommission: parsed.byCommission,
    source: Object.freeze({
      url: NOTARY_LISTING_URL,
      retrievedAt: source.retrievedAt ?? new Date().toISOString(),
      generatedAt: parseGeneratedAt(new TextDecoder().decode(readme)),
      etag: source.etag ?? null,
      lastModified: source.lastModified ?? null,
      sha256: createHash('sha256').update(zip).digest('hex'),
    }),
    metrics: Object.freeze({
      zipBytes: zip.length,
      activeNotaryBytes: activeNotary.length,
      recordCount: parsed.rows.length,
      downloadMs: source.downloadMs ?? 0,
      unzipMs,
      parseAndIndexMs,
      buildMs: performance.now() - startedAt,
    }),
  };

  return Object.freeze(snapshot);
}

/**
 * @param {{
 *   url?: string,
 *   fetch?: typeof globalThis.fetch,
 *   logger?: Pick<Console, 'info' | 'error'>,
 *   requestTimeoutMs?: number,
 * }} [options]
 */
export function createNotaryListingService(options = {}) {
  const url = options.url ?? NOTARY_LISTING_URL;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const logger = options.logger ?? console;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;

  if (typeof fetchImplementation !== 'function') {
    throw new Error('A Fetch API implementation is required');
  }

  let snapshot = null;
  let refreshPromise = null;
  let timer = null;
  let nextRefreshAt = null;
  let stopped = true;

  async function refresh(reason = 'manual') {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const requestStartedAt = performance.now();
      const headers = {
        accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.1',
        'user-agent': 'notaryzhou.com public-data-refresh/1.0',
      };
      if (snapshot?.source.etag) headers['if-none-match'] = snapshot.source.etag;
      if (snapshot?.source.lastModified) headers['if-modified-since'] = snapshot.source.lastModified;

      const response = await fetchImplementation(url, {
        headers,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (response.status === 304 && snapshot) {
        logger.info(`[notary-listing] ${reason}: unchanged (${snapshot.metrics.recordCount} records)`);
        return snapshot;
      }
      if (!response.ok) {
        throw new Error(`Notary listing download failed with HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_ZIP_BYTES) {
        throw new Error(`Notary ZIP Content-Length is unexpectedly large: ${contentLength}`);
      }

      const zip = Buffer.from(await response.arrayBuffer());
      const downloadMs = performance.now() - requestStartedAt;
      const replacement = buildNotarySnapshot(zip, {
        retrievedAt: new Date().toISOString(),
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        downloadMs,
      });

      // Publish only after download, validation, decompression, parsing and indexing all succeed.
      snapshot = replacement;
      logger.info(
        `[notary-listing] ${reason}: loaded ${replacement.metrics.recordCount} records in ` +
          `${(downloadMs + replacement.metrics.buildMs).toFixed(1)} ms`,
      );
      return replacement;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  function scheduleNextRefresh() {
    if (stopped) return;
    nextRefreshAt = getNextNotaryRefreshAt();
    const delay = Math.max(1, nextRefreshAt.getTime() - Date.now());
    timer = setTimeout(async () => {
      try {
        await refresh('scheduled');
      } catch (error) {
        logger.error('[notary-listing] scheduled refresh failed; retaining previous snapshot', error);
      } finally {
        scheduleNextRefresh();
      }
    }, delay);
    timer.unref?.();
  }

  async function start() {
    if (!stopped) return snapshot ?? refreshPromise;
    stopped = false;
    try {
      const initialSnapshot = await refresh('startup');
      scheduleNextRefresh();
      return initialSnapshot;
    } catch (error) {
      stopped = true;
      throw error;
    }
  }

  function stop() {
    stopped = true;
    nextRefreshAt = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  /**
   * @param {{commissionNumber?: string, name?: string, limit?: number}} query
   * @returns {NotaryRecord[]}
   */
  function search(query) {
    if (!snapshot) throw new Error('Notary listing is not loaded');
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    if (query.commissionNumber) {
      const commissionNumber = Number(query.commissionNumber.trim());
      if (!Number.isSafeInteger(commissionNumber)) return [];
      const index = snapshot.byCommission.get(commissionNumber);
      return index === undefined ? [] : [materializeRecord(snapshot.rows[index])];
    }

    const normalizedName = normalizeSearchText(query.name ?? '');
    if (normalizedName.length < 2) return [];

    const matches = [];
    for (let index = 0; index < snapshot.rows.length; index += 1) {
      if (!snapshot.nameSearchKeys[index].includes(normalizedName)) continue;
      matches.push(materializeRecord(snapshot.rows[index]));
      if (matches.length === limit) break;
    }
    return matches;
  }

  function getStatus() {
    return {
      ready: snapshot !== null,
      refreshing: refreshPromise !== null,
      nextRefreshAt: nextRefreshAt?.toISOString() ?? null,
      source: snapshot?.source ?? null,
      metrics: snapshot?.metrics ?? null,
    };
  }

  return { start, stop, refresh, search, getStatus };
}
