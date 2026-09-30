/** Turns any picked image into a square-fitted PNG (transparent padding), so logos are small and consistent. */
export async function logoToPng(file: Blob, size = 256): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Η εικόνα δεν μπόρεσε να επεξεργαστεί.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Η εικόνα δεν διαβάστηκε. Δοκίμασε PNG ή JPG."));
    img.src = src;
  });
}
/** Image → PNG data URL (for the PDF). Returns null if it cannot be loaded. */
export async function imageDataUrl(src: string, size = 160): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight, 1);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
