// Empaqueta la app como una sola página HTML (artifact) con el API simulado en el navegador.
// Uso: node demo/build.mjs [salida.html]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(process.argv[2] ?? resolve(raiz, 'demo/dist/profes-tea.html'));
const shim = (f) => resolve(raiz, 'demo/shims', f);

const resultado = await build({
  entryPoints: [resolve(raiz, 'demo/main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  jsx: 'automatic',
  loader: { '.csv': 'text' },
  tsconfig: resolve(raiz, 'tsconfig.json'),
  define: {
    'process.env.NEXT_PUBLIC_DEMO': '"1"',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    react: shim('react.ts'),
    'react/jsx-runtime': shim('jsx-runtime.ts'),
    'react-dom/client': shim('react-dom-client.ts'),
    'next/link': shim('next-link.tsx'),
    'next/navigation': shim('next-navigation.ts'),
  },
});

const js = resultado.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(raiz, 'app/globals.css'), 'utf8');

const html = `<title>Profes TEA</title>
<style>
:root { color-scheme: light; }
${css}
</style>
<div id="root"><div class="boot">Cargando Profes TEA…</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, html);
console.log(`Listo: ${salida} (${(html.length / 1024).toFixed(0)} KB)`);
