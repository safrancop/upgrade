// The app's JavaScript, concatenated in the order index.html loads it.
import {readFileSync} from 'node:fs';
export const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
export const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
export const appSource = scripts.map(src => readFileSync(new URL('../' + src, import.meta.url), 'utf8')).join('\n');
