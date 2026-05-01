// arad rename <id> <new-id> [--title "New title"]
import { readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { readAllEntities, requireAradProject, updateEntity, slugify, writeEntity } from '../io/files.js';
import { ENTITY_CONFIG, getTypeFromId } from '../types.js';
import type { Entity, Decision, Requirement, Assumption, EntityType } from '../types.js';
import { colorId, green, yellow, dim } from '../display/format.js';

export function renameCommand(id: string, newId: string, options?: { title?: string }): void {
  requireAradProject();

  const entities = readAllEntities();
  const entity = entities.find(e => e.id === id);
  if (!entity) {
    console.error(`Entity ${colorId(id)} not found.`);
    process.exit(1);
  }

  // Validate new ID
  try {
    const newType = getTypeFromId(newId);
    if (newType !== entity.type) {
      console.error(yellow(`Cannot rename ${entity.type} ${id} to ${newId}: type mismatch (would become ${newType}).`));
      process.exit(1);
    }
  } catch (e) {
    console.error(`Invalid new ID "${newId}": ${(e as Error).message}`);
    process.exit(1);
  }

  // Check new ID doesn't already exist
  if (entities.some(e => e.id === newId)) {
    console.error(yellow(`Entity ${colorId(newId)} already exists.`));
    process.exit(1);
  }

  const oldId = entity.id;

  // Update title if provided
  if (options?.title) {
    entity.title = options.title.trim();
  }

  // Update ID
  entity.id = newId;

  // Remove old file, write new one
  removeOldFile(oldId, entity.type);
  const relPath = writeEntity(process.cwd(), entity);

  // Update references in all other entities
  let updatedRefs = 0;
  for (const other of entities) {
    if (other.id === newId) continue; // skip the renamed entity itself
    let changed = false;

    switch (other.type) {
      case 'decision': {
        const d = other as Decision;
        if (d.driven_by.includes(oldId)) {
          d.driven_by = d.driven_by.map(ref => ref === oldId ? newId : ref);
          changed = true;
        }
        if (d.enables.includes(oldId)) {
          d.enables = d.enables.map(ref => ref === oldId ? newId : ref);
          changed = true;
        }
        if (d.supersedes === oldId) {
          d.supersedes = newId;
          changed = true;
        }
        break;
      }
      case 'requirement': {
        const r = other as Requirement;
        if (r.derived_from.includes(oldId)) {
          r.derived_from = r.derived_from.map(ref => ref === oldId ? newId : ref);
          changed = true;
        }
        if (r.conflicts_with.includes(oldId)) {
          r.conflicts_with = r.conflicts_with.map(ref => ref === oldId ? newId : ref);
          changed = true;
        }
        break;
      }
      case 'assumption': {
        const a = other as Assumption;
        if (a.promoted_to === oldId) {
          a.promoted_to = newId;
          changed = true;
        }
        break;
      }
    }

    if (changed) {
      updateEntity(process.cwd(), other);
      updatedRefs++;
    }
  }

  console.log(green(`✓ Renamed ${colorId(oldId)} → ${colorId(newId)}`));
  if (options?.title) {
    console.log(dim(`  Title: "${options.title}"`));
  }
  if (updatedRefs > 0) {
    console.log(dim(`  Updated ${updatedRefs} reference(s) in other entities`));
  }
}

function removeOldFile(oldId: string, type: EntityType): void {
  const config = ENTITY_CONFIG[type];
  const aradPath = join(process.cwd(), '.arad');
  const folder = join(aradPath, config.folder);
  if (!existsSync(folder)) return;

  const files = readdirSync(folder).filter(f => f.startsWith(oldId + '-') && f.endsWith('.md'));
  for (const file of files) {
    unlinkSync(join(folder, file));
  }
}
