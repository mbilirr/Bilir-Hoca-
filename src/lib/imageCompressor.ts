/**
 * Utility to compress image files and data URLs to lightweight JPEG base64 strings
 * so that they easily fit in localStorage without exceeding storage quotas.
 */
export async function compressImageToDataUrl(
  input: Blob | string,
  maxWidth = 180,
  maxHeight = 180,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const handleDataUrl = (dataUrl: string) => {
      // If it's already an SVG or tiny emoji svg data url, no need to re-encode
      if (dataUrl.startsWith('data:image/svg+xml')) {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          // Fallback if canvas draw fails
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    };

    if (typeof input === 'string') {
      handleDataUrl(input);
    } else if (input instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleDataUrl(reader.result);
        } else {
          reject(new Error('Dosya okunamadı.'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(input);
    } else {
      resolve('');
    }
  });
}
