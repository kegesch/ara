// arad init
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { initAradDir, ARAD_DIR } from '../io/files.js';

export function initCommand(): void {
  const dir = process.cwd();
  const aradPath = join(dir, ARAD_DIR);

  if (existsSync(aradPath)) {
    console.log('Already an ARAD project.');
    return;
  }

  const projectName = dir.split(/[/\\]/).pop() ?? 'project';
  initAradDir(dir, projectName);

  console.log(`Initialized ARAD project "${projectName}":`);
  console.log(`  ${ARAD_DIR}/`);
  console.log(`    arad.yaml`);
  console.log(`    requirements/`);
  console.log(`    assumptions/`);
  console.log(`    decisions/`);
  console.log('');
  console.log('Commit .arad/ to git — it lives alongside your code.');
}
