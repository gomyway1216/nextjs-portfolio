/**
 * Draws the field with WebGL2: the same cabinet from the same camera as the
 * canvas renderer, but as solid things in a light — medals with thickness
 * and a struck face, a pusher that is a block, shadows that fall from one
 * thing onto the next. Like the canvas renderer it decides nothing; it shows
 * the machine the engine is running and the stage the page keeps.
 *
 * A frame is two passes. The first looks at the field from the key lamp and
 * records how far its light gets (the shadow map). The second draws the
 * picture: every medal in one call, the jewels in another when there are any,
 * the balls and bulbs in two, the cabinet in a handful, and last the flat
 * touches that are laid over them. A prize
 * ball that lies under the catcher on the pusher's front comes after even
 * those, behind the catcher's hood.
 *
 * The picture has a hole in it. The screen in the back wall is the page's
 * own, stood behind the canvas, so the canvas is cleared to nothing and
 * nothing solid is drawn where the screen is: the page shows through there,
 * with whatever is in front of the screen drawn over it. A flat touch laid
 * on the hole shades or lights the page itself.
 */

import { pusherFront, type Machine } from './engine';
import { paintFoot, paintLip, paintPlain, paintPusher, paintSign, paintTable, paintWall, reliefMap } from './art3d';
import { FLAT_STRIDE, Flat, MOVING_CAST, MOVING_HOOD, MOVING_PARTS, SOLID_STRIDE, Solid, addCatcherLamps, buildCabinet, buildLamps, buildMoving, buildTouches, type Art, type Part } from './cabinet3d';
import { Gpu, type Program } from './gl';
import { PARTY_TIME, type DrawOptions, type Stage } from './render';
import { BEAD_STRIDE, EYE, KEY_LIGHT, MEDAL_STRIDE, ballShape, cameraMatrix, createRows, jewelShape, lightMatrix, medalShape, writeBalls, writeJewels, writeMedals, type Rows, type Shape } from './scene3d';
import {
  BEAD_FRAGMENT,
  BEAD_SHADOW_VERTEX,
  BEAD_VERTEX,
  CONTACT_FRAGMENT,
  CONTACT_VERTEX,
  FLAT_FRAGMENT,
  FLAT_VERTEX,
  JEWEL_FRAGMENT,
  MEDAL_FRAGMENT,
  MEDAL_SHADOW_VERTEX,
  MEDAL_VERTEX,
  SHADOW_FRAGMENT,
  SOLID_FRAGMENT,
  SOLID_SHADOW_VERTEX,
  SOLID_VERTEX,
} from './shaders3d';

/** The shadow map is this many texels square: about a twentieth of a field unit each. */
const SHADOW_SIZE = 2048;
/** Texels across the relief of a medal's face. */
const RELIEF_SIZE = 256;
/** How dark the contact shadow under a lying medal is at its darkest. */
const CONTACT_DARK = 0.72;
/** How far the roof's lamps drift, in rows of them, and how many seconds a drift there and back takes. */
const LAMP_DRIFT = { reach: 0.24, period: 9 } as const;

export interface Scene3d {
  /** Draws one frame. */
  draw(stage: Stage, machine: Machine, options: DrawOptions): void;
  /** Gives back everything the graphics card was asked to hold. */
  dispose(): void;
  /** What the last frame took: medals, balls and jewels drawn, and calls made to the graphics card. */
  readonly last: { medals: number; balls: number; jewels: number; calls: number };
}

/**
 * Sets the scene up on a WebGL2 context: compiles the shaders, paints the
 * textures and makes the buffers. Throws if the graphics card refuses any of
 * it — a shader, or, which it reports only if asked, the memory for a
 * texture or a buffer — having given back whatever it had made by then.
 */
export function createScene3d(gl: WebGL2RenderingContext): Scene3d {
  const gpu = new Gpu(gl);
  try {
    gpu.forget();
    const scene = build(gpu);
    gpu.verify();
    return scene;
  } catch (error) {
    gpu.dispose();
    throw error;
  }
}

function build(gpu: Gpu): Scene3d {
  const { gl } = gpu;
  const medalProgram = gpu.program(MEDAL_VERTEX, MEDAL_FRAGMENT);
  // A jewel is placed and turned the way a medal is, so the medal's vertex shader does for both.
  const jewelProgram = gpu.program(MEDAL_VERTEX, JEWEL_FRAGMENT);
  const beadProgram = gpu.program(BEAD_VERTEX, BEAD_FRAGMENT);
  const solidProgram = gpu.program(SOLID_VERTEX, SOLID_FRAGMENT);
  const flatProgram = gpu.program(FLAT_VERTEX, FLAT_FRAGMENT);
  const contactProgram = gpu.program(CONTACT_VERTEX, CONTACT_FRAGMENT);
  const medalShadow = gpu.program(MEDAL_SHADOW_VERTEX, SHADOW_FRAGMENT);
  const beadShadow = gpu.program(BEAD_SHADOW_VERTEX, SHADOW_FRAGMENT);
  const solidShadow = gpu.program(SOLID_SHADOW_VERTEX, SHADOW_FRAGMENT);

  const art: Record<Art, WebGLTexture> = {
    table: gpu.picture(paintTable()),
    foot: gpu.picture(paintFoot()),
    wall: gpu.picture(paintWall()),
    lip: gpu.picture(paintLip()),
    pusher: gpu.picture(paintPusher()),
    sign: gpu.picture(paintSign()),
    plain: gpu.picture(paintPlain()),
  };
  const relief = gpu.table(RELIEF_SIZE, reliefMap(RELIEF_SIZE));
  const shadow = gpu.depthTarget(SHADOW_SIZE);

  // The rows that change every frame, and the buffers they are sent to.
  const medals = createRows(MEDAL_STRIDE, 1024);
  const balls = createRows(BEAD_STRIDE, 8);
  const lowBalls = createRows(BEAD_STRIDE, 4);
  const jewels = createRows(MEDAL_STRIDE, 8);
  const beads = createRows(BEAD_STRIDE, 256);
  // The catcher's round mouths and the slots' funnels are most of what moves: some four thousand corners.
  const moving = new Solid(4400);
  const flat = new Flat(1200);
  const medalBuffer = gpu.buffer(gl.ARRAY_BUFFER, medals.data.byteLength, gl.DYNAMIC_DRAW);
  const ballBuffer = gpu.buffer(gl.ARRAY_BUFFER, balls.data.byteLength, gl.DYNAMIC_DRAW);
  const lowBallBuffer = gpu.buffer(gl.ARRAY_BUFFER, lowBalls.data.byteLength, gl.DYNAMIC_DRAW);
  const jewelBuffer = gpu.buffer(gl.ARRAY_BUFFER, jewels.data.byteLength, gl.DYNAMIC_DRAW);
  const beadBuffer = gpu.buffer(gl.ARRAY_BUFFER, beads.data.byteLength, gl.DYNAMIC_DRAW);
  const movingBuffer = gpu.buffer(gl.ARRAY_BUFFER, moving.data.byteLength, gl.DYNAMIC_DRAW);
  const flatBuffer = gpu.buffer(gl.ARRAY_BUFFER, flat.data.byteLength, gl.DYNAMIC_DRAW);

  /** A shape drawn many times over, once for each row of `rows`. */
  const copies = (shape: Shape, rows: WebGLBuffer, stride: number, each: readonly { location: number; size: number; offset: number }[]) => {
    const array = gpu.vertexArray();
    gpu.attributes(gpu.buffer(gl.ARRAY_BUFFER, shape.vertices, gl.STATIC_DRAW), 6, [
      { location: 0, size: 3, offset: 0 },
      { location: 1, size: 3, offset: 3 },
    ]);
    gpu.attributes(rows, stride, each, true);
    gpu.buffer(gl.ELEMENT_ARRAY_BUFFER, shape.indices, gl.STATIC_DRAW);
    return { array, count: shape.indices.length };
  };
  const medalRows = [
    { location: 2, size: 4, offset: 0 },
    { location: 3, size: 4, offset: 4 },
    { location: 4, size: 4, offset: 8 },
  ];
  const beadRows = [
    { location: 2, size: 4, offset: 0 },
    { location: 3, size: 4, offset: 4 },
  ];
  // A medal has a rounded edge for the picture and is a plain disc in the shadow map; a ball is finer than a bulb.
  const medalMesh = copies(medalShape(32, 0.17), medalBuffer, MEDAL_STRIDE, medalRows);
  const medalShade = copies(medalShape(16, 0), medalBuffer, MEDAL_STRIDE, medalRows);
  const ballMesh = copies(ballShape(28, 18), ballBuffer, BEAD_STRIDE, beadRows);
  const lowBallMesh = copies(ballShape(28, 18), lowBallBuffer, BEAD_STRIDE, beadRows);
  const jewelMesh = copies(jewelShape(), jewelBuffer, MEDAL_STRIDE, medalRows);
  const beadMesh = copies(ballShape(10, 7), beadBuffer, BEAD_STRIDE, beadRows);

  // The contact shadows are squares laid under the medals, read from the medals' own rows.
  const contactArray = gpu.vertexArray();
  gpu.attributes(gpu.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW), 2, [{ location: 0, size: 2, offset: 0 }]);
  gpu.attributes(medalBuffer, MEDAL_STRIDE, [medalRows[0], medalRows[2]], true);

  const solidLayout = [
    { location: 0, size: 3, offset: 0 },
    { location: 1, size: 3, offset: 3 },
    { location: 2, size: 2, offset: 6 },
    { location: 3, size: 3, offset: 8 },
    { location: 4, size: 2, offset: 11 },
  ];
  const still = new Solid(600);
  const stillParts = buildCabinet(still);
  const stillArray = gpu.vertexArray();
  gpu.attributes(gpu.buffer(gl.ARRAY_BUFFER, still.data.subarray(0, still.count * SOLID_STRIDE), gl.STATIC_DRAW), SOLID_STRIDE, solidLayout);
  const movingArray = gpu.vertexArray();
  gpu.attributes(movingBuffer, SOLID_STRIDE, solidLayout);
  const flatArray = gpu.vertexArray();
  gpu.attributes(flatBuffer, FLAT_STRIDE, [
    { location: 0, size: 3, offset: 0 },
    { location: 1, size: 3, offset: 3 },
    { location: 2, size: 2, offset: 6 },
    { location: 3, size: 3, offset: 8 },
  ]);
  gl.bindVertexArray(null);

  const camera = new Float32Array(16);
  const sun = lightMatrix(new Float32Array(16));
  let drift = 0;
  const last = { medals: 0, balls: 0, jewels: 0, calls: 0 };

  /** Makes a program the one in use and tells it about the camera, the lamp and the canvas. */
  const switchTo = (program: Program) => {
    const { uniforms } = program;
    gl.useProgram(program.handle);
    gl.uniformMatrix4fv(uniforms.uCamera ?? null, false, camera);
    gl.uniformMatrix4fv(uniforms.uSun ?? null, false, sun);
    gl.uniform3f(uniforms.uEye ?? null, EYE[0], EYE[1], EYE[2]);
    gl.uniform3f(uniforms.uKey ?? null, KEY_LIGHT[0], KEY_LIGHT[1], KEY_LIGHT[2]);
    gl.uniform4f(uniforms.uView ?? null, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight, 1 / SHADOW_SIZE, drift);
    gl.uniform1i(uniforms.uShadow ?? null, 1);
    gl.uniform1i(uniforms.uArt ?? null, 0);
    gl.uniform1i(uniforms.uRelief ?? null, 0);
  };
  const send = (buffer: WebGLBuffer, data: Float32Array, numbers: number) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW, 0, numbers);
  };
  const sendRows = (buffer: WebGLBuffer, rows: Rows) => send(buffer, rows.data, rows.count * rows.stride);
  const drawCopies = (mesh: { array: WebGLVertexArrayObject; count: number }, rows: Rows) => {
    if (rows.count === 0) return;
    gl.bindVertexArray(mesh.array);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, rows.count);
    last.calls++;
  };
  const drawParts = (array: WebGLVertexArrayObject, parts: readonly Part[]) => {
    gl.bindVertexArray(array);
    for (const part of parts) {
      // A run that is there only for its shadow is left out of the picture.
      if (part.count === 0 || part.unseen) continue;
      gl.bindTexture(gl.TEXTURE_2D, art[part.art]);
      gl.drawArrays(gl.TRIANGLES, part.first, part.count);
      last.calls++;
    }
  };

  const draw = (stage: Stage, machine: Machine, options: DrawOptions) => {
    const calm = options.calm ?? false;
    const front = pusherFront(machine.time);
    const celebration = stage.party;
    const partying = celebration !== null && celebration.kind !== 'crash';
    // A tower coming down shakes the cabinet for a moment.
    const shake = !calm && celebration?.kind === 'crash' ? Math.sin(stage.clock * 90) * 2.2 * (celebration.left / PARTY_TIME.crash) : 0;
    cameraMatrix(camera, shake);

    // This frame's numbers, and each list sent to the graphics card once.
    writeMedals(medals, machine, stage.exits, stage.fed);
    writeBalls(balls, machine, stage.exits, lowBalls);
    writeJewels(jewels, machine, stage.exits);
    buildMoving(moving, machine, front, stage, options);
    flat.clear();
    buildTouches(flat, machine, front, stage, options);
    // The glow moves one bulb every second or so; a fever or a jackpot hurries it.
    const wave = calm ? 0 : stage.clock * (partying ? 7 : 1.6);
    buildLamps(beads, flat, machine, front, wave, partying, options, stage.clock);
    addCatcherLamps(beads, machine, stage, wave);
    // The lamps the medals mirror drift slowly, so their glints wander over the pile; a fever or a jackpot hurries that too.
    drift = calm ? 0 : LAMP_DRIFT.reach * Math.sin((stage.clock * Math.PI * 2 * (partying ? 3 : 1)) / LAMP_DRIFT.period);
    sendRows(medalBuffer, medals);
    sendRows(ballBuffer, balls);
    // There is seldom a ball under the catcher, and not always a jewel on the field: nothing is sent for none.
    if (lowBalls.count > 0) sendRows(lowBallBuffer, lowBalls);
    if (jewels.count > 0) sendRows(jewelBuffer, jewels);
    sendRows(beadBuffer, beads);
    send(movingBuffer, moving.data, moving.count * SOLID_STRIDE);
    send(flatBuffer, flat.data, flat.count * FLAT_STRIDE);
    last.medals = medals.count;
    last.balls = balls.count + lowBalls.count;
    last.jewels = jewels.count;
    last.calls = 0;

    // What the key lamp sees. Of each medal and ball only the far side is recorded, so a lit face never shades itself.
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.framebuffer);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    switchTo(medalShadow);
    drawCopies(medalShade, medals);
    drawCopies(jewelMesh, jewels);
    switchTo(beadShadow);
    drawCopies(ballMesh, balls);
    drawCopies(lowBallMesh, lowBalls);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    switchTo(solidShadow);
    gl.bindVertexArray(movingArray);
    let casting = 0;
    for (let i = 0; i < MOVING_CAST; i++) casting += MOVING_PARTS[i].count;
    gl.drawArrays(gl.TRIANGLES, 0, casting);
    last.calls++;
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // The picture, on a canvas cleared to nothing: where nothing is drawn, the page behind it shows.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    switchTo(medalProgram);
    gl.bindTexture(gl.TEXTURE_2D, relief);
    drawCopies(medalMesh, medals);
    if (jewels.count > 0) {
      switchTo(jewelProgram);
      drawCopies(jewelMesh, jewels);
    }
    switchTo(beadProgram);
    drawCopies(ballMesh, balls);
    drawCopies(beadMesh, beads);
    gl.disable(gl.CULL_FACE);
    switchTo(solidProgram);
    drawParts(stillArray, stillParts);
    drawParts(movingArray, MOVING_PARTS);

    // The flat touches go on last and leave the depths alone: each darkens or lights what is already there.
    // What they are given is already multiplied by how much they hide, which is also how the page lays this
    // canvas over itself: a shade on the hole is so much black over the screen, a glow so much light added to it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    switchTo(contactProgram);
    gl.uniform1f(contactProgram.uniforms.uDark ?? null, CONTACT_DARK);
    gl.bindVertexArray(contactArray);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, medals.count);
    switchTo(flatProgram);
    gl.bindVertexArray(flatArray);
    gl.drawArrays(gl.TRIANGLES, 0, flat.count);
    last.calls += 2;
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // A prize ball lying on the lower table is taller than the catcher that hangs over it. So the hood over the
    // catcher is laid on the finished picture as distances only, with nothing of it shown, and the balls that lie
    // under the catcher are drawn after it: what of a ball is under there stays hidden, and what has come out is seen.
    if (lowBalls.count > 0) {
      const hood = MOVING_PARTS[MOVING_HOOD];
      gl.colorMask(false, false, false, false);
      switchTo(solidProgram);
      gl.bindTexture(gl.TEXTURE_2D, art.plain);
      gl.bindVertexArray(movingArray);
      gl.drawArrays(gl.TRIANGLES, hood.first, hood.count);
      last.calls++;
      gl.colorMask(true, true, true, true);
      gl.enable(gl.CULL_FACE);
      switchTo(beadProgram);
      drawCopies(lowBallMesh, lowBalls);
      gl.disable(gl.CULL_FACE);
    }
    gl.bindVertexArray(null);
  };

  return { draw, dispose: () => gpu.dispose(), last };
}
