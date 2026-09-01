from pathlib import Path


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source match, found {count}"
        )
    return content.replace(old, new, 1)


rupture_path = Path("src/components/RuptureCanvas.js")
rupture = rupture_path.read_text()
rupture = replace_once(
    rupture,
    '''          alpha: revealUnderlay,
          premultipliedAlpha: true,''',
    '''          // Canvas context attributes are immutable after first creation.
          // Keep alpha enabled for both modes so switching from Default to a
          // selected underlay can expose it without replacing the canvas node.
          alpha: true,
          premultipliedAlpha: true,''',
    "stable rupture alpha context",
)
rupture_path.write_text(rupture)


contract_path = Path("src/components/DitherCanvasRuntimeContract.test.js")
contract = contract_path.read_text()
contract = replace_once(
    contract,
    '''    expect(rupture).toContain("alpha: revealUnderlay");
    expect(rupture).toContain("premultipliedAlpha: true");''',
    '''    expect(rupture).toContain("alpha: true");
    expect(rupture).not.toContain("alpha: revealUnderlay");
    expect(rupture).toContain("premultipliedAlpha: true");''',
    "immutable rupture context contract",
)
contract_path.write_text(contract)
