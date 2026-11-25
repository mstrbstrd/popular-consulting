import { build } from 'esbuild';

// The field shader is assembled when its module runs: study shaders are
// interpolated, and the council palette is generated from provider colourways.
// Evaluate the real module rather than copying literals out of the source, so
// browser checks compile exactly what the app ships.
export async function loadCreatorOSFieldShaders() {
  const result = await build({
    entryPoints: ['src/components/CreatorOSFieldShader.js'], bundle: true, write: false,
    format: 'esm', platform: 'neutral', loader: { '.js': 'jsx' }, logLevel: 'silent',
  });
  const source = result.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return { vertex: module.CREATOROS_FIELD_VERTEX_SHADER, fragment: module.CREATOROS_FIELD_FRAGMENT_SHADER };
}
