/**
 * ExifParser — Extract camera intrinsics from JPEG EXIF data without external libraries.
 * Reads the APP1 (Exif) marker from raw JPEG bytes and parses IFD entries.
 */

export interface CameraIntrinsics {
  focalLength: number;
  fov: number;
  sensorWidth: number;
  aspectRatio: number;
}

interface ExifData {
  focalLength?: number;
  focalLength35mm?: number;
  imageWidth?: number;
  imageHeight?: number;
  make?: string;
  model?: string;
}

// EXIF IFD tag IDs
const TAG_IMAGE_WIDTH = 0xa002; // PixelXDimension
const TAG_IMAGE_HEIGHT = 0xa003; // PixelYDimension
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_FOCAL_LENGTH = 0x920a;
const TAG_FOCAL_LENGTH_35MM = 0xa405;

// Defaults: 50mm on APS-C sensor (23.5mm width)
const DEFAULT_FOCAL_LENGTH = 50;
const DEFAULT_SENSOR_WIDTH = 23.5; // APS-C
const FULL_FRAME_WIDTH = 36; // 35mm full-frame sensor width

/**
 * Read a 16-bit unsigned integer from a DataView respecting endianness.
 */
function readUint16(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): number {
  return view.getUint16(offset, littleEndian);
}

/**
 * Read a 32-bit unsigned integer from a DataView respecting endianness.
 */
function readUint32(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): number {
  return view.getUint32(offset, littleEndian);
}

/**
 * Read a RATIONAL value (two uint32: numerator / denominator).
 */
function readRational(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): number {
  const num = readUint32(view, offset, littleEndian);
  const den = readUint32(view, offset + 4, littleEndian);
  return den !== 0 ? num / den : 0;
}

/**
 * Read an ASCII string from the DataView.
 */
function readAscii(view: DataView, offset: number, length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) {
    const ch = view.getUint8(offset + i);
    if (ch === 0) break; // null terminator
    str += String.fromCharCode(ch);
  }
  return str.trim();
}

/**
 * Parse IFD entries from the TIFF header area.
 * Returns partial ExifData with whatever tags are found.
 */
function parseIFD(
  view: DataView,
  tiffOffset: number,
  ifdOffset: number,
  littleEndian: boolean,
): { exif: Partial<ExifData>; exifIFDPointer?: number } {
  const exif: Partial<ExifData> = {};
  let exifIFDPointer: number | undefined;

  const entryCount = readUint16(view, tiffOffset + ifdOffset, littleEndian);

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = tiffOffset + ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = readUint16(view, entryOffset, littleEndian);
    const type = readUint16(view, entryOffset + 2, littleEndian);
    const count = readUint32(view, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    switch (tag) {
      case TAG_MAKE: {
        // ASCII type (2)
        if (type === 2) {
          const strOffset =
            count > 4
              ? tiffOffset + readUint32(view, valueOffset, littleEndian)
              : valueOffset;
          if (strOffset + count <= view.byteLength) {
            exif.make = readAscii(view, strOffset, count);
          }
        }
        break;
      }
      case TAG_MODEL: {
        if (type === 2) {
          const strOffset =
            count > 4
              ? tiffOffset + readUint32(view, valueOffset, littleEndian)
              : valueOffset;
          if (strOffset + count <= view.byteLength) {
            exif.model = readAscii(view, strOffset, count);
          }
        }
        break;
      }
      case TAG_FOCAL_LENGTH: {
        // RATIONAL type (5)
        if (type === 5 && count === 1) {
          const ratOffset =
            tiffOffset + readUint32(view, valueOffset, littleEndian);
          if (ratOffset + 8 <= view.byteLength) {
            exif.focalLength = readRational(view, ratOffset, littleEndian);
          }
        }
        break;
      }
      case TAG_FOCAL_LENGTH_35MM: {
        // SHORT type (3)
        if (type === 3) {
          exif.focalLength35mm = readUint16(view, valueOffset, littleEndian);
        }
        break;
      }
      case TAG_IMAGE_WIDTH: {
        if (type === 3) {
          exif.imageWidth = readUint16(view, valueOffset, littleEndian);
        } else if (type === 4) {
          exif.imageWidth = readUint32(view, valueOffset, littleEndian);
        }
        break;
      }
      case TAG_IMAGE_HEIGHT: {
        if (type === 3) {
          exif.imageHeight = readUint16(view, valueOffset, littleEndian);
        } else if (type === 4) {
          exif.imageHeight = readUint32(view, valueOffset, littleEndian);
        }
        break;
      }
      case 0x8769: {
        // ExifIFD pointer — points to sub-IFD with more tags
        exifIFDPointer = readUint32(view, valueOffset, littleEndian);
        break;
      }
    }
  }

  return { exif, exifIFDPointer };
}

/**
 * Parse EXIF data from a raw ArrayBuffer of a JPEG file.
 * Scans for the APP1 marker (0xFFE1) and reads TIFF-structured IFDs.
 */
function parseExifFromBuffer(buffer: ArrayBuffer): ExifData | null {
  const view = new DataView(buffer);

  // Verify JPEG SOI marker
  if (view.byteLength < 4) return null;
  if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;

  // Scan for APP1 marker (0xFF 0xE1)
  let offset = 2;
  while (offset < view.byteLength - 4) {
    if (view.getUint8(offset) !== 0xff) {
      offset++;
      continue;
    }

    const marker = view.getUint8(offset + 1);

    // End markers — stop scanning
    if (marker === 0xda || marker === 0xd9) break;

    const segmentLength = view.getUint16(offset + 2, false);

    if (marker === 0xe1) {
      // Check for "Exif\0\0" header
      const exifHeader =
        view.getUint8(offset + 4) === 0x45 && // E
        view.getUint8(offset + 5) === 0x78 && // x
        view.getUint8(offset + 6) === 0x69 && // i
        view.getUint8(offset + 7) === 0x66 && // f
        view.getUint8(offset + 8) === 0x00 &&
        view.getUint8(offset + 9) === 0x00;

      if (!exifHeader) {
        offset += 2 + segmentLength;
        continue;
      }

      // TIFF header starts after "Exif\0\0"
      const tiffOffset = offset + 10;

      // Determine byte order
      const byteOrder = readUint16(view, tiffOffset, false);
      const littleEndian = byteOrder === 0x4949; // "II"
      // byteOrder === 0x4D4D means big-endian "MM"

      // Validate TIFF magic number (42)
      const magic = readUint16(view, tiffOffset + 2, littleEndian);
      if (magic !== 0x002a) {
        offset += 2 + segmentLength;
        continue;
      }

      // Offset to first IFD
      const firstIFDOffset = readUint32(view, tiffOffset + 4, littleEndian);

      // Parse IFD0
      const { exif, exifIFDPointer } = parseIFD(
        view,
        tiffOffset,
        firstIFDOffset,
        littleEndian,
      );

      // Parse Exif sub-IFD if pointer exists
      if (exifIFDPointer !== undefined) {
        const { exif: subExif } = parseIFD(
          view,
          tiffOffset,
          exifIFDPointer,
          littleEndian,
        );
        Object.assign(exif, subExif);
      }

      return exif as ExifData;
    }

    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * Derive sensor width from focal length and 35mm-equivalent focal length.
 * sensorWidth = focalLength / focalLength35mm * 36
 */
function deriveSensorWidth(
  focalLength?: number,
  focalLength35mm?: number,
): number {
  if (focalLength && focalLength35mm && focalLength35mm > 0) {
    return (focalLength / focalLength35mm) * FULL_FRAME_WIDTH;
  }
  return DEFAULT_SENSOR_WIDTH;
}

/**
 * Calculate horizontal field of view in degrees.
 * fov = 2 * atan(sensorWidth / (2 * focalLength)) * (180 / PI)
 */
function calculateFOV(sensorWidth: number, focalLength: number): number {
  if (focalLength <= 0) return 60; // safe fallback
  return 2 * Math.atan(sensorWidth / (2 * focalLength)) * (180 / Math.PI);
}

/**
 * Extract camera intrinsics from a JPEG File.
 * Returns null only if file reading fails entirely; otherwise provides
 * defaults when EXIF is missing (50mm, APS-C sensor).
 */
export async function extractCameraIntrinsics(
  file: File,
): Promise<CameraIntrinsics | null> {
  try {
    // Read first 128KB — EXIF is always near the start of the file
    const slice = file.slice(0, 128 * 1024);
    const buffer = await slice.arrayBuffer();
    const exif = parseExifFromBuffer(buffer);

    const focalLength = exif?.focalLength ?? DEFAULT_FOCAL_LENGTH;
    const focalLength35mm = exif?.focalLength35mm;
    const sensorWidth = deriveSensorWidth(focalLength, focalLength35mm);
    const fov = calculateFOV(sensorWidth, focalLength);

    // Aspect ratio from EXIF dimensions or fallback to 3:2
    let aspectRatio = 3 / 2;
    if (exif?.imageWidth && exif?.imageHeight && exif.imageHeight > 0) {
      aspectRatio = exif.imageWidth / exif.imageHeight;
    }

    return {
      focalLength,
      fov,
      sensorWidth,
      aspectRatio,
    };
  } catch {
    // File reading failed — return defaults
    return {
      focalLength: DEFAULT_FOCAL_LENGTH,
      fov: calculateFOV(DEFAULT_SENSOR_WIDTH, DEFAULT_FOCAL_LENGTH),
      sensorWidth: DEFAULT_SENSOR_WIDTH,
      aspectRatio: 3 / 2,
    };
  }
}
