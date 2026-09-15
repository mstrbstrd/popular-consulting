// Logos never leave the browser. Reject active formats and remote URLs, decode
// a bounded raster file, then re-encode pixels so metadata is not carried over.
export const readInvoiceLogo = async (file) => {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2000000 || file.size === 0) {
    throw new Error("Choose a PNG, JPEG or WebP logo smaller than 2 MB.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/png" && png) && !(file.type === "image/jpeg" && jpeg) && !(file.type === "image/webp" && webp)) {
    throw new Error("The logo content does not match its image format.");
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.src = ""; reject(new Error("Logo decoding timed out.")); }, 10000);
      image.onerror = () => { clearTimeout(timer); reject(new Error("This logo could not be decoded.")); };
      image.onload = () => {
        clearTimeout(timer);
        try {
          const width = image.naturalWidth;
          const height = image.naturalHeight;
          if (!width || !height || width * height > 16000000 || width > 8192 || height > 8192) {
            throw new Error("Logo dimensions are too large. Use an image under 16 megapixels.");
          }
          const scale = Math.min(1, 1024 / width, 512 / height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Your browser could not process this logo.");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL("image/png");
          if (data.length > 700000) throw new Error("Use a simpler or smaller logo to keep drafts lightweight.");
          resolve(data);
        } catch (error) { reject(error); }
      };
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
};
