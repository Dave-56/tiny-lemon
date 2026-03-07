import { put } from '@vercel/blob';

/**
 * Upload an image buffer to Vercel Blob.
 * @param buffer   PNG image buffer
 * @param pathname Storage path e.g. "models/my-store.myshopify.com/clxyz.png"
 * @returns Public Blob URL
 */
export async function uploadImageToBlob(buffer: Buffer, pathname: string): Promise<string> {
  const { url } = await put(pathname, buffer, {
    access: 'public',
    contentType: 'image/png',
    token: process.env.BLOB_READ_WRITE_TOKEN!,
  });
  return url;
}
