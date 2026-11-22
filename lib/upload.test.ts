import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  compressImage,
  getExifOrientation,
  applyOrientationTransform,
  DEFAULT_MAX_DIMENSION,
} from './upload';

describe('Image resize and EXIF orientation helper (#113)', () => {
  let createdCanvas: {
    width: number;
    height: number;
    ctx: {
      translate: ReturnType<typeof vi.fn>;
      rotate: ReturnType<typeof vi.fn>;
      scale: ReturnType<typeof vi.fn>;
      drawImage: ReturnType<typeof vi.fn>;
      fillRect: ReturnType<typeof vi.fn>;
      fillStyle: string;
    };
    toBlob: ReturnType<typeof vi.fn>;
  };

  let mockBitmap: {
    width: number;
    height: number;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockBitmap = {
      width: 2000,
      height: 1000,
      close: vi.fn(),
    };

    createdCanvas = {
      width: 0,
      height: 0,
      ctx: {
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
      },
      toBlob: vi.fn((cb: (b: Blob | null) => void, _type: string, _q: number) => {
        cb(new Blob(['compressed-image'], { type: 'image/jpeg' }));
      }),
    };

    vi.stubGlobal('createImageBitmap', vi.fn(async () => mockBitmap as unknown as ImageBitmap));

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          set width(w: number) {
            createdCanvas.width = w;
          },
          get width() {
            return createdCanvas.width;
          },
          set height(h: number) {
            createdCanvas.height = h;
          },
          get height() {
            return createdCanvas.height;
          },
          getContext: () => createdCanvas.ctx,
          toBlob: createdCanvas.toBlob,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resizes landscape image keeping aspect ratio without exceeding max dimension', async () => {
    mockBitmap.width = 2560;
    mockBitmap.height = 1440;
    const file = new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' });

    await compressImage(file, { maxDimension: 1280 });

    expect(createdCanvas.width).toBe(1280);
    expect(createdCanvas.height).toBe(720);
    expect(mockBitmap.close).toHaveBeenCalled();
  });

  it('resizes portrait image keeping aspect ratio without exceeding max dimension', async () => {
    mockBitmap.width = 1000;
    mockBitmap.height = 2000;
    const file = new File(['dummy'], 'portrait.jpg', { type: 'image/jpeg' });

    await compressImage(file, { maxDimension: 1280 });

    expect(createdCanvas.width).toBe(640);
    expect(createdCanvas.height).toBe(1280);
    expect(mockBitmap.close).toHaveBeenCalled();
  });

  it('does NOT upscale images smaller than the maximum dimension', async () => {
    mockBitmap.width = 800;
    mockBitmap.height = 600;
    const file = new File(['dummy'], 'small.jpg', { type: 'image/jpeg' });

    await compressImage(file, { maxDimension: 1280 });

    expect(createdCanvas.width).toBe(800);
    expect(createdCanvas.height).toBe(600);
  });

  it('handles image exactly equal to the maximum dimension without resizing', async () => {
    mockBitmap.width = 1280;
    mockBitmap.height = 720;
    const file = new File(['dummy'], 'exact.jpg', { type: 'image/jpeg' });

    await compressImage(file, { maxDimension: 1280 });

    expect(createdCanvas.width).toBe(1280);
    expect(createdCanvas.height).toBe(720);
  });

  it('passes quality and output format through to canvas.toBlob', async () => {
    const file = new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' });

    await compressImage(file, { maxDimension: 1280, quality: 0.85, outputType: 'image/jpeg' });

    expect(createdCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
  });

  it('throws an explicit error when image decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Decode error')));
    const file = new File(['bad-data'], 'corrupted.heic', { type: 'image/heic' });

    await expect(compressImage(file)).rejects.toThrow(/IMAGE_DECODE_FAILED/);
  });

  it('maps all 8 EXIF orientations to the correct canvas transforms', () => {
    const W = 100;
    const H = 60;

    for (let o = 1; o <= 8; o++) {
      const ctx = {
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const { canvasWidth, canvasHeight } = applyOrientationTransform(ctx, o, W, H);

      switch (o) {
        case 1:
          expect(canvasWidth).toBe(W);
          expect(canvasHeight).toBe(H);
          expect(ctx.translate).not.toHaveBeenCalled();
          expect(ctx.rotate).not.toHaveBeenCalled();
          break;
        case 2:
          expect(canvasWidth).toBe(W);
          expect(canvasHeight).toBe(H);
          expect(ctx.translate).toHaveBeenCalledWith(W, 0);
          expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
          break;
        case 3:
          expect(canvasWidth).toBe(W);
          expect(canvasHeight).toBe(H);
          expect(ctx.translate).toHaveBeenCalledWith(W, H);
          expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
          break;
        case 4:
          expect(canvasWidth).toBe(W);
          expect(canvasHeight).toBe(H);
          expect(ctx.translate).toHaveBeenCalledWith(0, H);
          expect(ctx.scale).toHaveBeenCalledWith(1, -1);
          break;
        case 5:
          expect(canvasWidth).toBe(H);
          expect(canvasHeight).toBe(W);
          expect(ctx.rotate).toHaveBeenCalledWith(0.5 * Math.PI);
          expect(ctx.scale).toHaveBeenCalledWith(1, -1);
          break;
        case 6:
          expect(canvasWidth).toBe(H);
          expect(canvasHeight).toBe(W);
          expect(ctx.translate).toHaveBeenCalledWith(H, 0);
          expect(ctx.rotate).toHaveBeenCalledWith(0.5 * Math.PI);
          break;
        case 7:
          expect(canvasWidth).toBe(H);
          expect(canvasHeight).toBe(W);
          expect(ctx.translate).toHaveBeenCalledWith(H, W);
          expect(ctx.rotate).toHaveBeenCalledWith(0.5 * Math.PI);
          expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
          break;
        case 8:
          expect(canvasWidth).toBe(H);
          expect(canvasHeight).toBe(W);
          expect(ctx.translate).toHaveBeenCalledWith(0, W);
          expect(ctx.rotate).toHaveBeenCalledWith(-0.5 * Math.PI);
          break;
      }
    }
  });

  it('correctly parses EXIF orientation from JPEG buffer', () => {
    // Construct minimal valid JPEG APP1 with EXIF orientation 6
    const buffer = new ArrayBuffer(50);
    const view = new DataView(buffer);
    view.setUint16(0, 0xffd8); // SOI
    view.setUint16(2, 0xffe1); // APP1
    view.setUint16(4, 46); // Length
    view.setUint32(6, 0x45786966); // 'Exif'
    view.setUint16(10, 0x0000); // '\0\0'
    view.setUint16(12, 0x4949); // 'II' (little endian)
    view.setUint16(14, 0x002a, true); // 42
    view.setUint32(16, 8, true); // IFD offset
    view.setUint16(20, 1, true); // 1 entry
    view.setUint16(22, 0x0112, true); // Orientation tag
    view.setUint16(24, 3, true); // SHORT
    view.setUint32(26, 1, true); // Count 1
    view.setUint16(30, 6, true); // Value 6

    expect(getExifOrientation(buffer)).toBe(6);
  });
});
