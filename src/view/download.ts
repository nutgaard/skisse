// Pixels in a PNG export per Sketch unit, so it stays sharp on high-density screens.
const pngPixelDensity = 2;

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // The download has started by now, and the browser keeps its own copy.
  setTimeout(() => URL.revokeObjectURL(url));
}

export function downloadJson(json: string, name: string) {
  download(new Blob([json], { type: "application/json" }), `${name}.json`);
}

export function downloadSvg(svg: string, name: string) {
  download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("the browser could not load the SVG export as an image"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Rasterises the SVG at twice its size on a white background and downloads it as a PNG. */
export async function downloadPng(svg: string, name: string) {
  const image = await loadImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(image.naturalWidth * pngPixelDensity);
  canvas.height = Math.ceil(image.naturalHeight * pngPixelDensity);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("the browser has no 2D canvas to draw the PNG on");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("the browser could not encode the PNG");
  download(png, `${name}.png`);
}
