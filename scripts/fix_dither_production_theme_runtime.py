from pathlib import Path
p=Path('src/components/DitherCanvasPage.js')
s=p.read_text()
s=s.replace('import React, { useEffect, useRef, useState } from "react";', 'import React, { useCallback, useEffect, useRef, useState } from "react";')
s=s.replace('    title: "Light Theme",', '    title: "Radiant Lattice",')
s=s.replace('    title: "Dark Theme",', '    title: "Event Horizon",')
needle='''  displayStudyIndexRef.current = displayStudyIndex;\n\n  // Sand Paint'''
replacement='''  displayStudyIndexRef.current = displayStudyIndex;\n\n  const handleProductionThemeStateChange = useCallback((state) => {\n    if (state === "fallback" && highFidelityMobileLight) {\n      setMobileLightRuntimeFailed(true);\n      return;\n    }\n    setFieldState(state);\n  }, [highFidelityMobileLight]);\n\n  // Sand Paint'''
if needle not in s: raise SystemExit('state handler insertion target missing')
s=s.replace(needle,replacement)
old='''          onFieldStateChange={(state) => {\n            if (state === "fallback" && highFidelityMobileLight) {\n              setMobileLightRuntimeFailed(true);\n              return;\n            }\n            setFieldState(state);\n          }}'''
if old not in s: raise SystemExit('inline callback target missing')
s=s.replace(old,'          onFieldStateChange={handleProductionThemeStateChange}')
p.write_text(s)

# Contract test: guard against recreating the WebGL runtime on every field-state update.
t=Path('src/components/DitherCanvasRuntimeContract.test.js')
ts=t.read_text()
anchor='''    expect(page).toContain('<ProductionThemeCanvas');'''
addition='''    expect(page).toContain('<ProductionThemeCanvas');\n    expect(page).toContain('title: "Radiant Lattice"');\n    expect(page).toContain('title: "Event Horizon"');\n    expect(page).toContain('const handleProductionThemeStateChange = useCallback');\n    expect(page).toContain('onFieldStateChange={handleProductionThemeStateChange}');\n    expect(page).not.toContain('onFieldStateChange={(state) => {');'''
if anchor not in ts: raise SystemExit('contract test anchor missing')
ts=ts.replace(anchor,addition,1)
t.write_text(ts)
