import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const sourceFiles = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) sourceFiles.push(absolute);
  }
}

collect(sourceRoot);
const violations = [];
const nativeApi = /@tauri-apps\/|\b(?:invoke|listen|getCurrentWindow)\s*\(/;
const shellDetection = /\b(?:navigator\.(?:platform|userAgent)|process\.platform)\b/;
const webkitFileApi = /\bwebkit(?:directory|RelativePath)\b/;
const indexedDbApi = /\bindexedDB\b/;
const forbiddenDomainImport = /from\s+['"][^'"]*(?:\/|^)(?:app|features|services|storage|platform)\//;

for (const absolute of sourceFiles) {
  const relative = path.relative(sourceRoot, absolute).split(path.sep).join('/');
  const source = fs.readFileSync(absolute, 'utf8');
  if (!relative.startsWith('platform/') && nativeApi.test(source)) violations.push(`${relative}: native Tauri API must stay inside src/platform/`);
  if (!relative.startsWith('platform/') && (shellDetection.test(source) || webkitFileApi.test(source))) violations.push(`${relative}: platform-specific detection or WebKit file-picker APIs must stay inside src/platform/`);
  if (!relative.startsWith('storage/') && indexedDbApi.test(source)) violations.push(`${relative}: IndexedDB API must stay inside src/storage/`);
  if (relative.startsWith('domain/') && forbiddenDomainImport.test(source)) violations.push(`${relative}: domain modules must not import app, features, services, storage, or platform code`);
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture boundaries passed for ${sourceFiles.length} source files.`);
}
