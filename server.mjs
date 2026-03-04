import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 8080);
const root = process.cwd();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const safePath = normalize(urlPath).replace(/^\.\.(\/|\\|$)/, '');
  let filePath = join(root, safePath === '/' ? 'index.html' : safePath);

  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const type = contentTypes[extname(filePath)] || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  createReadStream(filePath).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Server listening on ${port}`);
});
