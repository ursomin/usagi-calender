'use strict';

// Keep the standalone demo in sync with the desktop application's actual UI.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'src');
const mimeTypes = { '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const inlineAsset = relativePath => {
  const bytes = fs.readFileSync(path.join(source, relativePath));
  return `data:${mimeTypes[path.extname(relativePath)]};base64,${bytes.toString('base64')}`;
};
const inlineReferences = text => text.replace(/assets\/[\w./-]+\.(?:png|svg|ttf|woff2)/g, inlineAsset);
const styles = inlineReferences(fs.readFileSync(path.join(source, 'styles.css'), 'utf8'));
const script = inlineReferences(fs.readFileSync(path.join(source, 'app.js'), 'utf8'))
  .replace("const demo = new URLSearchParams(location.search).has('demo');", 'const demo = true;');
const html = inlineReferences(fs.readFileSync(path.join(source, 'index.html'), 'utf8'))
  .replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${styles}\n</style>`)
  .replace(/\s*<script defer src="app.js"><\/script>/, '')
  .replace('</body>', () => `<script>\n${script}\n</script>\n</body>`);
fs.writeFileSync(path.join(root, 'preview.html'), html);
console.log('Updated standalone preview.html');
