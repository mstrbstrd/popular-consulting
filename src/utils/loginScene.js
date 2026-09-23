// Section identity is separate from the legacy renderer's reserved Orb/Game slots.
export const LOGIN_SECTION_INDEX = 4;
export const LOGIN_DITHER_SECTION = 6;
export const LOGIN_BLACK_HOLE_ZOOM = 82;
export const LOGIN_PRESET = Object.freeze({
  speed: 0.26, contrast: 2.25, warp: 0.08, rainbowSpeed: 0.34, shape: 8,
});

export const isLoginPath = (pathname = '/') =>
  /^\/login(?:\/index\.html)?\/?$/.test(pathname);

// Spectral aperture: breathing, counter-flowing ribbons surrounding quiet space.
// Shared verbatim by desktop and optimized mobile; no additional canvas or pass.
export const LOGIN_APERTURE_GLSL = `
float sceneLoginAperture(vec2 uv, float t) {
  vec2 p = (uv - .5) * vec2(u_res.x / max(u_res.y, 1.), 1.);
  float r = length(p);
  float a = atan(p.y, p.x);
  float breath = .34 + .022 * sin(t * .6);
  float rings = sin(32. * (r - breath) - t * .7 + .7 * sin(a * 3. + t * .23));
  float braid = sin(7. * a + 2.4 * sin(6. * r - t * .35) + t * .32);
  float drift = sin(12. * r - 3. * a + t * .28);
  float envelope = smoothstep(.18, .30, r) * (1. - smoothstep(.72, 1.35, r));
  return clamp(.5 + (.28 * rings + .12 * braid + .08 * drift) * envelope, 0., 1.);
}
`;
