import {mkdirSync, writeFileSync} from 'fs';
import path from 'path';

/**
 * Extracts the first JSON object or array from an LLM string response,
 * handling arbitrary text before/after and markdown code fences.
 * Returns the parsed object, or null if none found.
 *
 * Usage example:
 * import { saveJSON } from './src/utils.js';
 *
 * const llmOutput = await prompter.promptConvo(messages);
 * const result = saveJSON(llmOutput, './achievement_hunter/logs/output.json');
 */
export function extractJSON(str) {
  // strip markdown code fences if present
  const fenced = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) str = fenced[1];

  // find start of outermost { } or [ ]
  const start = str.search(/[{[]/);
  if (start === -1) return null;

  const openChar = str[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let end = -1;

  for (let i = start; i < str.length; i++) {
    if (str[i] === openChar)
      depth++;
    else if (str[i] === closeChar) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(str.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Extracts the first JSON object from an LLM response string and writes
 * it to filePath (creates parent directories as needed).
 * Returns the parsed object, or null if extraction failed.
 */
export function saveJSON(str, filePath) {
  const obj = extractJSON(str);
  if (obj === null) {
    console.warn('saveJSON: no valid JSON found in LLM response.');
    return null;
  }
  mkdirSync(path.dirname(filePath), {recursive: true});
  writeFileSync(filePath, JSON.stringify(obj, null, 4), 'utf8');
  return obj;
}
