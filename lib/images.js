// Photo processing with sharp. Pure (buffer in, buffers out) so it is trivially testable and the
// storage layer stays separate. Auto-rotates via EXIF orientation, then strips all metadata
// (sharp drops metadata unless withMetadata() is called) so GPS/EXIF never leak. Outputs WebP.
import sharp from 'sharp';

// The first spec is the primary variant (its URL becomes the stored media/photo/avatar URL);
// the second, when present, is the list/feed thumbnail.
export const IMAGE_VARIANTS = {
  feed: [
    { name: 'feed', width: 1080 },
    { name: 'thumb', width: 480 },
  ],
  avatar: [{ name: 'avatar', width: 256 }],
};

const WEBP_QUALITY = 80;

/**
 * Resize one source image into its variant set.
 * @returns {{ variants: Array<{name,buffer,contentType,width,height}>, sourceWidth, sourceHeight }}
 */
export async function processImage(buffer, { variant = 'feed' } = {}) {
  const specs = IMAGE_VARIANTS[variant] || IMAGE_VARIANTS.feed;
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  const variants = [];
  for (const spec of specs) {
    const { data, info } = await sharp(buffer, { failOn: 'none' })
      .rotate() // apply EXIF orientation before stripping metadata
      .resize({ width: spec.width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    variants.push({ name: spec.name, buffer: data, contentType: 'image/webp', width: info.width, height: info.height });
  }
  return { variants, sourceWidth: meta.width ?? null, sourceHeight: meta.height ?? null };
}

export default { IMAGE_VARIANTS, processImage };
