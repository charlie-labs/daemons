import { validateCatalogFile, writeGeneratedCatalog } from './catalog';
import type { ValidationError } from './types';

export async function runGenerateCli(repoRoot: string): Promise<void> {
  const result = await writeGeneratedCatalog(repoRoot);
  if (!result.ok) {
    exitWithErrors(result.errors);
    return;
  }

  process.stdout.write(`Generated examples.json with ${result.value.examples.length.toString()} examples.\n`);
}

export async function runValidateCli(repoRoot: string): Promise<void> {
  const result = await validateCatalogFile(repoRoot);
  if (!result.ok) {
    exitWithErrors(result.errors);
    return;
  }

  process.stdout.write(`examples.json is valid with ${result.value.examples.length.toString()} examples.\n`);
}

function exitWithErrors(errors: readonly ValidationError[]): never {
  process.stderr.write(`${JSON.stringify(errors, null, 2)}\n`);
  process.exit(1);
}
