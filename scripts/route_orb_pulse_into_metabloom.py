from pathlib import Path


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source match, found {count}"
        )
    return content.replace(old, new, 1)


field_path = Path("src/components/CreatorOSFieldCanvas.js")
field = field_path.read_text(encoding="utf-8")

field = replace_once(
    field,
    '''const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,''',
    '''const normalizeExternalPulseVersion = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  externalPulseVersion = 0,
  isDark = false,''',
    "external pulse prop and normalization",
)

field = replace_once(
    field,
    '''  const onFieldStateChangeRef = useRef(onFieldStateChange);
  const restartRef = useRef(true);
  const redrawRef = useRef(() => {});''',
    '''  const onFieldStateChangeRef = useRef(onFieldStateChange);
  const normalizedExternalPulseVersion = normalizeExternalPulseVersion(
    externalPulseVersion,
  );
  const externalPulseRequestRef = useRef(normalizedExternalPulseVersion);
  const appliedExternalPulseVersionRef = useRef(
    normalizedExternalPulseVersion,
  );
  const triggerExternalPulseRef = useRef(() => {});
  const restartRef = useRef(true);
  const redrawRef = useRef(() => {});''',
    "external pulse refs",
)

field = replace_once(
    field,
    '''  useEffect(() => {
    restartRef.current = true;
    redrawRef.current();
  }, [resetVersion]);

  useEffect(() => {
    const root = rootRef.current;''',
    '''  useEffect(() => {
    restartRef.current = true;
    redrawRef.current();
  }, [resetVersion]);

  useEffect(() => {
    externalPulseRequestRef.current = normalizeExternalPulseVersion(
      externalPulseVersion,
    );
    triggerExternalPulseRef.current();
  }, [externalPulseVersion]);

  useEffect(() => {
    const root = rootRef.current;''',
    "external pulse effect",
)

field = replace_once(
    field,
    '''    const isMorphogenPaintActive = () =>
      modeRef.current === REACTION_MODE
      && morphogenPaintRef.current >= 0.5;

    const isInteractiveTarget = (target) =>''',
    '''    const triggerExternalPulse = () => {
      const requestedVersion = externalPulseRequestRef.current;
      if (requestedVersion === appliedExternalPulseVersionRef.current) {
        return false;
      }

      appliedExternalPulseVersionRef.current = requestedVersion;
      pulseOrigin.x = pointer.x;
      pulseOrigin.y = pointer.y;
      pulseAge = 0;
      energy = 1;
      pointer.lastActivityAt = performance.now();
      reportState("resonance");
      forceRender = true;
      redrawRef.current();
      return true;
    };
    triggerExternalPulseRef.current = triggerExternalPulse;
    triggerExternalPulse();

    const isMorphogenPaintActive = () =>
      modeRef.current === REACTION_MODE
      && morphogenPaintRef.current >= 0.5;

    const isInteractiveTarget = (target) =>''',
    "external pulse field mutation",
)

field = replace_once(
    field,
    '''    return () => {
      frameCadence.dispose();
      redrawRef.current = () => {};''',
    '''    return () => {
      frameCadence.dispose();
      triggerExternalPulseRef.current = () => {};
      redrawRef.current = () => {};''',
    "external pulse cleanup",
)

field_path.write_text(field, encoding="utf-8")


avatar_path = Path("src/components/MetabloomAvatar.js")
avatar = avatar_path.read_text(encoding="utf-8")
avatar = replace_once(
    avatar,
    '''                isDark={isDark}
                metabloomPalette={materialPalette}
                mode={0}''',
    '''                externalPulseVersion={pulseVersion}
                isDark={isDark}
                metabloomPalette={materialPalette}
                mode={0}''',
    "avatar pulse signal",
)
avatar_path.write_text(avatar, encoding="utf-8")


avatar_test_path = Path("src/components/MetabloomAvatar.test.js")
avatar_test = avatar_test_path.read_text(encoding="utf-8")
avatar_test = replace_once(
    avatar_test,
    '''      "data-mode": String(props.mode),
      "data-palette": props.metabloomPalette,
      "data-paused": String(props.paused),''',
    '''      "data-external-pulse-version": String(props.externalPulseVersion),
      "data-mode": String(props.mode),
      "data-palette": props.metabloomPalette,
      "data-paused": String(props.paused),''',
    "avatar test pulse attribute",
)
avatar_test = replace_once(
    avatar_test,
    '''  test("pauses the field when the avatar is inactive or explicitly paused", () => {''',
    '''  test("routes each shell pulse into the live Metabloom material", () => {
    const { rerender } = render(
      <MetabloomAvatar pulseVersion={0} />,
    );

    expect(screen.getByTestId("metabloom-material-field")).toHaveAttribute(
      "data-external-pulse-version",
      "0",
    );

    rerender(<MetabloomAvatar pulseVersion={3} />);

    expect(screen.getByTestId("metabloom-material-field")).toHaveAttribute(
      "data-external-pulse-version",
      "3",
    );
    expect(mockFieldProps.externalPulseVersion).toBe(3);
  });

  test("pauses the field when the avatar is inactive or explicitly paused", () => {''',
    "avatar material pulse test",
)
avatar_test_path.write_text(avatar_test, encoding="utf-8")


field_test_path = Path("src/components/CreatorOSFieldCanvas.test.js")
field_test = field_test_path.read_text(encoding="utf-8")
field_test = replace_once(
    field_test,
    '''    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('data-context-recovery="local"');''',
    '''    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain("externalPulseVersion = 0");
    expect(source).toContain("triggerExternalPulseRef.current = triggerExternalPulse");
    expect(source).toContain('reportState("resonance")');
    expect(source).toContain('data-context-recovery="local"');''',
    "field pulse source contract",
)
field_test_path.write_text(field_test, encoding="utf-8")


contract_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
contract = contract_path.read_text(encoding="utf-8")
contract = replace_once(
    contract,
    '''    expect(avatar).toContain('metabloomPalette={materialPalette}');
    expect(avatar).toContain("paused={!isActive || paused}");
    expect(field).toContain("const RENDER_SCALE = 0.5;");''',
    '''    expect(avatar).toContain('metabloomPalette={materialPalette}');
    expect(avatar).toContain("externalPulseVersion={pulseVersion}");
    expect(avatar).toContain("paused={!isActive || paused}");
    expect(field).toContain("const RENDER_SCALE = 0.5;");
    expect(field).toContain("externalPulseVersion = 0");
    expect(field).toContain("triggerExternalPulseRef.current = triggerExternalPulse");
    expect(field).toContain('reportState("resonance")');''',
    "Orb material pulse invariant",
)
contract_path.write_text(contract, encoding="utf-8")
