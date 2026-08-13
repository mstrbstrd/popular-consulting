from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}.")
    return text.replace(old, new, 1)


path = Path("src/components/DitherCanvasPage.test.js")
source = path.read_text(encoding="utf-8")
source = replace_once(
    source,
    '''  return ({
    isDark,
    mode,
    onFieldStateChange,
    paused,
    resetVersion,
    tidalPalette = "water",
  }) => ReactModule.createElement(''',
    '''  return ({
    contourPalette = "terrain",
    isDark,
    mode,
    onFieldStateChange,
    paused,
    resetVersion,
    tidalPalette = "water",
  }) => ReactModule.createElement(''',
    "Contour palette renderer mock",
)
source = replace_once(
    source,
    '''        "data-mode": String(mode),
        "data-tidal-palette": tidalPalette,''',
    '''        "data-mode": String(mode),
        "data-contour-palette": contourPalette,
        "data-tidal-palette": tidalPalette,''',
    "Contour palette renderer test attribute",
)
new_test = '''  test("defaults Contour Drift to terrain and keeps spectral as a color-only option", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Contour Drift/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Contour Drift" }),
    ).toBeInTheDocument();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "3");
    expect(renderer).toHaveAttribute("data-contour-palette", "terrain");

    const paletteGroup = screen.getByRole("group", {
      name: "Contour Drift color scheme",
    });
    const terrainOption = within(paletteGroup).getByRole("button", {
      name: "Use terrain colors for Contour Drift",
    });
    const spectralOption = within(paletteGroup).getByRole("button", {
      name: "Use spectral colors for Contour Drift",
    });
    expect(terrainOption).toHaveAttribute("aria-pressed", "true");
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(spectralOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "3",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-contour-palette",
      "spectral",
    );
    expect(terrainOption).toHaveAttribute("aria-pressed", "false");
    expect(spectralOption).toHaveAttribute("aria-pressed", "true");
  });

'''
anchor = '  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {'
source = replace_once(source, anchor, new_test + anchor, "Contour palette page test")
path.write_text(source, encoding="utf-8")
