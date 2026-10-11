// Shrinks a photo in the browser before it is uploaded: at most `maxEdge`
// pixels on the long side, saved as JPEG. Phone cameras produce files of
// several megabytes; this keeps uploads small and quick on mobile data.
// If the browser cannot decode the file, the original is returned unchanged
// (the server still checks its type and size).
export async function downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

// Uploads the entry photo for a visit through this site's /api proxy.
export async function uploadVisitPhoto(visitId: number, file: File): Promise<void> {
  const image = await downscaleImage(file);
  const res = await fetch(`/api/visits/${visitId}/photo`, {
    method: "PUT",
    headers: { "Content-Type": image.type || "application/octet-stream" },
    body: image,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "The photo could not be saved.");
  }
}
