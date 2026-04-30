// arad add <type> [title]
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type { Entity, EntityType } from '../types.js';
import { ENTITY_CONFIG } from '../types.js';
import { getNextId, writeEntity, slugify, requireAradProject, readAllEntities } from '../io/files.js';

/**
 * Simple stdin line reader that works with piped input.
 * Falls back to readline for TTY (interactive) mode.
 */
async function readLines(count: number): Promise<string[]> {
  if (!process.stdin.isTTY) {
    // Piped mode — read lines from stdin
    return new Promise((resolve) => {
      const lines: string[] = [];
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { buf += chunk; });
      process.stdin.on('end', () => {
        const allLines = buf.split('\n');
        for (let i = 0; i < count; i++) {
          lines.push(allLines[i] ?? '');
        }
        resolve(lines);
      });
      process.stdin.resume();
    });
  }

  // TTY mode — use readline
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    const line = await new Promise<string>(resolve => rl.question('', resolve));
    lines.push(line);
  }
  rl.close();
  return lines;
}

interface AddOptions {
  drivenBy?: string;
  status?: string;
  tags?: string;
}

export async function addCommand(
  type: EntityType,
  titleArg?: string,
  options?: AddOptions,
): Promise<void> {
  requireAradProject();

  // If title is not provided and we're in non-interactive mode, bail
  if (!titleArg && !process.stdin.isTTY) {
    console.error('Title is required in non-interactive mode.');
    console.error('Usage: arad add <type> "Title here"');
    process.exit(1);
  }

  // Title
  let title = titleArg ?? '';
  if (!title && process.stdin.isTTY) {
    process.stdout.write('Title: ');
    const lines = await readLines(1);
    title = lines[0].trim();
  }
  if (!title) {
    console.error('Title is required.');
    return;
  }

  const config = ENTITY_CONFIG[type];
  const id = getNextId(process.cwd(), type);
  const date = new Date().toISOString().split('T')[0];

  // Status
  let status = options?.status?.trim() || '';
  if (!status) {
    if (process.stdin.isTTY) {
      process.stdout.write(`Status (${config.statuses.join('/')}) [${config.statuses[0]}]: `);
      const lines = await readLines(1);
      status = lines[0].trim() || config.statuses[0];
    } else {
      status = config.statuses[0];
    }
  }
  if (!config.statuses.includes(status)) {
    console.error(`Invalid status "${status}". Must be one of: ${config.statuses.join(', ')}`);
    return;
  }

  // Tags
  let tagsInput = options?.tags || '';
  if (!tagsInput && process.stdin.isTTY) {
    process.stdout.write('Tags (comma-separated): ');
    const lines = await readLines(1);
    tagsInput = lines[0].trim();
  }
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Validate referenced IDs
  const allEntities = readAllEntities();
  const entityIds = new Set(allEntities.map(e => e.id));

  function validateIds(ids: string[]): string[] {
    const invalid = ids.filter(id => !entityIds.has(id));
    if (invalid.length > 0) {
      console.error(`  ⚠ Unknown IDs: ${invalid.join(', ')} (saved as dangling references)`);
    }
    return ids;
  }

  let entity: Entity;

  switch (type) {
    case 'requirement': {
      let derived: string[] = [];
      let conflicts: string[] = [];

      if (process.stdin.isTTY) {
        process.stdout.write('Derived from (R-IDs, comma-separated): ');
        const lines = await readLines(1);
        const derivedInput = lines[0].trim();
        derived = derivedInput ? validateIds(derivedInput.split(',').map(s => s.trim()).filter(Boolean)) : [];

        process.stdout.write('Conflicts with (R-IDs, comma-separated): ');
        const lines2 = await readLines(1);
        const conflictsInput = lines2[0].trim();
        conflicts = conflictsInput ? validateIds(conflictsInput.split(',').map(s => s.trim()).filter(Boolean)) : [];
      }

      entity = {
        type: 'requirement', id, title: title.trim(), status: status as any, date, tags,
        derived_from: derived, conflicts_with: conflicts, body: '', filePath: '',
      };
      break;
    }
    case 'assumption': {
      entity = {
        type: 'assumption', id, title: title.trim(), status: status as any, date, tags,
        body: '', filePath: '',
      };
      break;
    }
    case 'decision': {
      let driven_by: string[] = [];
      let enables: string[] = [];
      let supersedes = '';

      const drivenInput = options?.drivenBy || '';
      if (drivenInput) {
        driven_by = validateIds(drivenInput.split(',').map(s => s.trim()).filter(Boolean));
      } else if (process.stdin.isTTY) {
        process.stdout.write('Driven by (R/A-IDs, comma-separated): ');
        const lines = await readLines(1);
        const input = lines[0].trim();
        driven_by = input ? validateIds(input.split(',').map(s => s.trim()).filter(Boolean)) : [];
      }

      if (process.stdin.isTTY) {
        process.stdout.write('Enables (D-IDs, comma-separated): ');
        const lines = await readLines(1);
        const enablesInput = lines[0].trim();
        enables = enablesInput ? validateIds(enablesInput.split(',').map(s => s.trim()).filter(Boolean)) : [];

        process.stdout.write('Supersedes (D-ID, or empty): ');
        const lines2 = await readLines(1);
        supersedes = lines2[0].trim();
      }

      entity = {
        type: 'decision', id, title: title.trim(), status: status as any, date, tags,
        driven_by, enables, supersedes: supersedes || undefined, body: '', filePath: '',
      };
      break;
    }
  }

  // Open editor for body (only interactive)
  if (process.stdin.isTTY) {
    process.stdout.write('Open editor for description? [y/N]: ');
    const lines = await readLines(1);
    if (lines[0].trim().toLowerCase() === 'y') {
      const tmpFile = join(process.cwd(), '.arad', `tmp-${id}.md`);
      writeFileSync(tmpFile, config.template(title.trim()), 'utf-8');
      try {
        const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
        execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
        entity.body = readFileSync(tmpFile, 'utf-8').trim();
      } finally {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
      }
    } else {
      entity.body = config.template(title.trim());
    }
  } else {
    entity.body = config.template(title.trim());
  }

  const relPath = writeEntity(process.cwd(), entity);
  console.log(`\nCreated ${id}: ${title.trim()}`);
  console.log(`  .arad/${relPath}`);
}
