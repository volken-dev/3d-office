import type Node from "three/src/nodes/core/Node.js"
import { ivec2, textureLoad, uint } from "three/tsl"
import * as THREE from "three/webgpu"

/** The largest texture side WebGL2 guarantees (MAX_TEXTURE_SIZE >= 2048); WebGPU allows 8192. */
export const MAX_TEXTURE_SIDE = 2048
const FLOATS_PER_RECORD = 4

/**
 * A list of vec4 records stored in an RGBA float texture and read in shaders by record index.
 *
 * Shaders read character data from these rather than from storage buffers because three's WebGL2
 * backend has no storage buffers: it can only turn a storage read indexed by `instanceIndex` into a
 * vertex attribute, so any other index fails to build. An unfiltered texel fetch (`textureLoad`)
 * works the same on WebGPU and WebGL2, returns the stored float32 values exactly, and adds no
 * vertex buffers. Records fill rows left to right; `array` is padded to whole rows and is the
 * texture's own data, so writes to it upload after `markChanged`.
 */
export class Vec4Texture {
  public readonly array: Float32Array
  public readonly texture: THREE.DataTexture
  public readonly recordCount: number
  private readonly width: number

  constructor(recordCount: number) {
    const width = Math.min(Math.max(recordCount, 1), MAX_TEXTURE_SIDE)
    const height = Math.max(Math.ceil(recordCount / width), 1)
    if (height > MAX_TEXTURE_SIDE) {
      throw new Error(`${recordCount} records do not fit in a ${MAX_TEXTURE_SIDE}px texture`)
    }
    this.recordCount = recordCount
    this.width = width
    this.array = new Float32Array(width * height * FLOATS_PER_RECORD)
    this.texture = new THREE.DataTexture(
      this.array,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    )
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
  }

  /** Uploads `array` before the next render. */
  public markChanged(): void {
    this.texture.needsUpdate = true
  }

  /** Shader node reading the record at `recordIndex`. */
  public element(recordIndex: Node<"uint">): Node<"vec4"> {
    const width = uint(this.width)
    return textureLoad(this.texture, ivec2(recordIndex.mod(width), recordIndex.div(width)))
  }

  public dispose(): void {
    this.texture.dispose()
  }
}
