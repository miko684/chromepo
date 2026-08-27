self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  event.waitUntil(new Promise(resolve => setTimeout(resolve, 400)).then(() => {
    const memory = navigator.deviceMemory;
    let webGLVendor;
    let webGLRenderer;
    let canvasSignature;
    try {
      const canvas = new OffscreenCanvas(240, 60);
      const context = canvas.getContext('2d');
      if (context) {
        context.font = '16px Arial';
        context.fillStyle = '#173f5f';
        context.fillText('Chrome Power fingerprint', 6, 28);
        let hash = 5381;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 0; index < pixels.length; index++) hash = ((hash << 5) + hash) ^ pixels[index];
        canvasSignature = String(hash >>> 0);
      }
      const gl = canvas.getContext('webgl');
      webGLVendor = gl?.getParameter(37445);
      webGLRenderer = gl?.getParameter(37446);
    } catch {}
    event.source?.postMessage({
      type: 'fingerprint-context-result',
      value: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: [...navigator.languages],
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: memory,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvasSignature,
        webGLVendor,
        webGLRenderer,
      },
    });
  }));
});
