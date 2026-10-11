import { readFile, writeFile } from 'node:fs/promises';
import { proposeAuthorityBindings } from '../lib/authority-binding-proposals.js';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: propose-authority-bindings.mjs input.json output.json');
const config = JSON.parse(await readFile(input, 'utf8'));
const result = proposeAuthorityBindings(config.fixtures, config.canonicalFixtures, config.mappings);
await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ proposals: result.proposals.length, unresolved: result.unresolved.length, mode: result.mode }));
