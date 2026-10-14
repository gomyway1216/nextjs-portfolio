/**
 * Chooses how the field is drawn, once, when the cabinet is put up: in 3D
 * with WebGL2 where the browser has it, and with the canvas renderer where
 * it does not. The page calls `draw` every frame and does not need to know
 * which it got.
 *
 * There are two canvases, one over the other. The upper one is the field the
 * player points at, and it always has a 2D context: with the canvas renderer
 * the whole picture is on it, and with the 3D one only what lies flat on the
 * glass — sparks, confetti, the counts — while the scene is on the canvas
 * underneath. A canvas gives out one kind of context for good, so which of
 * the two is asked for which is settled before either is touched. The counts
 * over the tube windows are lit lamps on the cabinet, and they are drawn
 * there too, under the glass, so that both renderers show the same digits.
 *
 * Under both of them the page stands its screen, in the back wall of the
 * cabinet. Whichever renderer draws leaves that part of its picture clear,
 * so the screen shows through with everything else in front of it.
 */

import { pusherFront, type Machine } from './engine';
import { PARTY_TIME, drawField, drawOverlay, glassShift, paintStage, type DrawOptions, type Stage } from './render';
import { createScene3d, type Scene3d } from './render3d';
import { countsShown, drawTubeCounts } from './works2d';

export type RendererKind = 'webgl' | '2d';

/**
 * The renderer the page's address asks for, if it asks: `?renderer=2d` for
 * the canvas one, to compare the two or to test the older, and
 * `?renderer=webgl` for the 3D one even where it would be slow.
 */
export function askedFor(search: string): RendererKind | null {
  const asked = new URLSearchParams(search).get('renderer');
  return asked === '2d' || asked === 'webgl' ? asked : null;
}

/**
 * What the 3D scene asks of its context. It is see-through, because the
 * screen in the back wall is the page's own and shows through the picture.
 * Unless the address insists, a browser that could only draw it in software
 * says no instead, and the canvas renderer, which is quick in software,
 * takes over.
 */
export const sceneContext = (insist: boolean): WebGLContextAttributes => ({
  alpha: true,
  premultipliedAlpha: true,
  antialias: true,
  depth: true,
  stencil: false,
  failIfMajorPerformanceCaveat: !insist,
});

/**
 * How much of a fever's wash of colour goes over the 3D scene. The wash was
 * made for the canvas renderer's darker gold; at full strength it turns the
 * 3D medals pale.
 */
export const WASH_OVER_3D = 0.5;

export interface FieldRenderer {
  /** Which renderer draws the next frame. It changes only if the graphics card drops the 3D scene, or hands it back. */
  readonly kind: RendererKind;
  /** Draws one frame of the field. */
  draw(stage: Stage, machine: Machine, options: DrawOptions): void;
  /** Gives back what the graphics card holds and stops listening to it. */
  dispose(): void;
}

/**
 * Sets up the renderer for `field`, with `under` as the canvas beneath it
 * for the 3D scene. Returns null only if `field` will not give a 2D context,
 * in which case nothing can be drawn at all. The field's `data-renderer`
 * says which renderer is at work.
 */
export function createRenderer(field: HTMLCanvasElement, under: HTMLCanvasElement | null, search = ''): FieldRenderer | null {
  const context = field.getContext('2d');
  if (!context) return null;
  const asked = askedFor(search);
  const gl = under && asked !== '2d' ? under.getContext('webgl2', sceneContext(asked === 'webgl')) : null;
  let scene: Scene3d | null = null;
  // What the upper canvas was last cleared for: nothing has to be drawn on it again while that still holds.
  let cleared: Stage | null = null;
  let busy = false;
  // How far the bands on the glass had drifted when the upper canvas was last drawn, in half pixels of the drawing.
  let drifted = Number.NaN;
  // What the counts over the windows said when the upper canvas was last drawn.
  let counted = '';

  const start = () => {
    if (!gl || gl.isContextLost()) return;
    try {
      scene = createScene3d(gl);
    } catch {
      // A shader the graphics card will not take, or no memory for the textures: the canvas renderer draws instead.
      scene = null;
    }
  };
  const mark = () => {
    field.dataset.renderer = scene ? 'webgl' : '2d';
    cleared = null;
  };
  // A graphics card can drop a page's context at any time, and may hand it back later with everything in it gone.
  // Until it does, the canvas renderer draws the field; when it does, the scene is set up again from scratch.
  const onLost = (event: Event) => {
    event.preventDefault();
    scene = null;
    mark();
  };
  const onRestored = () => {
    start();
    mark();
  };
  if (gl && under) {
    under.addEventListener('webglcontextlost', onLost);
    under.addEventListener('webglcontextrestored', onRestored);
    start();
  }
  mark();

  return {
    get kind() {
      return scene ? 'webgl' : '2d';
    },
    draw(stage, machine, options) {
      if (!scene || !under) {
        paintStage(stage);
        drawField(context, stage, machine, options);
        return;
      }
      if (under.width !== field.width || under.height !== field.height) {
        under.width = field.width;
        under.height = field.height;
      }
      scene.draw(stage, machine, options);
      // The glass changes slowly: the bands on it drift a pixel or two a second, and stand still in a calm cabinet.
      // So the upper canvas is redrawn while something is on it, once more to clear it, and otherwise only when the
      // bands have moved half a pixel of the drawing, which is a few times a second at most.
      const lively = stage.sparks.length > 0 || stage.popups.length > 0 || stage.party !== null;
      const shifted = Math.round(glassShift(stage.clock, options.calm) * 2);
      const front = pusherFront(machine.time);
      const counts = countsShown(machine, front, options.calm ?? false);
      if (lively || busy || cleared !== stage || shifted !== drifted || counts !== counted) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, field.width, field.height);
        // The counts shake with the cabinet when a tower comes down, as the scene does.
        const shake = !options.calm && stage.party?.kind === 'crash' ? Math.sin(stage.clock * 90) * 2.2 * (stage.party.left / PARTY_TIME.crash) : 0;
        drawTubeCounts(context, stage.ratio, machine, front, options.calm ?? false, shake);
        drawOverlay(context, stage, options.calm, WASH_OVER_3D);
        cleared = stage;
        busy = lively;
        drifted = shifted;
        counted = counts;
      }
    },
    dispose() {
      under?.removeEventListener('webglcontextlost', onLost);
      under?.removeEventListener('webglcontextrestored', onRestored);
      scene?.dispose();
      scene = null;
    },
  };
}
