import { createNavierStokesFluid } from "./navierStokesFluid";

const mockGl = () => {
  let boundTexture, framebuffer, unit = 0;
  const attached = new Map(), sampled = new Map();
  const gl = {
    TEXTURE0: 0, TEXTURE_2D: 3553, FRAMEBUFFER: 36160, FRAMEBUFFER_COMPLETE: 36053,
    getExtension: jest.fn(() => ({})), getParameter: jest.fn(() => null),
    createProgram: jest.fn(() => ({})), createShader: jest.fn(() => ({})),
    shaderSource: jest.fn(), compileShader: jest.fn(), getShaderParameter: jest.fn(() => true),
    attachShader: jest.fn(), linkProgram: jest.fn(), getProgramParameter: jest.fn(() => true),
    getUniformLocation: jest.fn((_, name) => name),
    createVertexArray: jest.fn(() => ({})), bindVertexArray: jest.fn(), deleteVertexArray: jest.fn(),
    createBuffer: jest.fn(() => ({})), bindBuffer: jest.fn(), bufferData: jest.fn(),
    enableVertexAttribArray: jest.fn(), vertexAttribPointer: jest.fn(), deleteBuffer: jest.fn(),
    createTexture: jest.fn(() => ({})), createFramebuffer: jest.fn(() => ({})),
    bindTexture: jest.fn((_, texture) => { boundTexture = texture; sampled.set(unit, texture); }),
    bindFramebuffer: jest.fn((_, value) => { framebuffer = value; }),
    activeTexture: jest.fn(value => { unit = value; }),
    texImage2D: jest.fn(), texParameteri: jest.fn(),
    framebufferTexture2D: jest.fn(() => attached.set(framebuffer, boundTexture)),
    checkFramebufferStatus: jest.fn(() => 36053), useProgram: jest.fn(), viewport: jest.fn(),
    uniform1i: jest.fn(), uniform1f: jest.fn(), uniform2f: jest.fn(), clearColor: jest.fn(), clear: jest.fn(),
    drawArrays: jest.fn(() => {
      for (const i of [0, 1]) expect(sampled.get(i)).not.toBe(attached.get(framebuffer));
    }),
    deleteTexture: jest.fn(), deleteFramebuffer: jest.fn(), deleteShader: jest.fn(), deleteProgram: jest.fn(),
  };
  return gl;
};

test("unsupported float targets select the local illustration without allocation", () => {
  const gl = mockGl(); gl.getExtension.mockReturnValue(null);
  expect(createNavierStokesFluid(gl)).toBeNull();
  expect(gl.createTexture).not.toHaveBeenCalled();
  expect(gl.createProgram).not.toHaveBeenCalled();
});

test.each([false, true])("fixed fluid budget and distinct read/write targets (mobile=%s)", mobile => {
  const gl = mockGl(); const sharedVao = {};
  gl.getParameter.mockReturnValue(sharedVao);
  const fluid = createNavierStokesFluid(gl, mobile);
  expect(fluid).not.toBeNull();
  expect(gl.createTexture).toHaveBeenCalledTimes(9);
  expect(fluid.size).toBe(mobile ? 96 : 128);
  expect(fluid.dyeSize).toBe(mobile ? 256 : 384);
  fluid.reset(0.4);
  const previous = fluid.texture;
  gl.drawArrays.mockClear();
  fluid.step(1000, [NaN, Infinity], [-Infinity, 1000]);
  expect(gl.drawArrays).toHaveBeenCalledTimes(fluid.iterations + 6);
  expect(fluid.texture).not.toBe(previous);
  expect(gl.uniform1f).toHaveBeenCalledWith("u_dt", 1 / 30);
  expect(gl.bindVertexArray).toHaveBeenLastCalledWith(sharedVao);
  fluid.step(1 / 30, null, null);
  for (const [, value] of gl.uniform1f.mock.calls) expect(Number.isFinite(value)).toBe(true);
  for (const [, a, b] of gl.uniform2f.mock.calls) {
    expect(Number.isFinite(a)).toBe(true); expect(Number.isFinite(b)).toBe(true);
  }
  const count = gl.drawArrays.mock.calls.length;
  for (const dt of [NaN, Infinity, -1, 0, "0.1"]) fluid.step(dt);
  expect(gl.drawArrays).toHaveBeenCalledTimes(count);
  expect(gl.createTexture).toHaveBeenCalledTimes(9);
  fluid.dispose(); fluid.dispose(); fluid.step(1 / 30); fluid.reset(0.3);
  expect(gl.drawArrays).toHaveBeenCalledTimes(count);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(9);
  expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(9);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
  expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
});

test("partial target failure releases successful allocations", () => {
  const gl = mockGl();
  gl.checkFramebufferStatus.mockReturnValueOnce(36053).mockReturnValueOnce(0);
  expect(createNavierStokesFluid(gl)).toBeNull();
  expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
  expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
});

test.each(["compile", "link", "vertex"])("partial %s failure releases the helper", failure => {
  const gl = mockGl();
  if (failure === "compile") gl.getShaderParameter.mockReturnValue(false);
  if (failure === "link") gl.getProgramParameter.mockReturnValue(false);
  if (failure === "vertex") gl.createBuffer.mockReturnValue(null);
  expect(createNavierStokesFluid(gl)).toBeNull();
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(gl.deleteShader).toHaveBeenCalledTimes(failure === "compile" ? 1 : 2);
  expect(gl.createTexture).not.toHaveBeenCalled();
});
