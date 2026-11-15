import { cutout } from './cutout.js';
// Câmera (QR Code / código de barras) e imagem do produto
const loadZX = () => window.ZXing ? Promise.resolve() : new Promise((ok, err) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  s.onload = ok; s.onerror = err; document.head.append(s);
});

// Abre a câmera e devolve o texto do primeiro código lido (ou null se cancelar)
export async function scanCode() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
  catch { alert('Não foi possível abrir a câmera. Verifique a permissão do navegador ou digite o código.'); return null; }
  const dlg = document.createElement('dialog'); dlg.className = 'scan';
  const video = document.createElement('video'); video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream;
  const msg = document.createElement('p'); msg.textContent = 'Aponte para o QR Code ou código de barras';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'btn'; x.textContent = 'Cancelar';
  dlg.append(video, msg, x); document.body.append(dlg);
  return new Promise(async res => {
    let stop = false;
    const end = code => { stop = true; stream.getTracks().forEach(t => t.stop()); dlg.close(); dlg.remove(); res(code || null); };
    x.onclick = () => end(null); dlg.oncancel = e => { e.preventDefault(); end(null); };
    dlg.showModal(); video.play().catch(() => {});
    let det = null, zx = null; const canvas = document.createElement('canvas');
    try {
      if ('BarcodeDetector' in window) det = new BarcodeDetector({ formats: await BarcodeDetector.getSupportedFormats() });
      else { await loadZX(); zx = new ZXing.MultiFormatReader(); }
    } catch { alert('Leitura pela câmera indisponível agora. Digite o código.'); return end(null); }
    const tick = async () => {
      if (stop) return;
      try {
        let code = '';
        if (det) { const r = await det.detect(video); code = r[0] ? r[0].rawValue : ''; }
        else if (video.videoWidth) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          try { code = zx.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)))).getText(); } catch {}
        }
        if (code) return end(code);
      } catch {}
      setTimeout(tick, 250);
    };
    tick();
  });
}

// Imagem do produto (foto da câmera ou arquivo): o fundo liso vira transparente, o produto é recortado e ajustado a um tamanho
// padrão (retrato 240x320, proporção 3:4), centralizado. Guardada em WebP com transparência (PNG se o navegador não gerar WebP).
export const IMG_W = 240, IMG_H = 320;
export async function productImage(src, { tol = 40, keep = false } = {}) {
  const bmp = await createImageBitmap(src);   // já respeita a rotação das fotos do celular
  const k = Math.min(1, 700 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
  let bx = 0, by = 0, bw = w, bh = h;
  if (!keep) {
    const id = g.getImageData(0, 0, w, h), box = cutout(id.data, w, h, tol);
    if (box) { g.putImageData(id, 0, 0); bx = Math.max(0, box.x0 - 2); by = Math.max(0, box.y0 - 2); bw = Math.min(w - bx, box.x1 - box.x0 + 5); bh = Math.min(h - by, box.y1 - box.y0 + 5); }
  }
  const out = document.createElement('canvas'); out.width = IMG_W; out.height = IMG_H;
  const o = out.getContext('2d'), m = 6, s = Math.min((IMG_W - 2 * m) / bw, (IMG_H - 2 * m) / bh, 2), dw = bw * s, dh = bh * s;
  o.imageSmoothingQuality = 'high'; o.drawImage(c, bx, by, bw, bh, (IMG_W - dw) / 2, (IMG_H - dh) / 2, dw, dh);
  const webp = out.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : out.toDataURL('image/png');
}

// Tenta ler um código de barras / QR Code dentro de uma foto (devolve o texto ou null)
export async function codeFromImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({ formats: await BarcodeDetector.getSupportedFormats() }), r = await det.detect(bmp);
      return r[0] ? r[0].rawValue : null;
    }
    await loadZX();
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    return new ZXing.MultiFormatReader().decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)))).getText();
  } catch { return null; }
}
