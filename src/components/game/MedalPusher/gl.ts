/**
 * A thin layer over WebGL2 for the 3D field: it compiles programs, makes
 * buffers and textures, and remembers everything it made so that all of it
 * can be given back when the cabinet is taken down.
 */

export interface Program {
  handle: WebGLProgram;
  /** Every uniform the linked program uses, by name. One it does not use is simply missing, and setting it does nothing. */
  uniforms: Record<string, WebGLUniformLocation | null>;
}

/** One vertex attribute of a buffer: where the shader reads it, how many numbers, and where they start in each row. */
export interface Attribute {
  location: number;
  size: number;
  offset: number;
}

export class Gpu {
  /** How to delete each thing made so far, in the order it was made. */
  private made: (() => void)[] = [];

  constructor(readonly gl: WebGL2RenderingContext) {}

  private shader(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('no shader could be made');
    this.made.push(() => gl.deleteShader(shader));
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`a shader did not compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
    return shader;
  }

  program(vertex: string, fragment: string): Program {
    const { gl } = this;
    const handle = gl.createProgram();
    if (!handle) throw new Error('no program could be made');
    this.made.push(() => gl.deleteProgram(handle));
    gl.attachShader(handle, this.shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(handle, this.shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(`a program did not link: ${gl.getProgramInfoLog(handle) ?? ''}`);
    const uniforms: Program['uniforms'] = {};
    const count = Number(gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS)) || 0;
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(handle, i)?.name;
      if (name) uniforms[name] = gl.getUniformLocation(handle, name);
    }
    return { handle, uniforms };
  }

  /** A buffer of vertices or of indices, holding `data` or with room for that many bytes. */
  buffer(target: number, data: ArrayBufferView | number, usage: number): WebGLBuffer {
    const { gl } = this;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('no buffer could be made');
    this.made.push(() => gl.deleteBuffer(buffer));
    gl.bindBuffer(target, buffer);
    if (typeof data === 'number') gl.bufferData(target, data, usage);
    else gl.bufferData(target, data, usage);
    return buffer;
  }

  vertexArray(): WebGLVertexArrayObject {
    const { gl } = this;
    const array = gl.createVertexArray();
    if (!array) throw new Error('no vertex array could be made');
    this.made.push(() => gl.deleteVertexArray(array));
    gl.bindVertexArray(array);
    return array;
  }

  /**
   * Tells the bound vertex array how to read rows of `stride` numbers from
   * `buffer`. With `each` set, a row is read once per copy drawn instead of
   * once per corner.
   */
  attributes(buffer: WebGLBuffer, stride: number, attributes: readonly Attribute[], each = false): void {
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const { location, size, offset } of attributes) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
      if (each) gl.vertexAttribDivisor(location, 1);
    }
  }

  private texture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error('no texture could be made');
    this.made.push(() => gl.deleteTexture(texture));
    gl.bindTexture(gl.TEXTURE_2D, texture);
    return texture;
  }

  /** A picture, smaller copies of it for when it is seen from far off, and no seam at its edges. */
  private smooth(): void {
    const { gl } = this;
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Most of these pictures lie on a table seen at a slant; this keeps their lettering sharp there.
    const sharper = gl.getExtension('EXT_texture_filter_anisotropic');
    if (sharper) gl.texParameterf(gl.TEXTURE_2D, sharper.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  }

  /** A texture of something painted on a canvas. Its colours are stored so the shader reads them as amounts of light. */
  picture(source: TexImageSource): WebGLTexture {
    const { gl } = this;
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.smooth();
    return texture;
  }

  /** A square texture of plain numbers, four bytes a texel. */
  table(size: number, bytes: Uint8Array): WebGLTexture {
    const { gl } = this;
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    this.smooth();
    return texture;
  }

  /**
   * A square to draw depths into, and the texture they end up in. Looked up
   * with a depth, it answers how much of the light gets that far.
   */
  depthTarget(size: number): { framebuffer: WebGLFramebuffer; texture: WebGLTexture } {
    const { gl } = this;
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('no framebuffer could be made');
    this.made.push(() => gl.deleteFramebuffer(framebuffer));
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('the shadow map could not be set up');
    return { framebuffer, texture };
  }

  /** How many things are still to be given back. */
  get held(): number {
    return this.made.length;
  }

  /** Deletes everything this made, newest first. */
  dispose(): void {
    for (let i = this.made.length - 1; i >= 0; i--) this.made[i]();
    this.made = [];
  }
}
