import zlib from "zlib";

const PNG_SIGNATURE = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10,
]);

const paethPredictor = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (
    leftDistance <= aboveDistance &&
    leftDistance <= upperLeftDistance
  ) {
    return left;
  }
  return aboveDistance <= upperLeftDistance
    ? above
    : upperLeft;
};

export const decodePng = (buffer) => {
  if (
    buffer.length < PNG_SIGNATURE.length ||
    !buffer.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    throw new Error("Invalid PNG signature.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error("PNG chunk exceeds file length.");
    }
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (
    !width ||
    !height ||
    bitDepth !== 8 ||
    ![2, 6].includes(colorType) ||
    interlace !== 0
  ) {
    throw new Error(
      `Unsupported PNG format: ${width}x${height}, depth=${bitDepth}, type=${colorType}, interlace=${interlace}.`,
    );
  }

  const channelCount = colorType === 6 ? 4 : 3;
  const stride = width * channelCount;
  const inflated = zlib.inflateSync(Buffer.concat(idatParts));
  const expectedLength = height * (stride + 1);
  if (inflated.length !== expectedLength) {
    throw new Error(
      `PNG data length mismatch: expected ${expectedLength}, received ${inflated.length}.`,
    );
  }

  const reconstructed = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = row * stride;
    const previousRowOffset = (row - 1) * stride;

    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset + column];
      const left =
        column >= channelCount
          ? reconstructed[rowOffset + column - channelCount]
          : 0;
      const above =
        row > 0
          ? reconstructed[previousRowOffset + column]
          : 0;
      const upperLeft =
        row > 0 && column >= channelCount
          ? reconstructed[
              previousRowOffset + column - channelCount
            ]
          : 0;
      let value;

      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) {
        value = raw + Math.floor((left + above) / 2);
      } else if (filter === 4) {
        value = raw + paethPredictor(left, above, upperLeft);
      } else {
        throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      reconstructed[rowOffset + column] = value & 0xff;
    }
    sourceOffset += stride;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channelCount;
    const target = pixel * 4;
    rgba[target] = reconstructed[source];
    rgba[target + 1] = reconstructed[source + 1];
    rgba[target + 2] = reconstructed[source + 2];
    rgba[target + 3] =
      channelCount === 4 ? reconstructed[source + 3] : 255;
  }

  return { width, height, rgba };
};

let crcTable = null;
const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        value & 1
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
};

const crc32 = (buffer) => {
  let value = 0xffffffff;
  const table = getCrcTable();
  for (const byte of buffer) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    0,
  );
  return Buffer.concat([length, typeBuffer, data, checksum]);
};

export const encodePng = ({ width, height, rgba }) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rows = Buffer.alloc(height * (width * 4 + 1));
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    const target = row * (stride + 1);
    rows[target] = 0;
    rgba.copy(
      rows,
      target + 1,
      row * stride,
      (row + 1) * stride,
    );
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

export const compareImages = (
  reference,
  candidate,
  { pixelDeltaThreshold = 24 } = {},
) => {
  if (
    reference.width !== candidate.width ||
    reference.height !== candidate.height
  ) {
    throw new Error(
      `Screenshot dimensions differ: reference=${reference.width}x${reference.height}, candidate=${candidate.width}x${candidate.height}.`,
    );
  }

  const pixelCount = reference.width * reference.height;
  const diff = Buffer.alloc(pixelCount * 4);
  let absoluteTotal = 0;
  let squaredTotal = 0;
  let mismatchCount = 0;
  let maximumDelta = 0;
  let referenceLuminanceTotal = 0;
  let candidateLuminanceTotal = 0;
  let candidateLuminanceSquaredTotal = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    let pixelMaximum = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(
        reference.rgba[offset + channel] -
          candidate.rgba[offset + channel],
      );
      absoluteTotal += delta;
      squaredTotal += delta * delta;
      pixelMaximum = Math.max(pixelMaximum, delta);
      maximumDelta = Math.max(maximumDelta, delta);
      diff[offset + channel] = Math.min(255, delta * 4);
    }
    diff[offset + 3] = 255;
    if (pixelMaximum > pixelDeltaThreshold) {
      mismatchCount += 1;
    }

    const referenceLuminance =
      (0.2126 * reference.rgba[offset] +
        0.7152 * reference.rgba[offset + 1] +
        0.0722 * reference.rgba[offset + 2]) /
      255;
    const candidateLuminance =
      (0.2126 * candidate.rgba[offset] +
        0.7152 * candidate.rgba[offset + 1] +
        0.0722 * candidate.rgba[offset + 2]) /
      255;
    referenceLuminanceTotal += referenceLuminance;
    candidateLuminanceTotal += candidateLuminance;
    candidateLuminanceSquaredTotal +=
      candidateLuminance * candidateLuminance;
  }

  const channelCount = pixelCount * 3;
  const meanAbsoluteError =
    absoluteTotal / channelCount / 255;
  const rootMeanSquareError =
    Math.sqrt(squaredTotal / channelCount) / 255;
  const candidateMean = candidateLuminanceTotal / pixelCount;
  const candidateVariance = Math.max(
    0,
    candidateLuminanceSquaredTotal / pixelCount -
      candidateMean * candidateMean,
  );

  return {
    width: reference.width,
    height: reference.height,
    pixelCount,
    pixelDeltaThreshold,
    mismatchCount,
    mismatchRatio: mismatchCount / pixelCount,
    meanAbsoluteError,
    rootMeanSquareError,
    maximumDelta: maximumDelta / 255,
    referenceMeanLuminance:
      referenceLuminanceTotal / pixelCount,
    candidateMeanLuminance: candidateMean,
    candidateLuminanceStdDev: Math.sqrt(candidateVariance),
    diff,
  };
};
