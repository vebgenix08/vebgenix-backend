/**
 * Strips all JSON.stringify() wrappers from build-collection.js variables.
 * JSON.stringify({ ... })         → { ... }
 * JSON.stringify({ ... }, null, 2) → { ... }   (extra args discarded)
 * JSON.stringify(bodyObj, null, 2) → KEPT as-is (first arg is not object/array literal)
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'build-collection.js');
let src = fs.readFileSync(filePath, 'utf8');

function stripJsonStringify(code) {
  const tag = 'JSON.stringify(';
  let result = '';
  let i = 0;
  while (i < code.length) {
    if (code.slice(i, i + tag.length) === tag) {
      // Peek at first non-whitespace char of the argument
      let j = i + tag.length;
      while (j < code.length && (code[j] === ' ' || code[j] === '\n' || code[j] === '\r')) j++;
      const firstArgChar = code[j];

      if (firstArgChar !== '{' && firstArgChar !== '[') {
        // Not an object/array literal — keep as-is (e.g. JSON.stringify(bodyObj, null, 2))
        result += code[i];
        i++;
        continue;
      }

      i += tag.length; // skip 'JSON.stringify('
      let depth = 0;
      let inStr = false;
      let strCh = '';
      const start = i;
      let objEnd = -1; // position right after the outer { } or [ ] closes

      while (i < code.length) {
        const c = code[i];
        if (inStr) {
          if (c === '\\') { i += 2; continue; } // skip escaped char
          if (c === strCh) inStr = false;
        } else {
          if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; }
          else if (c === '(' || c === '{' || c === '[') depth++;
          else if (c === ')' || c === '}' || c === ']') {
            depth--;
            if (depth === 0 && objEnd === -1) {
              // The outer object/array just closed — record its end
              objEnd = i + 1;
            }
            if (depth < 0) {
              // Hit the closing ) of JSON.stringify(
              // Emit only the object/array portion (drop any trailing ", null, 2" etc.)
              result += code.slice(start, objEnd !== -1 ? objEnd : i);
              i++; // skip )
              break;
            }
          }
        }
        i++;
      }
    } else {
      result += code[i++];
    }
  }
  return result;
}

const out = stripJsonStringify(src);
const before = (src.match(/JSON\.stringify/g) || []).length;
const after  = (out.match(/JSON\.stringify/g) || []).length;
console.log(`JSON.stringify: before=${before}, after=${after}, removed=${before - after}`);
fs.writeFileSync(filePath, out);
console.log('Done.');
