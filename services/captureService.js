import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readJsonFile, writeJsonFile } from '../helpers/jsonStore.js';
import { createHttpError } from '../helpers/apiResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CAPTURE_STORE_PATH = join(__dirname, '..', 'data', 'captures.json');
const CAPTURE_TYPES = new Set(['task', 'note', 'reminder']);
export const MAX_CAPTURE_TEXT_LENGTH = 500;

function normalizeType(type) {
  const normalized = String(type || 'task').trim().toLowerCase();
  return CAPTURE_TYPES.has(normalized) ? normalized : 'task';
}

function normalizeDueLabel(value) {
  if (value === 'today' || value === 'tomorrow') return value;
  return null;
}

function normalizePriority(value) {
  return value ? 'high' : null;
}

function buildCategory(type, dueLabel, priority) {
  const parts = [
    type.charAt(0).toUpperCase() + type.slice(1),
    dueLabel === 'today' ? 'Today' : null,
    dueLabel === 'tomorrow' ? 'Tomorrow' : null,
    priority === 'high' ? 'High Priority' : null
  ].filter(Boolean);

  return parts.join(' - ');
}

async function readCaptureStore() {
  const store = await readJsonFile(CAPTURE_STORE_PATH, { items: [] });
  return Array.isArray(store.items) ? store : { items: [] };
}

async function writeCaptureStore(store) {
  await writeJsonFile(CAPTURE_STORE_PATH, store);
}

export function normalizeCaptureInput(payload = {}) {
  const text = String(payload.text || '')
    .replace(/\s+/g, ' ')
    .trim();

  const type = normalizeType(payload.type);
  const dueLabel = normalizeDueLabel(payload.dueLabel);
  const priority = normalizePriority(payload.priority);

  return {
    text,
    type,
    dueLabel,
    priority
  };
}

export async function createCapture(payload = {}) {
  const normalized = normalizeCaptureInput(payload);

  if (!normalized.text) {
    throw createHttpError('Capture text is required', {
      statusCode: 400,
      code: 'CAPTURE_TEXT_REQUIRED'
    });
  }

  if (normalized.text.length > MAX_CAPTURE_TEXT_LENGTH) {
    throw createHttpError(`Capture text is too long. Please keep it under ${MAX_CAPTURE_TEXT_LENGTH} characters.`, {
      statusCode: 400,
      code: 'CAPTURE_TEXT_TOO_LONG',
      details: { maxLength: MAX_CAPTURE_TEXT_LENGTH }
    });
  }

  const now = new Date().toISOString();
  const item = {
    id: randomUUID(),
    text: normalized.text,
    type: normalized.type,
    dueLabel: normalized.dueLabel,
    priority: normalized.priority,
    createdAt: now,
    updatedAt: now,
    source: 'capture'
  };

  const store = await readCaptureStore();
  store.items.unshift(item);
  await writeCaptureStore(store);

  return {
    item,
    source: 'live'
  };
}

export async function getCapturedItems() {
  const store = await readCaptureStore();
  const items = [...store.items].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    data: items.map(item => ({
      id: item.id,
      description: item.text,
      status: 'Active',
      category: buildCategory(item.type, item.dueLabel, item.priority),
      type: item.type,
      priority: item.priority,
      dueLabel: item.dueLabel,
      createdAt: item.createdAt,
      source: item.source
    })),
    source: 'live'
  };
}
