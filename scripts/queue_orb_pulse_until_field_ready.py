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
    '''    };
    triggerExternalPulseRef.current = triggerExternalPulse;
    triggerExternalPulse();

    const isMorphogenPaintActive = () =>''',
    '''    };

    const isMorphogenPaintActive = () =>''',
    "premature external pulse activation",
)
field = replace_once(
    field,
    '''    resetSimulation();
    start();

    return () => {''',
    '''    resetSimulation();
    start();
    // Publish the pulse handler only after initialization has completed. Any
    // request received while WebGL was starting remains queued in the version
    // refs and is applied here instead of being erased by resetSimulation().
    triggerExternalPulseRef.current = triggerExternalPulse;
    triggerExternalPulse();

    return () => {''',
    "post-initialization external pulse activation",
)
field_path.write_text(field, encoding="utf-8")


contract_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
contract = contract_path.read_text(encoding="utf-8")
contract = replace_once(
    contract,
    '''    expect(field).toContain(
      "triggerExternalPulseRef.current = triggerExternalPulse",
    );
    expect(field).toContain("pulseOrigin.x = pointer.x;");''',
    '''    expect(field).toContain(
      "resetSimulation();\\n    start();\\n    // Publish the pulse handler only after initialization has completed.",
    );
    expect(field).toContain(
      "triggerExternalPulseRef.current = triggerExternalPulse",
    );
    expect(field.indexOf("triggerExternalPulseRef.current = triggerExternalPulse"))
      .toBeGreaterThan(field.indexOf("resetSimulation();\\n    start();"));
    expect(field).toContain("pulseOrigin.x = pointer.x;");''',
    "queued pulse initialization invariant",
)
contract_path.write_text(contract, encoding="utf-8")
