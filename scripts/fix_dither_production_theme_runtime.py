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

t=Path('src/components/DitherCanvasPage.test.js')
ts=t.read_text().replace('Light Theme', 'Radiant Lattice').replace('Dark Theme', 'Event Horizon')
t.write_text(ts)
