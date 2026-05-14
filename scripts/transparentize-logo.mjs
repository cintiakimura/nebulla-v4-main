import sharp from 'sharp';
import fs from 'fs';

const src = process.argv[2];
const out = process.argv[3] || 'public/nebulla-logo.png';

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const buf = Buffer.from(data);
const stride = 4;

function colorClose(i, r0, g0, b0, tol) {
  const r = buf[i];
  const g = buf[i + 1];
  const b = buf[i + 2];
  return Math.abs(r - r0) <= tol && Math.abs(g - g0) <= tol && Math.abs(b - b0) <= tol;
}

function neighbors(i, visited, q) {
  const pixel = i / stride;
  const x = pixel % w;
  const y = Math.floor(pixel / w);
  const tryPush = (nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const ni = (ny * w + nx) * stride;
    if (visited[ni / stride]) return;
    q.push(ni);
  };
  tryPush(x - 1, y);
  tryPush(x + 1, y);
  tryPush(x, y - 1);
  tryPush(x, y + 1);
}

function floodFromSeed(seedIdx, tol, visited) {
  const r0 = buf[seedIdx];
  const g0 = buf[seedIdx + 1];
  const b0 = buf[seedIdx + 2];
  const maxc = Math.max(r0, g0, b0);
  const minc = Math.min(r0, g0, b0);
  const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
  if (sat > 0.35 && maxc > 90) return 0;

  const q = [seedIdx];
  let filled = 0;
  while (q.length) {
    const i = q.pop();
    if (i === undefined) break;
    const vi = i / stride;
    if (visited[vi]) continue;
    if (!colorClose(i, r0, g0, b0, tol)) continue;
    visited[vi] = 1;
    buf[i + 3] = 0;
    filled++;
    neighbors(i, visited, q);
  }
  return filled;
}

const visited = new Uint8Array(w * h);
const seeds = [0, (w - 1) * stride, (h - 1) * w * stride, ((h - 1) * w + (w - 1)) * stride];
for (const s of seeds) {
  if (!visited[s / stride]) floodFromSeed(s, 28, visited);
}

for (let i = 0; i < buf.length; i += stride) {
  if (buf[i + 3] === 0) continue;
  const r = buf[i];
  const g = buf[i + 1];
  const b = buf[i + 2];
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
  if (maxc >= 248 && minc >= 245) buf[i + 3] = 0;
  else if (maxc >= 210 && minc >= 195 && sat < 0.08) buf[i + 3] = 0;
}

await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(out);

const meta = await sharp(out).metadata();
console.log('wrote', out, 'format', meta.format, 'hasAlpha', meta.hasAlpha, 'bytes', fs.statSync(out).size);
