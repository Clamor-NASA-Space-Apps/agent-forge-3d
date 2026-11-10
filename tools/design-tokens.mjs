// DESIGN.md front matter -> resolved JSON for the browser (runtime/house-style.js reads it).
//
//   node tools/design-tokens.mjs DESIGN.md [out.json]     (stdout when out is omitted)
//
// "{colors.body}" references are resolved, so consumers never repeat a colour value.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

export function loadDesign(file) {
  const m = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`${file}: no YAML front matter`);
  const d = parse(m[1]);
  const lookup = ref => ref.split('.').reduce((n, k) => {
    if (n?.[k] === undefined) throw new Error(`${file}: broken reference {${ref}}`);
    return n[k];
  }, d);
  const res = v => {
    if (typeof v === 'string') { const r = v.match(/^\{([\w.-]+)\}$/); return r ? res(lookup(r[1])) : v; }
    if (Array.isArray(v)) return v.map(res);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, res(x)]));
    return v;
  };
  return res(d);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, out] = process.argv.slice(2);
  if (!file) { console.error('usage: design-tokens.mjs DESIGN.md [out.json]'); process.exit(2); }
  const json = JSON.stringify(loadDesign(file), null, 1);
  out ? fs.writeFileSync(out, json) : console.log(json);
}
