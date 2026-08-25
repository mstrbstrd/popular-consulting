import { VisualRuntimeRenderTargetPool } from "./visualRuntimeRenderTargetPool";

const createGl = ({ framebufferComplete = true } = {}) => {
  let textureId = 0;
  let framebufferId = 0;
  return {
    RGBA8: 32856,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    LINEAR: 9729,
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    CLAMP_TO_EDGE: 33071,
    FRAMEBUFFER: 36160,
    COLOR_ATTACHMENT0: 36064,
    FRAMEBUFFER_COMPLETE: 36053,
    createTexture: jest.fn(() => ({
      id: `texture-${textureId += 1}`,
    })),
    createFramebuffer: jest.fn(() => ({
      id: `framebuffer-${framebufferId += 1}`,
    })),
    bindTexture: jest.fn(),
    texParameteri: jest.fn(),
    texImage2D: jest.fn(),
    bindFramebuffer: jest.fn(),
    framebufferTexture2D: jest.fn(),
    checkFramebufferStatus: jest.fn(() =>
      framebufferComplete ? 36053 : 0,
    ),
    deleteTexture: jest.fn(),
    deleteFramebuffer: jest.fn(),
  };
};

describe("visual runtime render target pool", () => {
  test("reuses a matching target and replaces a changed allocation", () => {
    const gl = createGl();
    const pool = new VisualRuntimeRenderTargetPool(gl);

    const first = pool.acquire("field", {
      width: 320,
      height: 180,
    });
    const reused = pool.acquire("field", {
      width: 320,
      height: 180,
    });
    expect(reused).toBe(first);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);

    const replacement = pool.acquire("field", {
      width: 640,
      height: 360,
    });
    expect(replacement).not.toBe(first);
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledWith(first.texture);
    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(
      first.framebuffer,
    );
    expect(pool.snapshot()).toMatchObject({
      activeCount: 1,
      createdCount: 2,
      reusedCount: 1,
      releasedCount: 1,
    });
  });

  test("deletes partial resources when framebuffer validation fails", () => {
    const gl = createGl({ framebufferComplete: false });
    const pool = new VisualRuntimeRenderTargetPool(gl);

    expect(() =>
      pool.acquire("broken", { width: 16, height: 16 }),
    ).toThrow("framebuffer is incomplete");
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(pool.snapshot().activeCount).toBe(0);
  });

  test("abandons context-owned resources without deleting after context loss", () => {
    const gl = createGl();
    const pool = new VisualRuntimeRenderTargetPool(gl);
    pool.acquire("transport", { width: 64, height: 64 });

    pool.abandon();
    expect(pool.snapshot().activeCount).toBe(0);
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
  });
});
