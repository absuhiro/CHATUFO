// Turns a photo the user picked into a small square JPEG, ready to upload.
// Done in the browser so a 5 MB phone photo becomes ~30 KB before it's ever sent.
export function fileToSquareDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file"));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That image is over 15 MB"));

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Crop the biggest centered square, then scale it down to size x size
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#2b2d31"; // background for transparent PNGs
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}
