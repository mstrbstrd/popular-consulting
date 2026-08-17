from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}.")
    file_path.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/components/DitherCanvasPage.js",
    '''  displayStudyIndexRef.current = displayStudyIndex;

  useEffect(() => {
    const previousTitle = document.title;''',
    '''  displayStudyIndexRef.current = displayStudyIndex;

  // Sand Paint is opt-in for the current Morphogen visit. Leaving the study
  // restores the original autonomous organism while preserving paint settings.
  useEffect(() => {
    if (
      activeStudy.id !== "morphogen-divide"
      && morphogenExperience !== MORPHOGEN_EXPERIENCE_ORGANISM
    ) {
      setMorphogenExperience(MORPHOGEN_EXPERIENCE_ORGANISM);
    }
  }, [activeStudy.id, morphogenExperience]);

  useEffect(() => {
    const previousTitle = document.title;''',
    "Morphogen re-entry default",
)

replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''      data[offset + 2] = 0;
      data[offset + 3] = 0;''',
    '''      data[offset + 2] = 0;
      // Organism retains the original opaque reaction texture. Paint alone
      // owns alpha as its persistent pigment channel.
      data[offset + 3] = paintMode ? 0 : 255;''',
    "Morphogen seed alpha",
)

replace_once(
    "src/components/CreatorOSFieldShader.js",
    '''  fragColor = vec4(sat(u), sat(v), activity, sat(paint));''',
    '''  // Preserve the pre-paint opaque reaction state in Organism mode.
  float outputAlpha = mix(1.0, sat(paint), paintMode);
  fragColor = vec4(sat(u), sat(v), activity, outputAlpha);''',
    "Morphogen reaction alpha",
)

replace_once(
    "src/components/MorphogenPaintMode.test.js",
    '''  test("threads paint controls into the existing WebGL renderer without remounting it", () => {''',
    '''  test("restores the original organism default without removing Sand Paint", () => {
    expect(pageSource).toMatch(
      /const \\[morphogenExperience, setMorphogenExperience\\] = useState\\(\\s*MORPHOGEN_EXPERIENCE_ORGANISM,\\s*\\);/,
    );
    expect(pageSource).toContain('activeStudy.id !== "morphogen-divide"');
    expect(pageSource).toContain(
      "setMorphogenExperience(MORPHOGEN_EXPERIENCE_ORGANISM)",
    );
    expect(canvasSource).toContain('morphogenExperience = "organism"');
    expect(canvasSource).toContain(
      "data[offset + 3] = paintMode ? 0 : 255",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float outputAlpha = mix(1.0, sat(paint), paintMode)",
    );
    expect(pageSource).toContain(
      "setMorphogenExperience(MORPHOGEN_EXPERIENCE_PAINT)",
    );
  });

  test("threads paint controls into the existing WebGL renderer without remounting it", () => {''',
    "Morphogen default regression test",
)

replace_once(
    "src/components/MorphogenPaintMode.test.js",
    '''    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, sat(paint))",
    );''',
    '''    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float outputAlpha = mix(1.0, sat(paint), paintMode)",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, outputAlpha)",
    );''',
    "Morphogen paint alpha test",
)

replace_once(
    "src/components/CreatorOSFieldCanvas.test.js",
    '''    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );''',
    '''    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float outputAlpha = mix(1.0, sat(paint), paintMode)",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, outputAlpha)",
    );''',
    "Morphogen organism alpha test",
)
