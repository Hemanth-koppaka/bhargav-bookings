// Browser-side image helpers: decode a picked file and re-encode it smaller
// before upload (keeps uploads fast and strips camera metadata).

export function loadImageFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose a photo."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format isn't supported. Try a JPG or PNG."));
    };
    img.src = url;
  });
}

/** JPEG data URL no larger than `max` pixels on its long edge. */
export function shrinkImage(img: HTMLImageElement, max: number, quality = 0.82) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
