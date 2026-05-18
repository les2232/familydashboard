import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

async function ensureParentDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function readJsonFile(filePath, fallbackValue) {
  try {
    const contents = await readFile(filePath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }

    throw error;
  }
}

export async function writeJsonFile(filePath, value) {
  await ensureParentDir(filePath);
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}
