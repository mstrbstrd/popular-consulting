"rupture pointer style update",
  );

  next = replaceExact(
    next,
    `    const uploadGeometry = () => {
      for (let index = 0; index < MAX_NODES; index += 1) {
        const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
        const x = -0.06 + (sourceIndex / (ACTIVE_NODES - 1)) * 1.12;
        const offset = index * 4;
        nodeData[offset] = x;
        nodeData[offset + 1] = baseFaultY(x);
        nodeData[offset + 2] = openings[sourceIndex];
        nodeData[offset + 3] = scars[sourceIndex];
      }
    };

    const draw = () => {
      uploadGeometry();
      gl.useProgram(program);
`,
    `    const uploadGeometry = () => {
      for (let index = 0; index < MAX_NODES; index += 1) {
        const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
        const offset = index * 4;
        nodeData[offset + 2] = openings[sourceIndex];
        nodeData[offset + 3] = scars[sourceIndex];
      }
      gl.uniform4fv(uniforms["u_nodes[0]"], nodeData);
      geometryDirty = false;
    };

    gl.useProgram(program);
    gl.uniform1i(uniforms.u_nodeCount, ACTIVE_NODES);
    gl.uniform4fv(uniforms["u_branches[0]"], branchData);
    gl.uniform4fv(uniforms["u_branchMeta[0]"], branchMeta);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(uniforms.u_atlas, 0);
    gl.uniform1f(uniforms.u_cellSize, isMobileTier ? 12 : 7);
    gl.uniform1i(uniforms.u_charCount, GLYPHS.length);
    gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
    gl.uniform1i(uniforms.u_atlasRows, atlas.rows);

    const draw = () => {
      gl.useProgram(program);
      if (geometryDirty) uploadGeometry();
`,
    "rupture static GPU state",
  );

  next = replaceExact(
    next,
    `      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform1i(uniforms.u_nodeCount, ACTIVE_NODES);
      gl.uniform4fv(uniforms["u_nodes[0]"], nodeData);
      gl.uniform4fv(uniforms["u_branches[0]"], branchData);
      gl.uniform4fv(uniforms["u_branchMeta[0]"], branchMeta);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(uniforms.u_atlas, 0);
      gl.uniform1f(uniforms.u_cellSize, isMobileTier ? 12 : 7);
      gl.uniform1i(uniforms.u_charCount, GLYPHS.length);
      gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
      gl.uniform1i(uniforms.u_atlasRows, atlas.rows);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
`,
    `      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
`,
    "rupture dynamic GPU state",
  );

  next = replaceExact(
    next,
    `      const render = (timestamp) => {
      animationFrameRef.current = 0;
      if (!documentVisible) return;

      const shouldOnlyRefresh = pausedRef.current || reducedMotion;
      if (shouldOnlyRefresh && !forceRenderRef.current) return;

      const minimumFrameMs = reducedMotion ? REDUCED_FRAME_MS : TARGET_FRAME_MS;
      if (timestamp - lastFrameAt < minimumFrameMs) {
        scheduleRender();
        return;
      }
      const delta = lastFrameAt
        ? Math.min((timestamp - lastFrameAt) / 1000, 1 / 18)
        : 0;
      lastFrameAt = timestamp;

      if (!pausedRef.current && !reducedMotion) {
        localTime += delta;
        reveal = Math.min(1, reveal + delta / 1.9);
      } else if (reducedMotion) {
        reveal = 1;
      }

      updateOpening(delta);
      updateSize();
      draw();
      forceRenderRef.current = false;
      if (!pausedRef.current && !reducedMotion) scheduleRender();
    };

    const scheduleRender = () => {
      if (
        animationFrameRef.current€YШЭ[Y[ќљ\ЪX›B€
HВ€™]\›ЋВ€B€[љ[X][Ы‘њ[YT™Y‹Э\њ™[ќH™\]Y\Э[љ[X][Ы‘њ[YJ™[™\ЉNВ€NВ‚€™\]Y\Э™[™\”™Y‹Э\њ™[ќHШЪY[T™[™\ЋВ€ШЪY[T™[™\Љ
NВ€ЫЫњЭ™[™\€H
И[S\ИJHO€В€Y€
YШЭ[Y[ќљ\ЪX›JH™]\›€[ЩNВ‚€ЫЫњЭЪЭ[Ы›T™Yњ™\ЪH]\ЩY™Y‹Э\њ™[ќ™YXЩY[Э[ЫЋВ€Y€
ЪЭ[Ы›T™Yњ™\Ъ	‰€Y›ЬЩT™[™\”™Y‹Э\њ™[ќ
H™]\›€[ЩNВ€ЫЫњЭ[HHX]›Z[Љ[S\ИИLHИN
NВ‚€Y€
\]\ЩY™Y‹Э\њ™[ќ	‰€\™YXЩY[Э[ЫЉHВ€ШШ[[YH
ПH[NВ€™]™X[HX]›Z[ЉK™]™X[
И[HИKЋJNВ€H[ЩHY€
™YXЩY[Э[ЫЉHВ€™]™X[HNВ€B‚€\]SЬ[љ[™К[JNВ€]К
NВ€›ЬЩT™[™\”™Y‹Э\њ™[ќH[ЩNВ€™]\›€\]\ЩY™Y‹Э\њ™[ќ	‰€\™YXЩY[Э[ЫЋВ€NВ‚€њ[YPШY[ЩHHЬ™X]Q]\ђШ[ќ\РШY[ЩJВ€њ[YR[ќ\ќ[\О€

HO‚€™YXЩY[Э[Ы€И‘QPСQС”ђSQWУTИ€T‘СUС”ђSQWУTЛ€Ы‘њ[YN€™[™\‹€JNВ‚€ЫЫњЭШЪY[T™[™\€H

HO€В€Y€
YШЭ[Y[ќљ\ЪX›JH™]\›€[ЩNВ€™]\›€њ[YPШY[ЩKњШЪY[J
NВ€NВ‚€™\]Y\Э™[™\”™Y‹Э\њ™[ќHШЪY[T™[™\ЋВ€ШЪY[T™[™\Љ
NВ€њќ\\™HШY[ЩH™[™\€ЫЬ‹€
NВ‚€™^H™\XЩQ^XЭ
€™^€Ш[Щ[[љ[X][Ы‘њ[YJ[љ[X][Ы‘њ[YT™Y‹Э\њ™[ќ
NВ€™\Щ]Ъ[][][Ы”™Y‹Э\њ™[ќH

HO€ЯNВ€њ[YPШY[ЩK™\ЬЬЩJ
NВ€™\Щ]Ъ[][][Ы”™Y‹Э\њ™[ќH

HO€ЯNВ€њќ\\™HШY[ЩHЫX[ќ\‹€
NВ‚€™^H™\XЩQ^XЭ
€™^€]K\ќ[ќ[YK\›Щљ[O^Щ]\ђШ[ќ\Фќ[ќ[YT›Щљ[KљYB€\љXKZY[ЏHќќYH‚€]K\ќ[ќ[YK\›Щљ[O^Щ]\ђШ[ќ\Фќ[ќ[YT›Щљ[KљYB€]KYњ[YKXШY[ЩOHќ[Y\‹\Y€‚€\љXKZY[ЏHќќYH‚€њќ\\™Hќ