import { put } from '@vercel/blob';

/**
 * Upload a buffer to Vercel Blob with an explicit content type.
 * Used for raw (uncleaned) flat lay uploads so the job can fetch and process them.
 */
export async function uploadBufferToBlob(
  buffer: Buffer,
  pathname: string,
  contentType: string = 'image/png',
): Promise<string> {
  const { url } = await put(pathname, buffer, {
    access: 'public',
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN!,
  });
  return url;
}

/**
 * Upload an image buffer to Vercel Blob (PNG).
 * @param buffer   PNG image buffer
 * @param pathname Storage path e.g. "models/my-store.myshopify.com/clxyz.png"
 * @returns Public Blob URL
 */
export async function uploadImageToBlob(buffer: Buffer, pathname: string): Promise<string> {
  return uploadBufferToBlob(buffer, pathname, 'image/png');
}
