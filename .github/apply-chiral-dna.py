from pathlib import Path
from urllib.parse import quote

root = Path('.')
def edit(name, old, new, n=1):
    p = root / name
    s = p.read_text()
    assert s.count(old) == n, (name, old, s.count(old))
    p.write_text(s.replace(old, new))

f = 'src/components/ChiralWeaveShader.js'
edit(f, 'uniform float u_chiralHandedness;', 'uniform float u_chiralHandedness;\nuniform float u_chiralStructure;')
edit(f, 'vec4 sceneChiralWeave(vec2 uv, float time) {', Path('.github/chiral-dna.glsl').read_text() + 'vec4 sceneChiralWeave(vec2 uv, float time) {\n  if (u_chiralStructure > 0.5) return sceneChiralDna(uv, time);')
f = 'src/components/CreatorOSFieldCanvas.js'
edit(f, 'export const normalizeChiralHandedness = (value) => value === -1 ? -1 : 1;', 'export const normalizeChiralHandedness = (value) => value === -1 ? -1 : 1;\nexport const normalizeChiralStructure = (value) => value === "dna" ? "dna" : "classic";')
edit(f, '  chiralHandedness = 1,', '  chiralHandedness = 1,\n  chiralStructure = "classic",')
edit(f, '  const chiralHandednessRef = useRef(normalizeChiralHandedness(chiralHandedness));', '  const chiralHandednessRef = useRef(normalizeChiralHandedness(chiralHandedness));\n  const chiralStructureRef = useRef(normalizeChiralStructure(chiralStructure));')
edit(f, '  }, [chiralHandedness]);', '  }, [chiralHandedness]);\n\n  useEffect(() => {\n    chiralStructureRef.current = normalizeChiralStructure(chiralStructure);\n    redrawRef.current();\n  }, [chiralStructure]);')
edit(f, '      "u_chiralHandedness",', '      "u_chiralHandedness",\n      "u_chiralStructure",')
edit(f, '      gl.uniform1f(activeDisplayUniforms.u_chiralHandedness, chiralHandednessRef.current);', '      gl.uniform1f(activeDisplayUniforms.u_chiralHandedness, chiralHandednessRef.current);\n      gl.uniform1f(activeDisplayUniforms.u_chiralStructure, chiralStructureRef.current === "dna" ? 1 : 0);')
edit(f, '      data-chiral-handedness={normalizeChiralHandedness(chiralHandedness)}', '      data-chiral-handedness={normalizeChiralHandedness(chiralHandedness)}\n      data-chiral-structure={normalizeChiralStructure(chiralStructure)}')
f = 'src/components/DitherCanvasPage.js'
edit(f, '  const [chiralHandedness, setChiralHandedness] = useState(1);', '  const [chiralHandedness, setChiralHandedness] = useState(1);\n  const [chiralStructure, setChiralStructure] = useState("classic");')
edit(f, '        chiralHandedness={chiralHandedness}', '        chiralHandedness={chiralHandedness}\n        chiralStructure={chiralStructure}')
edit(f, '          {activeStudy.id === "chiral-weave" && (\n            <div', '          {activeStudy.id === "chiral-weave" && (\n            <div className="chiral-controls">\n            <div')
edit(f, '''                onClick={() => setChiralHandedness(-1)}>Mirror</button>
            </div>
          )}''', '''                onClick={() => setChiralHandedness(-1)}>Mirror</button>
            </div>
            <div className="metabloom-palette-selector chiral-structure-selector"
              role="group" aria-label="Chiral Weave structure">
              <span className="metabloom-palette-selector-label">Structure</span>
              <button type="button"
                className={`metabloom-palette-option${chiralStructure === "classic" ? " is-active" : ""}`}
                aria-pressed={chiralStructure === "classic"}
                onClick={() => setChiralStructure("classic")}>Classic</button>
              <button type="button"
                className={`metabloom-palette-option${chiralStructure === "dna" ? " is-active" : ""}`}
                aria-pressed={chiralStructure === "dna"}
                onClick={() => setChiralStructure("dna")}>DNA</button>
            </div>
            </div>
          )}''')
edit(f, '"Two ribbon families share a clock but wind in opposite directions. Liquid-chrome folds carry spectral edges: related by reflection, never interchangeable.",', '"Opposite-winding threads share a clock. Keep the classic chrome folds or explore DNA-inspired double helices with beaded backbones, bonded rungs, and molecular rings.",')
edit(f, '"Move to bend the ribbons · tap to send a pressure wave · reflect to exchange handedness without reversing time",', '"Move to bend · tap to pulse · reflect without reversing time · DNA is a molecular illustration, not a simulation",')
f = 'src/components/DitherCanvasPage.css'
p = root / f
s = p.read_text().replace('.chiral-orientation-selector .metabloom-palette-option', '.chiral-controls .metabloom-palette-option')
s = s.replace('/* Chiral orientation is a binary transform, never a new renderer or palette. */', '/* Structure and reflection update uniforms, never renderer ownership. */')
s = s.replace('  min-height: 4.4rem;\n}', '  min-height: max(4.4rem, 44px);\n}')
p.write_text(s)
f = 'src/components/CreatorOSFieldCanvas.css'
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 240" fill="none"><g stroke="#52c8ec" stroke-width="3"><path d="M36 0C36 40 124 80 124 120S36 200 36 240"/><path d="M124 0C124 40 36 80 36 120S124 200 124 240" stroke="#bd77ed"/></g><g stroke="#769ab7" stroke-width="1.5"><path d="M40 24H120M58 48H102M58 72H102M40 96H120M36 120H124M40 144H120M58 168H102M58 192H102M40 216H120"/><path d="M60 90l10-6 10 6v12l-10 6-10-6zM88 150l10-6 10 6v12l-10 6-10-6z"/></g><g fill="#d3edfa"><circle cx="40" cy="24" r="4"/><circle cx="120" cy="24" r="4"/><circle cx="40" cy="96" r="4"/><circle cx="120" cy="96" r="4"/><circle cx="36" cy="120" r="4"/><circle cx="124" cy="120" r="4"/><circle cx="40" cy="216" r="4"/><circle cx="120" cy="216" r="4"/></g></svg>'''
with (root / f).open('a') as out:
    out.write('''\n/* Static molecular artwork also works with WebGL unavailable or lost. */
.creatoros-field-mode-8[data-chiral-structure="dna"] .creatoros-field-fallback::before,
.creatoros-field-mode-8[data-chiral-structure="dna"] .creatoros-field-fallback::after {
  border-radius: 0;
  background: url("data:image/svg+xml,'''+quote(svg, safe='')+'''") center / 100% 24rem repeat-y;
}
.creatoros-field-mode-8[data-chiral-structure="dna"] .creatoros-field-fallback::before {
  transform: none;
}
.creatoros-field-mode-8[data-chiral-structure="dna"] .creatoros-field-fallback::after {
  transform: scaleX(-1);
}
''')
f = 'src/components/ChiralWeave.test.js'
edit(f, '  normalizeChiralHandedness,', '  normalizeChiralHandedness,\n  normalizeChiralStructure,')
edit(f, '  test.each([1, -1])', '''  test.each([null, undefined, "DNA", "unknown", 1, NaN, {}, []])(
    "normalizes unsupported structure %p to classic", (value) => {
      expect(normalizeChiralStructure(value)).toBe("classic");
    },
  );

  test("DNA has a bounded independent branch with paired strands and molecular rings", () => {
    expect(normalizeChiralStructure("dna")).toBe("dna");
    expect(CHIRAL_WEAVE_SHADER).toContain("if (u_chiralStructure > 0.5) return sceneChiralDna(uv, time)");
    expect(CHIRAL_WEAVE_SHADER).toContain("molecule < 2");
    expect(CHIRAL_WEAVE_SHADER).toContain("strand < 2");
    expect(CHIRAL_WEAVE_SHADER).toContain("floor(p.y / spacing + 0.5)");
    expect(CHIRAL_WEAVE_SHADER).toContain("chiralDnaHexagon");
    expect(CHIRAL_WEAVE_SHADER).toContain("chiralDnaPentagon");
    expect(CHIRAL_WEAVE_SHADER).toContain("ringRadius * projection > pixel * 2.0");
  });

  test.each([1, -1])''')
edit(f, '    expect(shell).toHaveAttribute("data-chiral-handedness", "1");\n    expect(shell).toHaveAttribute("data-reaction-runtime", "inactive");', '''    expect(shell).toHaveAttribute("data-chiral-handedness", "1");
    expect(shell).toHaveAttribute("data-chiral-structure", "classic");
    expect(shell).toHaveAttribute("data-reaction-runtime", "inactive");
    rerender(<CreatorOSFieldCanvas mode={8} paused chiralStructure="dna" chiralHandedness={-1} />);
    expect(shell).toHaveAttribute("data-chiral-structure", "dna");
    expect(shell).toHaveAttribute("data-reaction-runtime", "inactive");
    expect(container.querySelector("canvas")).toBe(canvas);''')
f = 'src/components/DitherCanvasPage.test.js'
edit(f, '    chiralHandedness = 1,', '    chiralHandedness = 1,\n    chiralStructure = "classic",')
edit(f, '        "data-chiral-handedness": String(chiralHandedness),', '        "data-chiral-handedness": String(chiralHandedness),\n        "data-chiral-structure": chiralStructure,')
edit(f, '  test("allows Chiral Weave underneath Second Surface", () => {', '''  test("DNA and reflection are independent and keep the paused renderer and seed", () => {
    render(<DitherCanvasPage />);
    fireEvent.click(screen.getByRole("button", { name: /Chiral Weave/ }));
    flushScrollFrame();
    finishStudyTransition();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    const reset = renderer.getAttribute("data-reset-version");
    const structure = screen.getByRole("group", { name: "Chiral Weave structure" });
    const orientation = screen.getByRole("group", { name: "Chiral Weave orientation" });
    expect(within(structure).getByRole("button", { name: "Classic" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(within(structure).getByRole("button", { name: "DNA" }));
    expect(renderer).toHaveAttribute("data-chiral-structure", "dna");
    expect(within(structure).getByRole("button", { name: "DNA" })).toHaveAttribute("aria-pressed", "true");
    expect(within(structure).getByRole("button", { name: "Classic" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(orientation).getByRole("button", { name: "Mirror" }));
    expect(renderer).toHaveAttribute("data-chiral-handedness", "-1");
    expect(renderer).toHaveAttribute("data-chiral-structure", "dna");
    fireEvent.click(within(structure).getByRole("button", { name: "Classic" }));
    expect(renderer).toHaveAttribute("data-chiral-structure", "classic");
    expect(renderer).toHaveAttribute("data-chiral-handedness", "-1");
    expect(renderer).toHaveAttribute("data-paused", "true");
    expect(renderer).toHaveAttribute("data-reset-version", reset);
    expect(screen.getByTestId("creatoros-field-renderer")).toBe(renderer);
    expect(screen.getAllByTestId("creatoros-field-renderer")).toHaveLength(1);
    fireEvent.click(within(structure).getByRole("button", { name: "DNA" }));
    fireEvent.click(screen.getByRole("button", { name: /Second Surface/ }));
    flushScrollFrame();
    finishStudyTransition();
    fireEvent.change(screen.getByRole("combobox", { name: "Choose the theme beneath Second Surface" }),
      { target: { value: "chiral-weave" } });
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-chiral-structure", "dna");
  });

  test("allows Chiral Weave underneath Second Surface", () => {''')
f = 'CLAUDE.md'
edit(f, '- Chiral Weave appends mode 8 without reindexing existing studies. Its twelve analytic helicoid strips share one clock; the orientation uniform reflects space, never time or seed. Reflection redraws the same renderer, including while paused.', '- Chiral Weave appends mode 8 without reindexing existing studies. Classic keeps twelve analytic strips. Its independent DNA structure uses two paired backbones per molecule and a nearest-row lookup for beads, bonded rungs and molecular rings. Subpixel ornament is skipped, not merely faded. Both structures share one clock, canvas, pass and lifecycle; reflection changes space, never time or seed. Structure and reflection redraw the same renderer, including while paused. Molecular artwork is stylized, not an atomistic simulation.')
p = root / 'scripts/verify-chiral-weave.mjs'
s = p.read_text()
s = s.replace('const fixture = (light) =>', 'const fixture = (light, dna) =>')
s = s.replace("renderer:'WebGL2',light:${light}", "renderer:'WebGL2',light:${light},structure:${dna}")
s = s.replace('age=8)=>{', 'age=8,structure=${dna ? 1 : 0})=>{')
s = s.replace('u_chiralHandedness:h,u_modeMix:0', 'u_chiralHandedness:h,u_chiralStructure:structure,u_modeMix:0')
s = s.replace('gl.deleteProgram(p);const production', '''result.structureDifference=difference(draw(p,1,40,0,[.5,.5],8,0),draw(p,1,40,0,[.5,.5],8,1));
check(result.structureDifference>1,'DNA is indistinguishable from Classic');
// Synchronous software-GPU samples include readback. Diagnostic only, not FPS.
const timings=[[],[]];for(let sample=0;sample<8;sample++)for(const structure of [0,1]){
const begin=performance.now();draw(p,1,40+sample*.03,0,[.5,.5],8,structure);
if(sample>1)timings[structure].push(performance.now()-begin);}
result.medianDrawMs=timings.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]);
gl.deleteProgram(p);const production''')
s = s.replace('  const light = url.searchParams.get("light") === "1";', '  const light = url.searchParams.get("light") === "1";\n  const dna = url.searchParams.get("dna") === "1";')
s = s.replace('response.end(fixture(light));', 'response.end(fixture(light, dna));')
s = s.replace('src="/scene?light=${light ? 1 : 0}"', 'src="/scene?light=${light ? 1 : 0}&dna=${dna ? 1 : 0}"')
s = s.replace('    for (const light of [0, 1]) {', '    for (const [light, dna] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {')
s = s.replace('`chiral-${viewport.width}-${light ?', '`chiral-${dna ? "dna-" : ""}${viewport.width}-${light ?')
s = s.replace('light=${light}&width=${viewport.width}', 'light=${light}&width=${viewport.width}&dna=${dna}')
p.write_text(s)
