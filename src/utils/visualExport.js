function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeAscii(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function formatOffset(value) {
  return String(value).padStart(10, "0");
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadDataUrl(filename, dataUrl) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function createPdfFromJpegDataUrl(dataUrl, imageWidth, imageHeight) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("No se pudo preparar la imagen para PDF.");
  const jpegBytes = decodeBase64(base64);

  const landscape = imageWidth >= imageHeight;
  const pageWidth = landscape ? 841.89 : 595.28;
  const pageHeight = landscape ? 595.28 : 841.89;
  const margin = 24;
  const scale = Math.min(
    (pageWidth - margin * 2) / imageWidth,
    (pageHeight - margin * 2) / imageHeight,
  );
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const content = `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${drawX.toFixed(3)} ${drawY.toFixed(3)} cm\n/Im0 Do\nQ\n`;
  const contentBytes = encodeAscii(content);

  const objects = [
    encodeAscii("<< /Type /Catalog /Pages 2 0 R >>"),
    encodeAscii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encodeAscii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatBytes([
      encodeAscii(`<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(imageWidth))} /Height ${Math.max(1, Math.round(imageHeight))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
      jpegBytes,
      encodeAscii("\nendstream"),
    ]),
    concatBytes([
      encodeAscii(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      encodeAscii("endstream"),
    ]),
  ];

  const header = encodeAscii("%PDF-1.4\n%âãÏÓ\n");
  const chunks = [header];
  const offsets = [0];
  let currentOffset = header.length;

  objects.forEach((object, index) => {
    const prefix = encodeAscii(`${index + 1} 0 obj\n`);
    const suffix = encodeAscii("\nendobj\n");
    offsets.push(currentOffset);
    chunks.push(prefix, object, suffix);
    currentOffset += prefix.length + object.length + suffix.length;
  });

  const xrefOffset = currentOffset;
  const xrefLines = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${formatOffset(offset)} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ];
  chunks.push(encodeAscii(xrefLines.join("\n")));

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}
