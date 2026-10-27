// Build step V2: bookmarklet-v2-source.js -> bookmarklet-v2-min.js -> bookmarklet-v2-embedded.txt -> index-v2.html
// Run with: node build-v2.js
// Die V1-Dateien bleiben unberuehrt; dafuer ist build.js zustaendig.
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'bookmarklet-v2-source.js');
const MIN = path.join(DIR, 'bookmarklet-v2-min.js');
const EMB = path.join(DIR, 'bookmarklet-v2-embedded.txt');
const HTML = path.join(DIR, 'index-v2.html');

const KEYWORDS_BEFORE_REGEX = ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await'];

function regexAllowed(prev, out) {
  if (!prev) return true;
  if ('(,=:[!&|?{};+-*%~^<>'.includes(prev)) return true;
  const word = (out.match(/([A-Za-z_$]+)\s*$/) || [])[1];
  return !!word && KEYWORDS_BEFORE_REGEX.includes(word);
}

// Remove comments without touching strings, template literals or regex literals.
function stripComments(src) {
  let out = '';
  let prev = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === c) { i++; break; }
        i++;
      }
      prev = c;
      continue;
    }
    if (c === '/' && regexAllowed(prev, out)) {
      out += c; i++;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        out += src[i];
        if (src[i] === '/' && !inClass) { i++; break; }
        i++;
      }
      while (i < src.length && /[gimsuy]/.test(src[i])) { out += src[i]; i++; }
      prev = 'x';
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const source = fs.readFileSync(SRC, 'utf8');
const min = stripComments(source)
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length)
  .join('\n');

// Sanity check: the minified code must still parse.
new Function(min);

const embedded = 'javascript:' + encodeURIComponent(min);

fs.writeFileSync(MIN, min);
fs.writeFileSync(EMB, embedded);

const html = fs.readFileSync(HTML, 'utf8');
if (!/href="javascript:[^"]*"/.test(html)) throw new Error('Bookmarklet-Link in index-v2.html nicht gefunden.');
const patched = html.replace(/href="javascript:[^"]*"/, () => `href="${embedded}"`);
fs.writeFileSync(HTML, patched);

console.log(`OK  min: ${min.length} Zeichen, href: ${embedded.length} Zeichen`);
