// File I/O for ARAD entities

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Entity, EntityType } from '../types';
import { ENTITY_CONFIG } from '../types';
import { parseEntity, serializeEntity } from './parser';

export const ARAD_DIR = '.arad';

/** Check if current directory has been initialized */
export function isAradProject(dir: string = process.cwd()): boolean {
  return existsSync(join(dir, ARAD_DIR));
}

/** Assert this is an ARAD project, exit with message if not */
export function requireAradProject(dir: string = process.cwd()): void {
  if (!isAradProject(dir)) {
    console.error('Not an ARAD project. Run `arad init` first.');
    process.exit(1);
  }
}

/** Read all entities from the .arad/ directory */
export function readAllEntities(dir: string = process.cwd()): Entity[] {
  const entities: Entity[] = [];
  const aradPath = join(dir, ARAD_DIR);

  for (const type of ['requirement', 'assumption', 'decision'] as EntityType[]) {
    const folder = join(aradPath, ENTITY_CONFIG[type].folder);
    if (!existsSync(folder)) continue;

    const files = readdirSync(folder).filter(f => f.endsWith('.md')).sort();
    for (const file of files) {
      const filePath = join(folder, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        entities.push(parseEntity(content, join(ENTITY_CONFIG[type].folder, file)));
      } catch (e) {
        console.error(`  ⚠ Error parsing ${join(ENTITY_CONFIG[type].folder, file)}: ${(e as Error).message}`);
      }
    }
  }

  return entities;
}

/** Determine the next available ID for a given entity type */
export function getNextId(dir: string, type: EntityType): string {
  const aradPath = join(dir, ARAD_DIR);
  const folder = join(aradPath, ENTITY_CONFIG[type].folder);
  const prefix = ENTITY_CONFIG[type].prefix;

  let maxId = 0;
  if (existsSync(folder)) {
    const files = readdirSync(folder).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const match = file.match(new RegExp(`^${prefix}-(\\d+)`));
      if (match) {
        maxId = Math.max(maxId, parseInt(match[1]));
      }
    }
  }

  return `${prefix}-${String(maxId + 1).padStart(3, '0')}`;
}

/** Convert a title to a filesystem-friendly slug */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Write an entity to disk, returns the relative file path */
export function writeEntity(dir: string, entity: Entity): string {
  const aradPath = join(dir, ARAD_DIR);
  const folder = join(aradPath, ENTITY_CONFIG[entity.type].folder);
  mkdirSync(folder, { recursive: true });

  const slug = slugify(entity.title);
  const fileName = `${entity.id}-${slug}.md`;
  const filePath = join(folder, fileName);

  const content = serializeEntity(entity);
  writeFileSync(filePath, content, 'utf-8');

  return join(ENTITY_CONFIG[entity.type].folder, fileName);
}

/** Read a single entity by ID */
export function readEntityById(dir: string, id: string): Entity | null {
  const entities = readAllEntities(dir);
  return entities.find(e => e.id === id) ?? null;
}

/** Update an entity's frontmatter on disk */
export function updateEntity(dir: string, entity: Entity): void {
  // Find the existing file
  const aradPath = join(dir, ARAD_DIR);
  const folder = join(aradPath, ENTITY_CONFIG[entity.type].folder);
  if (!existsSync(folder)) return;

  const files = readdirSync(folder).filter(f => f.startsWith(entity.id + '-') && f.endsWith('.md'));
  if (files.length === 0) return;

  const existingPath = join(folder, files[0]);
  const existingContent = readFileSync(existingPath, 'utf-8');

  // Parse to get body, then rewrite
  const parsed = parseEntity(existingContent, files[0]);
  const updated = { ...entity, body: entity.body || parsed.body };
  const newContent = serializeEntity(updated);

  // If title changed, file name changes too
  const newSlug = slugify(entity.title || parsed.title);
  const newFileName = `${entity.id}-${newSlug}.md`;
  const newPath = join(folder, newFileName);

  if (existingPath !== newPath) {
    unlinkSync(existingPath);
  }
  writeFileSync(newPath, newContent, 'utf-8');
}

/** Initialize the .arad/ directory structure */
export function initAradDir(dir: string, name: string): void {
  const aradPath = join(dir, ARAD_DIR);
  mkdirSync(join(aradPath, 'requirements'), { recursive: true });
  mkdirSync(join(aradPath, 'assumptions'), { recursive: true });
  mkdirSync(join(aradPath, 'decisions'), { recursive: true });
  writeFileSync(join(aradPath, 'arad.yaml'), `name: ${name}\n`, 'utf-8');
}
