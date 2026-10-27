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

// Qualquer foto ou print vira um quadrado 128×128 (recorte centralizado), tamanho único
export function resizeImage(file, size = 128) {
  return new Promise((ok, err) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const m = Math.min(img.width, img.height), g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
      g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); err(new Error('imagem')); }; img.src = url;
  });
}
