import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');
const outDir = path.resolve(process.cwd(), 'standalone');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('Run "npm run build" first to generate dist/index.html.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// Inline stylesheet links
html = html.replace(
  /<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (match, href) => {
    const cleanPath = href.replace(/^\//, '');
    const cssFile = path.join(distDir, cleanPath);
    if (fs.existsSync(cssFile)) {
      const css = fs.readFileSync(cssFile, 'utf8');
      return `<style>${css}</style>`;
    }
    return match;
  }
);

// Inline module script
html = html.replace(
  /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (match, src) => {
    const cleanPath = src.replace(/^\//, '');
    const jsFile = path.join(distDir, cleanPath);
    if (fs.existsSync(jsFile)) {
      let js = fs.readFileSync(jsFile, 'utf8');
      // Inline generated /src/assets/images/*.jpg references as base64 data URIs
      js = js.replace(/\/src\/assets\/images\/([a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp))/g, (imgMatch, fileName) => {
        const imgPath = path.join(distDir, 'src', 'assets', 'images', fileName);
        if (fs.existsSync(imgPath)) {
          const ext = path.extname(fileName).slice(1).toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          const b64 = fs.readFileSync(imgPath).toString('base64');
          return `data:${mime};base64,${b64}`;
        }
        return imgMatch;
      });
      // Escape closing script tags safely
      js = js.replace(/<\/script>/gi, '<\\/script>');
      return `<script type="module">${js}</script>`;
    }
    return match;
  }
);

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'index.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Standalone single-file bundle created at: ${outFile} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
