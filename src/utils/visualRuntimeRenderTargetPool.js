const positiveInteger = (value, fallback = 1) => {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0
    ? numeric
    : fallback;
};

const sameSpec = (left, right) =>
  left.width === right.width &&
  left.height === right.height &&
  left.internalFormat === right.internalFormat &&
  left.format === right.format &&
  left.type === right.type &&
  left.minFilter === right.minFilter &&
  left.magFilter === right.magFilter;

export class VisualRuntimeRenderTargetPool {
  constructor(gl) {
    if (!gl) {
      throw new Error("render target pool requires a WebGL2 context");
    }
    this.gl = gl;
    this.targets = new Map();
    this.createdCount = 0;
    this.reusedCount = 0;
    this.releasedCount = 0;
    this.disposed = false;
  }

  normalizeSpec(spec = {}) {
    const gl = this.gl;
    return {
      width: positiveInteger(spec.width),
      height: positiveInteger(spec.height),
      internalFormat: spec.internalFormat ?? gl.RGBA8 ?? gl.RGBA,
      format: spec.format ?? gl.RGBA,
      type: spec.type ?? gl.UNSIGNED_BYTE,
      minFilter: spec.minFilter ?? gl.LINEAR,
      magFilter: spec.magFilter ?? gl.LINEAR,
    };
  }

  createTarget(key, spec) {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();

    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new Error(`render target ${key} allocation failed`);
    }

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        spec.minFilter,
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        spec.magFilter,
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE,
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE,
      );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        spec.internalFormat,
        spec.width,
        spec.height,
        0,
        spec.format,
        spec.type,
        null,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );

      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
        gl.FRAMEBUFFER_COMPLETE
      ) {
        throw new Error(
          `render target ${key} framebuffer is incomplete`,
        );
      }
    } catch (error) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    this.createdCount += 1;
    return {
      key,
      ...spec,
      texture,
      framebuffer,
    };
  }

  acquire(key, requestedSpec = {}) {
    if (this.disposed) {
      throw new Error("render target pool is disposed");
    }

    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      throw new Error("render target key is required");
    }
    const spec = this.normalizeSpec(requestedSpec);
    const current = this.targets.get(normalizedKey);

    if (current && sameSpec(current, spec)) {
      this.reusedCount += 1;
      return current;
    }

    if (current) this.release(normalizedKey);
    const target = this.createTarget(normalizedKey, spec);
    this.targets.set(normalizedKey, target);
    return target;
  }

  release(key) {
    const normalizedKey = String(key || "").trim();
    const target = this.targets.get(normalizedKey);
    if (!target) return false;

    this.targets.delete(normalizedKey);
    try {
      this.gl.deleteFramebuffer(target.framebuffer);
      this.gl.deleteTexture(target.texture);
    } catch (_) {
      // Context loss already owns the underlying resources.
    }
    this.releasedCount += 1;
    return true;
  }

  abandon() {
    this.targets.clear();
  }

  clear() {
    Array.from(this.targets.keys()).forEach((key) =>
      this.release(key),
    );
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  snapshot() {
    return {
      disposed: this.disposed,
      activeCount: this.targets.size,
      createdCount: this.createdCount,
      reusedCount: this.reusedCount,
      releasedCount: this.releasedCount,
      targets: Array.from(this.targets.values()).map((target) => ({
        key: target.key,
        width: target.width,
        height: target.height,
        internalFormat: target.internalFormat,
        format: target.format,
        type: target.type,
      })),
    };
  }
}
