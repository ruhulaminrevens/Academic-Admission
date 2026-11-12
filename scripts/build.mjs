import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

const manifest = await read('.openai/hosting.json');
const html = await read('worker/index.html');
const css = await read('worker/styles.css');
const client = await read('worker/client.js');
const editorial = JSON.parse(await read('data/editorial.json'));
let legacy = '';
try {
  legacy = await read('private/admission-tracker.html');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const assets = { html, css, client, editorial, legacy };
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', 'const assets = ' + JSON.stringify(assets) + '\n' + await read('worker/index.js'));
await writeFile('dist/.openai/hosting.json', manifest);
