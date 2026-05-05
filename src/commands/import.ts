// arad import <path> — import existing ADR markdown files
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { requireAradProject, getNextId, writeEntity, withLock } from '../io/files.js';
import { colorId, green, yellow, dim } from '../display/format.js';

interface ImportedEntity {
  title: string;
  status: string;
  body: string;
  sourceFile: string;
}

/**
 * Parse an ADR-format markdown file.
 * ADRs typically have:
 * - Title as first # heading
 * - Sections: Status, Context, Decision, Consequences
 */
function parseAdr(content: string, fileName: string): ImportedEntity {
  const lines = content.split('\n');

  // Extract title from first # heading
  let title = basename(fileName, '.md').replace(/^\d+[-_]*/, '').replace(/[-_]/g, ' ');
  const firstHeading = lines.find(l => l.startsWith('# '));
  if (firstHeading) {
    title = firstHeading.replace(/^#\s+/, '').trim();
  }

  // Extract status from body
  let status = 'accepted';
  const statusMatch = content.match(/^##\s*Status\s*$/mi);
  if (statusMatch) {
    // Find the status heading line, then look for non-empty content after it
    const statusIdx = lines.findIndex(l => l.match(/^##\s*Status\s*$/i));
    if (statusIdx >= 0) {
      for (let i = statusIdx + 1; i < Math.min(statusIdx + 5, lines.length); i++) {
        const line = lines[i].trim();
        if (!line) continue; // skip blank lines
        const normalized = line.toLowerCase();
        if (normalized.includes('proposed') || normalized.includes('pending')) status = 'proposed';
        else if (normalized.includes('deprecated')) status = 'deprecated';
        else if (normalized.includes('supersed')) status = 'superseded';
        else if (normalized.includes('reject')) status = 'rejected';
        break; // take the first non-empty line after ## Status
      }
    }
  }

  // Body is the whole content (cleaned up)
  const body = content.trim();

  return { title, status, body, sourceFile: fileName };
}

export async function importCommand(sourcePath: string, options?: { type?: string }): Promise<void> {
  requireAradProject();

  const type = options?.type ?? 'adr';

  if (!existsSync(sourcePath)) {
    console.error(`Path not found: ${sourcePath}`);
    process.exit(1);
  }

  // Get all markdown files
  let files: string[];
  try {
    const stat = require('node:fs').statSync(sourcePath);
    if (stat.isDirectory()) {
      files = readdirSync(sourcePath)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => join(sourcePath, f));
    } else {
      files = [sourcePath];
    }
  } catch {
    console.error(`Cannot read: ${sourcePath}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No markdown files found.');
    return;
  }

  console.log(dim(`Importing ${files.length} file(s) as ${type} format...\n`));

  let imported = 0;
  let skipped = 0;

  await withLock(process.cwd(), () => {
    for (const filePath of files) {
      const fileName = basename(filePath);
      const content = readFileSync(filePath, 'utf-8');

      let parsed: ImportedEntity;
      switch (type) {
        case 'adr':
          parsed = parseAdr(content, fileName);
          break;
        default:
          console.error(yellow(`Unknown import type: ${type}. Supported: adr`));
          process.exit(1);
      }

      // Get next decision ID
      const id = getNextId(process.cwd(), 'decision');

      const entity = {
        type: 'decision' as const,
        id,
        title: parsed.title,
        status: parsed.status as any,
        date: new Date().toISOString().split('T')[0],
        tags: ['imported'],
        driven_by: [] as string[],
        enables: [] as string[],
        affects: [] as string[],
        body: parsed.body,
        filePath: '',
      };

      const relPath = writeEntity(process.cwd(), entity);
      console.log(green(`✓ Imported ${colorId(id)}: ${parsed.title}`));
      console.log(dim(`  from ${fileName} → .arad/${relPath}`));
      imported++;
    }
  });

  console.log('');
  console.log(dim(`Imported ${imported} decision(s), skipped ${skipped}.`));
  if (imported > 0) {
    console.log(yellow('⚠ Imported decisions have no driven_by links. Run `arad link` to connect them to requirements/assumptions.'));
  }
}
