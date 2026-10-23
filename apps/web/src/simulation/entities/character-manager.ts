import type { GLTF } from "three/addons/loaders/GLTFLoader.js"
import {
  atan,
  attribute,
  cos,
  Fn,
  float,
  If,
  instanceIndex,
  mat3,
  mat4,
  positionLocal,
  sin,
  texture,
  uint,
  uniform,
  uv,
  varying,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { AgentStateBuffer } from "../behavior/agent-state-buffer"
import { MOVEMENT_STRIDE, type MovementBuffers } from "../behavior/character-movement"
import { ExpressionBuffer } from "../behavior/expression-buffer"
import {
  type AccessoryId,
  type CharacterModelDef,
  DEFAULT_CHARACTER_MODEL_ID,
  type PartRule,
  partRuleFor,
} from "../characters/character-models"
import { ALPHA_LERP_RATE, OVERLAP_ALPHA, OVERLAP_DIST_SQ } from "../constants"
import { castMemberAt, type SceneCast } from "../scene-cast"
import { isMesh, isSkinnedMesh } from "../scene-graph-guards"
import { AgentBehavior, AnimationName, type ExpressionKey, type PoiDef } from "../scene-types"
import { Vec4Texture } from "../vec4-texture"
import type { PoiManager } from "../world/poi-manager"
import { CharacterSlots } from "./character-slots"

/** Velocity length above which the vertex shader faces along the velocity instead of the facing override. */
const MOVING_VELOCITY_THRESHOLD = 0.01
const BAKE_FRAMES_PER_SECOND = 60
const FLOATS_PER_MATRIX = 16
/** A baked bone matrix is stored as its four columns, one vec4 record each. */
const RECORDS_PER_MATRIX = 4
/** Upper bound of the random negative idle start time, so idle animations start out of sync. */
const IDLE_DESYNC_SECONDS = 10
const SPAWN_RADIUS = 8
/** Accumulator start value for the skinning matrix sum. */
const ZERO_MATRIX = new THREE.Matrix4().multiplyScalar(0)

/** Per-instance accessory id written to the `accessoryType` attribute and compared in the shaders. */
const ACCESSORY_NONE = 0
const ACCESSORY_IDS: Record<AccessoryId, number> = { headphones: 1, cap: 2 }
/** Surface of every part of a "matte" model. */
const MATTE_ROUGHNESS = 1
const MATTE_METALNESS = 0.25

/** GLTFLoader only produces standard, physical (a standard subclass) and basic (unlit) materials. */
function colorMapOf(material: THREE.Material | THREE.Material[]): THREE.Texture | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshBasicMaterial
  ) {
    return material.map
  }
  return null
}

/**
 * Copies a plain mesh geometry into an InstancedBufferGeometry. The @types/three signature of
 * InstancedBufferGeometry.copy only accepts another InstancedBufferGeometry, so this calls the
 * BufferGeometry copy it delegates to and sets the instance count itself.
 */
function toInstancedGeometry(
  geometry: THREE.BufferGeometry,
  instanceCount: number,
): THREE.InstancedBufferGeometry {
  const instancedGeometry = new THREE.InstancedBufferGeometry()
  THREE.BufferGeometry.prototype.copy.call(instancedGeometry, geometry)
  instancedGeometry.instanceCount = instanceCount
  return instancedGeometry
}

function standardMaterialOf(
  material: THREE.Material | THREE.Material[],
): THREE.MeshStandardMaterial | null {
  return material instanceof THREE.MeshStandardMaterial ? material : null
}

/** One drawable part of a model, with the rule from its model definition that says how to draw it. */
interface RigPart {
  name: string
  geometry: THREE.BufferGeometry
  colorMap: THREE.Texture | null
  sourceMaterial: THREE.MeshStandardMaterial | null
  rule: PartRule
}

/** Where a clip sits in the rig's baked buffer (by AnimationName index) and how long it lasts. */
interface ClipTiming {
  index: number
  duration: number
}

/**
 * A loaded character model: its parts, skeleton and animations baked to bone-matrix textures.
 * `clipTable` holds one record per clip (by AnimationName index): its first matrix in
 * `bakedAnimations`, its frame count and its duration.
 */
interface CharacterRig {
  model: CharacterModelDef
  parts: RigPart[]
  boneCount: number
  headBoneIndex: number
  bakedAnimations: Vec4Texture
  clipTable: Vec4Texture
  clips: Partial<Record<AnimationName, ClipTiming>>
}

/** The parts of a loaded GLB a rig is baked from. */
type CharacterGltf = Pick<GLTF, "scene" | "animations">

/** A model definition with its downloaded GLB, ready to bake. */
export interface LoadedCharacterModel {
  model: CharacterModelDef
  gltf: CharacterGltf
}

/** Per-instance position and velocity as the vertex shader reads them. */
interface MovementTextures {
  positionTexture: Vec4Texture
  velocityTexture: Vec4Texture
}

interface MeshAttributes extends MovementTextures {
  agentStateBuffer: AgentStateBuffer
  colorAttribute: THREE.InstancedBufferAttribute
  accessoryAttribute: THREE.InstancedBufferAttribute
  rigSlotAttribute: THREE.InstancedBufferAttribute
  expressionBuffer: ExpressionBuffer
}

/**
 * Renders every character as GPU-instanced skinned meshes. Animations are baked to bone-matrix
 * textures at load and sampled in the vertex shader. Walking is stepped on the CPU each frame
 * (`applyMovement`) and uploaded to per-instance position and velocity textures, so CPU positions
 * are always current.
 * Per-instance data the shaders index lives in textures (`Vec4Texture`) rather than vertex
 * attributes, because the parts already use WebGPU's default limit of eight vertex buffers, and
 * rather than storage buffers, which the WebGL2 fallback cannot read.
 */
export class CharacterManager {
  private cast: SceneCast
  /** Which instance slot each character (the user and every agent) is drawn in. */
  private slots: CharacterSlots
  private poiManager: PoiManager | null = null

  /** Per instance (x, y, z, w); the source of truth for every character's position. */
  private positions: Float32Array | null = null
  /** Per instance: this frame's walk step, which the vertex shader faces along. */
  private velocities: Float32Array | null = null
  private positionTexture: Vec4Texture | null = null
  private velocityTexture: Vec4Texture | null = null
  private colorAttribute: THREE.InstancedBufferAttribute | null = null
  private accessoryAttribute: THREE.InstancedBufferAttribute | null = null
  /** Per instance: index of its rig in `activeRigs`, compared in each rig's shaders. */
  private rigSlotAttribute: THREE.InstancedBufferAttribute | null = null

  /** CPU+GPU facing and behaviour state per instance. */
  private agentStateBuffer: AgentStateBuffer | null = null

  /** CPU+GPU eye and mouth atlas offsets per instance. */
  private expressionBuffer: ExpressionBuffer | null = null

  /** Global time for animation start times; also drives the pause-safe shader time uniform. */
  private currentTime = 0
  private timeUniform = uniform(0)

  private instancedMeshes: THREE.Mesh[] = []
  /** Every model baked so far, by model id. */
  private readonly rigs = new Map<string, CharacterRig>()
  /** The rigs the current team uses, in slot order; only these have instanced meshes. */
  private activeRigs: CharacterRig[] = []
  /** The rig each character is drawn with, by slot. */
  private instanceRigs: CharacterRig[] = []
  /** Model ids the instanced meshes were built for, to know when a team change needs a rebuild. */
  private builtRigKey = ""

  private readonly scratchForward = new THREE.Vector3()

  public isLoaded = false

  constructor(
    private scene: THREE.Scene,
    cast: SceneCast,
  ) {
    this.cast = cast
    this.slots = CharacterSlots.forCast(cast)
  }

  private get instanceCount(): number {
    return this.slots.count
  }

  /** The slot an agent's per-instance data lives in, or null when it has no character. */
  private slotOf(agentIndex: number): number | null {
    return this.slots.slotOf(agentIndex)
  }

  public setPoiManager(poiManager: PoiManager) {
    this.poiManager = poiManager
  }

  /** Bakes the models the current team needs and creates the instanced meshes. */
  public setup(models: readonly LoadedCharacterModel[]) {
    this.addModels(models)
    this.initInstances()
    this.isLoaded = true
  }

  /** Bakes more models (for a team that uses characters not loaded yet); call before `setTeam`. */
  public addModels(models: readonly LoadedCharacterModel[]) {
    for (const { model, gltf } of models) {
      if (!this.rigs.has(model.id)) this.rigs.set(model.id, this.buildRig(model, gltf))
    }
  }

  /** Whether this model is baked and can be drawn. */
  public hasModel(modelId: string): boolean {
    return this.rigs.has(modelId)
  }

  /**
   * Bakes one model's animations in AnimationName order, so an animation index means the same clip in every rig,
   * and records each clip's duration per rig. Throws if the model has no meshes or no animations; a missing clip
   * falls back to idle, then to the first clip.
   */
  private buildRig(model: CharacterModelDef, gltf: CharacterGltf): CharacterRig {
    const root = gltf.scene

    const skinnedMeshes: THREE.SkinnedMesh[] = []
    const allMeshes: THREE.Mesh[] = []
    root.traverse((child) => {
      if (!isMesh(child)) return
      allMeshes.push(child)
      if (isSkinnedMesh(child)) skinnedMeshes.push(child)
    })

    if (allMeshes.length === 0) throw new Error(`Character model "${model.id}" contains no meshes`)

    const parts = allMeshes.map((mesh): RigPart => {
      const sourceMaterial = standardMaterialOf(mesh.material)
      return {
        name: mesh.name,
        geometry: mesh.geometry,
        colorMap: colorMapOf(mesh.material),
        sourceMaterial,
        rule: partRuleFor(model, mesh.name, sourceMaterial?.name ?? ""),
      }
    })

    const firstSkinnedMesh = skinnedMeshes[0]
    let boneCount = 0
    let headBoneIndex = -1
    if (firstSkinnedMesh) {
      boneCount = firstSkinnedMesh.skeleton.bones.length
      const headBone = firstSkinnedMesh.skeleton.bones.find(
        (bone) => bone.name.toLowerCase() === "head",
      )
      headBoneIndex = headBone ? firstSkinnedMesh.skeleton.bones.indexOf(headBone) : -1
    }

    const animations = gltf.animations
    const animationNames = Object.values(AnimationName)
    const bakedDataList: Float32Array[] = []
    const clipTable = new Vec4Texture(animationNames.length)
    const clipRecords = clipTable.array
    const clips: Partial<Record<AnimationName, ClipTiming>> = {}
    let currentOffset = 0

    animationNames.forEach((name, animationIndex) => {
      let clip = animations.find((animation) => animation.name === name)
      if (!clip) {
        if (name === AnimationName.IDLE) clip = animations[0]
        else
          clip =
            animations.find((animation) => animation.name === AnimationName.IDLE) || animations[0]
      }
      if (!clip) throw new Error(`Character model "${model.id}" contains no animations`)

      const baked = this.bakeAnimation(firstSkinnedMesh, clip, root)
      bakedDataList.push(baked.data)
      clips[name] = { index: animationIndex, duration: baked.duration }

      clipRecords[animationIndex * 4 + 0] = currentOffset
      clipRecords[animationIndex * 4 + 1] = baked.frameCount
      clipRecords[animationIndex * 4 + 2] = baked.duration
      clipRecords[animationIndex * 4 + 3] = 0

      currentOffset += baked.frameCount * boneCount
    })

    const bakedAnimations = new Vec4Texture(currentOffset * RECORDS_PER_MATRIX)
    let writeOffset = 0
    for (const data of bakedDataList) {
      bakedAnimations.array.set(data, writeOffset)
      writeOffset += data.length
    }

    return {
      model,
      parts,
      boneCount,
      headBoneIndex,
      bakedAnimations,
      clipTable,
      clips,
    }
  }

  /** The rig for a model, falling back to the default model when that one is not loaded. */
  private rigFor(modelId: string): CharacterRig | undefined {
    return this.rigs.get(modelId) ?? this.rigs.get(DEFAULT_CHARACTER_MODEL_ID)
  }

  /** Assigns every character its rig for the current team and lists the rigs in use, in slot order. */
  private assignRigs() {
    this.instanceRigs = []
    const active: CharacterRig[] = []
    this.slots.agentIndices.forEach((agentIndex, slot) => {
      const modelId = castMemberAt(this.cast, agentIndex)?.modelId ?? DEFAULT_CHARACTER_MODEL_ID
      const rig = this.rigFor(modelId)
      if (!rig) return
      this.instanceRigs[slot] = rig
      if (!active.includes(rig)) active.push(rig)
    })
    this.activeRigs = active
  }

  private activeRigKey(): string {
    return this.activeRigs.map((rig) => rig.model.id).join(",")
  }

  /**
   * Switches the characters to another cast and rebuilds the slot mapping from its roster, so the
   * slots stay dense after an agent is removed. When the character count and the set of models in use are
   * unchanged, colours, accessories and models are rewritten in place, so no GPU resources or pipelines are
   * rebuilt. Either way every character is reset to its initial spawn state. Load any new models with
   * `addModels` first; a character whose model is missing is drawn with the default model.
   */
  public setCast(cast: SceneCast) {
    this.cast = cast
    this.slots = CharacterSlots.forCast(cast)
    if (!this.isLoaded) return
    const count = this.instanceCount
    this.assignRigs()
    if (count !== this.positionTexture?.recordCount || this.activeRigKey() !== this.builtRigKey) {
      this.cleanupInstances()
      this.initInstances()
      return
    }
    this.agentStateBuffer?.array.fill(0)
    this.writeInitialState()
  }

  /** Advances shader time, blinking and speaking. */
  public update(deltaSeconds: number) {
    this.currentTime += deltaSeconds
    this.timeUniform.value = this.currentTime
    this.expressionBuffer?.update(deltaSeconds)
  }

  /**
   * Runs one movement step over every character's position and velocity, addressed by slot, then
   * uploads both for this frame's render.
   */
  public applyMovement(step: (buffers: MovementBuffers) => void): void {
    const { positions, velocities, positionTexture, velocityTexture } = this
    if (!positions || !velocities || !positionTexture || !velocityTexture) return
    step({ positions, velocities, slotOf: (agentIndex) => this.slotOf(agentIndex) })
    positionTexture.markChanged()
    velocityTexture.markChanged()
  }

  private cleanupInstances() {
    for (const mesh of this.instancedMeshes) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      const material = mesh.material
      if (!Array.isArray(material)) material.dispose()
    }
    this.instancedMeshes = []
    this.positionTexture?.dispose()
    this.velocityTexture?.dispose()
    this.agentStateBuffer?.dispose()
    this.expressionBuffer?.dispose()
    this.expressionBuffer = null
  }

  private initInstances() {
    this.assignRigs()
    if (this.activeRigs.length === 0) return

    const count = this.instanceCount
    const positionTexture = new Vec4Texture(count)
    const velocityTexture = new Vec4Texture(count)
    const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    const accessoryAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    const rigSlotAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    this.positions = positionTexture.array
    this.velocities = velocityTexture.array
    this.positionTexture = positionTexture
    this.velocityTexture = velocityTexture
    this.colorAttribute = colorAttribute
    this.accessoryAttribute = accessoryAttribute
    this.rigSlotAttribute = rigSlotAttribute

    const agentStateBuffer = new AgentStateBuffer(count)
    const expressionBuffer = new ExpressionBuffer(count)
    this.agentStateBuffer = agentStateBuffer
    this.expressionBuffer = expressionBuffer
    this.writeInitialState()

    this.createInstancedMesh({
      positionTexture,
      velocityTexture,
      agentStateBuffer,
      colorAttribute,
      accessoryAttribute,
      rigSlotAttribute,
      expressionBuffer,
    })
    this.builtRigKey = this.activeRigKey()
  }

  /**
   * Writes spawn positions, team colours, accessories and idle state into the existing buffers.
   * The user spawns at the origin; agents take a free spawn POI (and face along it) or a random
   * spot. Idle animations get random negative start times so they play out of sync.
   */
  private writeInitialState() {
    const positions = this.positions
    const velocities = this.velocities
    const positionTexture = this.positionTexture
    const velocityTexture = this.velocityTexture
    const colorAttribute = this.colorAttribute
    const accessoryAttribute = this.accessoryAttribute
    const rigSlotAttribute = this.rigSlotAttribute
    const agentStateBuffer = this.agentStateBuffer
    const expressionBuffer = this.expressionBuffer
    if (
      !positions ||
      !velocities ||
      !positionTexture ||
      !velocityTexture ||
      !colorAttribute ||
      !accessoryAttribute ||
      !rigSlotAttribute ||
      !agentStateBuffer ||
      !expressionBuffer
    ) {
      return
    }
    const colors = colorAttribute.array
    const accessories = accessoryAttribute.array
    const rigSlots = rigSlotAttribute.array
    positions.fill(0)
    velocities.fill(0)

    const scratchColor = new THREE.Color()

    const spawnPois = this.poiManager?.getFreePoisOfKind("spawn") ?? []
    let spawnIndex = 0

    const spawnPoiBySlot: (PoiDef | null)[] = []

    this.slots.agentIndices.forEach((agentIndex, slot) => {
      const member = castMemberAt(this.cast, agentIndex)
      if (member) scratchColor.set(member.color)

      if (member?.role === "user") {
        positions[slot * 4 + 0] = 0
        positions[slot * 4 + 2] = 0
        spawnPoiBySlot[slot] = null
      } else {
        const poi = spawnPois[spawnIndex % spawnPois.length]
        if (poi) {
          this.poiManager?.occupy(poi.id, agentIndex)
          positions[slot * 4 + 0] = poi.position.x
          positions[slot * 4 + 2] = poi.position.z
          spawnIndex++
          spawnPoiBySlot[slot] = poi
        } else {
          positions[slot * 4 + 0] = (Math.random() - 0.5) * SPAWN_RADIUS * 2
          positions[slot * 4 + 2] = (Math.random() - 0.5) * SPAWN_RADIUS * 2
          spawnPoiBySlot[slot] = null
        }
        positions[slot * 4 + 3] = 1
        velocities[slot * 4 + 0] = (Math.random() - 0.5) * 0.1
        velocities[slot * 4 + 2] = (Math.random() - 0.5) * 0.1
      }

      colors[slot * 3 + 0] = scratchColor.r
      colors[slot * 3 + 1] = scratchColor.g
      colors[slot * 3 + 2] = scratchColor.b

      const accessory = member?.accessory
      accessories[slot] = accessory ? ACCESSORY_IDS[accessory] : ACCESSORY_NONE
      const rig = this.instanceRigs[slot]
      rigSlots[slot] = rig ? this.activeRigs.indexOf(rig) : -1
    })

    positionTexture.markChanged()
    velocityTexture.markChanged()
    colorAttribute.needsUpdate = true
    accessoryAttribute.needsUpdate = true
    rigSlotAttribute.needsUpdate = true

    for (let slot = 0; slot < this.instanceCount; slot++) {
      agentStateBuffer.setAlpha(slot, 1)
      agentStateBuffer.setState(slot, AgentBehavior.IDLE)

      const idleClip = this.instanceRigs[slot]?.clips[AnimationName.IDLE]
      if (idleClip) {
        agentStateBuffer.setAnimation(
          slot,
          idleClip.index,
          true,
          -Math.random() * IDLE_DESYNC_SECONDS,
        )
      }

      const poi = spawnPoiBySlot[slot]
      if (poi) {
        const forward = this.forwardOf(poi.quaternion)
        agentStateBuffer.setFacing(slot, forward.x, forward.z)
      }
      expressionBuffer.setSpeaking(slot, false)
      expressionBuffer.setExpression(slot, "idle")
    }
  }

  /** Creates the instanced meshes of every rig in use; each draws only the instances assigned to its slot. */
  private createInstancedMesh(attributes: MeshAttributes) {
    this.activeRigs.forEach((rig, slot) => {
      for (const part of rig.parts) this.createPartMesh(rig, slot, part, attributes)
    })
  }

  /**
   * One instanced mesh for one model part, drawn by its part rule:
   * - colour from the team colour ("instance", multiplied by the part's texture if it has one) or from the
   *   part's own texture or material colour ("authored"), plus the authored glow for emissive rules;
   * - expression parts sample the atlas offset and draw as an overlay (no depth write, polygon offset) so they
   *   sit on the body without z-fighting while walls still hide them;
   * - accessory parts show only on characters wearing that accessory and are rigidly skinned to the head bone.
   * Base parts render first (renderOrder 0) so they write depth before overlays and accessories.
   * The per-instance alpha and expression offsets are read in the vertex stage and passed on as
   * varyings, so the fragment stage never needs the instance index.
   */
  private createPartMesh(
    rig: CharacterRig,
    slot: number,
    { geometry, colorMap, sourceMaterial, rule }: RigPart,
    {
      colorAttribute,
      accessoryAttribute,
      rigSlotAttribute,
      expressionBuffer,
      agentStateBuffer,
      ...movementTextures
    }: MeshAttributes,
  ) {
    const instancedGeometry = toInstancedGeometry(geometry, this.instanceCount)
    instancedGeometry.setAttribute("instanceColor", colorAttribute)
    instancedGeometry.setAttribute("accessoryType", accessoryAttribute)
    instancedGeometry.setAttribute("rigSlot", rigSlotAttribute)

    const instanceColor = attribute<"vec3">("instanceColor", "vec3")
    const accessoryType = attribute<"float">("accessoryType", "float")
    const rigSlot = attribute<"float">("rigSlot", "float")
    const expressionData = varying(expressionBuffer.texture.element(instanceIndex))
    const animationParams = agentStateBuffer.texture.element(instanceIndex.mul(2).add(1))
    const instanceAlpha = varying(animationParams.z)

    const material = new THREE.MeshStandardNodeMaterial()
    material.transparent = true
    material.depthTest = true
    if (rig.model.surface === "authored" && sourceMaterial) {
      material.roughness = sourceMaterial.roughness
      material.metalness = sourceMaterial.metalness
      material.side = sourceMaterial.side
    } else {
      material.roughness = MATTE_ROUGHNESS
      material.metalness = MATTE_METALNESS
    }

    const accessoryId = rule.accessory ? ACCESSORY_IDS[rule.accessory] : undefined
    const wearsAccessory =
      accessoryId === undefined ? undefined : accessoryType.equal(float(accessoryId))
    const partAlpha = wearsAccessory
      ? wearsAccessory.select(instanceAlpha, float(0))
      : instanceAlpha
    if (wearsAccessory) material.opacityNode = partAlpha

    const expressionUv =
      rule.expression === "eyes"
        ? uv().add(expressionData.xy)
        : rule.expression === "mouth"
          ? uv().add(expressionData.zw)
          : null

    if (rule.expression) {
      material.depthWrite = false
      material.polygonOffset = true
      material.polygonOffsetFactor = -1
      material.polygonOffsetUnits = -1
    } else {
      material.depthWrite = true
    }

    if (rule.color === "instance") {
      const textureColor = colorMap ? texture(colorMap) : null
      material.colorNode = textureColor
        ? vec4(
            textureColor.rgb.mul(instanceColor),
            wearsAccessory ? partAlpha : textureColor.a.mul(instanceAlpha),
          )
        : vec4(instanceColor, partAlpha)
    } else if (colorMap) {
      const textureColor = expressionUv ? texture(colorMap, expressionUv) : texture(colorMap)
      material.colorNode = vec4(textureColor.rgb, textureColor.a.mul(partAlpha))
    } else if (rule.expression || !sourceMaterial) {
      material.opacityNode = float(0)
    } else {
      const { r, g, b } = sourceMaterial.color
      material.colorNode = vec4(vec3(r, g, b), partAlpha)
    }

    const emissive = sourceMaterial?.emissive
    if (rule.emissive && emissive && emissive.getHex() !== 0) {
      material.emissiveNode = vec3(emissive.r, emissive.g, emissive.b)
    }

    if (rule.accessory && rig.headBoneIndex !== -1 && !geometry.attributes.skinIndex) {
      const vertexCount = geometry.attributes.position.count
      const skinIndices = new Float32Array(vertexCount * 4).fill(rig.headBoneIndex)
      const skinWeights = new Float32Array(vertexCount * 4).fill(0)
      for (let i = 0; i < vertexCount; i++) skinWeights[i * 4] = 1.0
      instancedGeometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndices, 4))
      instancedGeometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeights, 4))
    }

    const inThisSlot = rigSlot.equal(float(slot))
    const isVisible = (wearsAccessory ? inThisSlot.and(wearsAccessory) : inThisSlot).and(
      instanceAlpha.greaterThan(0),
    )
    const vertexNode = this.createVertexNode(isVisible, movementTextures, agentStateBuffer, rig)
    material.positionNode = vertexNode
    material.castShadowPositionNode = vertexNode

    const instancedMesh = new THREE.Mesh(instancedGeometry, material)
    instancedMesh.frustumCulled = false
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    instancedMesh.renderOrder = rule.expression || rule.accessory ? 1 : 0
    this.scene.add(instancedMesh)
    this.instancedMeshes.push(instancedMesh)
  }

  /**
   * Vertex shader: samples the baked bone matrices for the instance's current animation frame,
   * turns the character to face its velocity while moving (else its facing override, else +Z),
   * and collapses hidden instances to a point.
   */
  private createVertexNode(
    isVisibleNode: THREE.Node,
    { positionTexture, velocityTexture }: MovementTextures,
    agentStateBuffer: AgentStateBuffer,
    rig: CharacterRig,
  ) {
    return Fn(() => {
      const instancePosition = positionTexture.element(instanceIndex).xyz
      const velocity = velocityTexture.element(instanceIndex).xyz
      const agentData = agentStateBuffer.texture.element(instanceIndex.mul(2))
      const animationParams = agentStateBuffer.texture.element(instanceIndex.mul(2).add(1))

      const isMoving = velocity.length().greaterThan(float(MOVING_VELOCITY_THRESHOLD))
      const facingOverride = vec3(agentData.x, float(0), agentData.z)
      const hasFacingOverride = facingOverride.length().greaterThan(float(0))

      const facing = vec3(0, 0, 1).toVar()

      If(isMoving, () => {
        facing.assign(velocity)
      }).ElseIf(hasFacingOverride, () => {
        facing.assign(facingOverride)
      })

      const angle = atan(facing.z, facing.x)
        .negate()
        .add(float(Math.PI / 2))
      const rotationMatrix = mat3(
        vec3(cos(angle), float(0), sin(angle).negate()),
        vec3(float(0), float(1), float(0)),
        vec3(sin(angle), float(0), cos(angle)),
      )

      const finalPosition = positionLocal.toVar()

      {
        const { bakedAnimations } = rig

        const animationIndex = agentData.y.toUint()

        const animationMeta = rig.clipTable.element(animationIndex)
        const animationOffset = uint(animationMeta.x)
        const frameCount = float(animationMeta.y)
        const duration = float(animationMeta.z)

        const startTime = animationParams.x
        const loopMode = animationParams.y

        const elapsed = this.timeUniform.sub(startTime).max(0)
        const progress = loopMode.greaterThan(0.5)
          ? elapsed.div(duration).fract()
          : elapsed.div(duration).clamp(0, 1)

        const safeFrame = progress.mul(frameCount).floor().min(frameCount.sub(1)).toUint()

        const skinIndex = attribute<"vec4">("skinIndex")
        const skinWeight = attribute<"vec4">("skinWeight")
        const skinMatrix = mat4(ZERO_MATRIX).toVar()

        const boneCount = rig.boneCount
        function addInfluence(boneIndexNode: THREE.Node<"float">, weightNode: THREE.Node<"float">) {
          If(weightNode.greaterThan(0), () => {
            const matrixIndex = animationOffset
              .add(safeFrame.mul(uint(boneCount)))
              .add(boneIndexNode.toUint())
            const firstColumn = matrixIndex.mul(uint(RECORDS_PER_MATRIX))
            const boneMatrix = mat4(
              bakedAnimations.element(firstColumn),
              bakedAnimations.element(firstColumn.add(uint(1))),
              bakedAnimations.element(firstColumn.add(uint(2))),
              bakedAnimations.element(firstColumn.add(uint(3))),
            )
            skinMatrix.addAssign(boneMatrix.mul(weightNode))
          })
        }

        addInfluence(skinIndex.x, skinWeight.x)
        addInfluence(skinIndex.y, skinWeight.y)
        addInfluence(skinIndex.z, skinWeight.z)
        addInfluence(skinIndex.w, skinWeight.w)

        finalPosition.assign(skinMatrix.mul(vec4(positionLocal, 1.0)).xyz)
      }

      const vertexScale = isVisibleNode.select(float(1), float(0))
      return rotationMatrix.mul(finalPosition.mul(vertexScale)).add(instancePosition)
    })()
  }

  /** Samples the clip at BAKE_FRAMES_PER_SECOND into one flat array of bone matrices per frame. */
  private bakeAnimation(mesh: THREE.SkinnedMesh, clip: THREE.AnimationClip, root: THREE.Object3D) {
    const mixer = new THREE.AnimationMixer(root)
    mixer.clipAction(clip).play()
    const skeleton = mesh.skeleton
    const duration = clip.duration
    const frameCount = Math.ceil(duration * BAKE_FRAMES_PER_SECOND)
    const boneCount = skeleton.bones.length
    const data = new Float32Array(frameCount * boneCount * FLOATS_PER_MATRIX)
    for (let frame = 0; frame < frameCount; frame++) {
      mixer.setTime((frame / frameCount) * duration)
      root.updateMatrixWorld(true)
      skeleton.update()
      const boneMatrices = skeleton.boneMatrices
      if (!boneMatrices) throw new Error("Skeleton has no bone matrices after update")
      for (let bone = 0; bone < boneCount; bone++) {
        const frameBoneOffset = (frame * boneCount + bone) * FLOATS_PER_MATRIX
        for (let k = 0; k < FLOATS_PER_MATRIX; k++) {
          data[frameBoneOffset + k] = boneMatrices[bone * FLOATS_PER_MATRIX + k]
        }
      }
    }
    return {
      data,
      frameCount,
      duration,
    }
  }

  /** Agent indices of every character, in slot order. */
  public getAgentIndices(): readonly number[] {
    return this.slots.agentIndices
  }

  /** Writes a character's world position into `out`. Returns false if the agent has no character. */
  public getCPUPosition(agentIndex: number, out: THREE.Vector3): boolean {
    const slot = this.slotOf(agentIndex)
    if (!this.positions || slot === null) return false
    const offset = slot * MOVEMENT_STRIDE
    out.set(this.positions[offset], this.positions[offset + 1], this.positions[offset + 2])
    return true
  }

  public setPhysicsMode(agentIndex: number, mode: AgentBehavior) {
    const slot = this.slotOf(agentIndex)
    if (!this.agentStateBuffer || slot === null) return
    this.agentStateBuffer.setState(slot, mode)
  }

  /** Teleports a character to an exact world position, uploaded with this frame's render. */
  public setPosition(agentIndex: number, position: THREE.Vector3): void {
    const slot = this.slotOf(agentIndex)
    if (!this.positions || !this.positionTexture || slot === null) return
    const offset = slot * MOVEMENT_STRIDE
    this.positions[offset] = position.x
    this.positions[offset + 1] = position.y
    this.positions[offset + 2] = position.z
    this.positionTexture.markChanged()
  }

  /** The direction a character faces whenever it is not walking fast enough to face its velocity. */
  public setFacing(agentIndex: number, x: number, z: number) {
    const slot = this.slotOf(agentIndex)
    if (!this.agentStateBuffer || slot === null) return
    this.agentStateBuffer.setFacing(slot, x, z)
  }

  /** Force a specific orientation based on a quaternion. */
  public setOrientation(agentIndex: number, quaternion: THREE.Quaternion) {
    const forward = this.forwardOf(quaternion)
    this.setFacing(agentIndex, forward.x, forward.z)
  }

  private forwardOf(quaternion: THREE.Quaternion): THREE.Vector3 {
    return this.scratchForward.set(0, 0, 1).applyQuaternion(quaternion)
  }

  public getAgentState(agentIndex: number): AgentBehavior {
    const slot = this.slotOf(agentIndex)
    if (!this.agentStateBuffer || slot === null) return AgentBehavior.IDLE
    return this.agentStateBuffer.getState(slot)
  }

  public setAnimation(agentIndex: number, name: AnimationName, loop: boolean = true) {
    const slot = this.slotOf(agentIndex)
    if (!this.agentStateBuffer || slot === null) return
    const clip = this.instanceRigs[slot]?.clips[name]
    if (clip) this.agentStateBuffer.setAnimation(slot, clip.index, loop, this.currentTime)
  }

  /** The clip's duration in seconds for this character's model; 1.0 if the clip is not found. */
  public getAnimationDuration(agentIndex: number, name: AnimationName): number {
    const slot = this.slotOf(agentIndex)
    if (slot === null) return 1.0
    return this.instanceRigs[slot]?.clips[name]?.duration ?? 1.0
  }

  public setExpression(agentIndex: number, name: ExpressionKey) {
    const slot = this.slotOf(agentIndex)
    if (this.expressionBuffer && slot !== null) this.expressionBuffer.setExpression(slot, name)
  }

  /** Mouth animation only; callers choose the talk/listen body animation. */
  public setSpeaking(agentIndex: number, isSpeaking: boolean) {
    const slot = this.slotOf(agentIndex)
    if (this.expressionBuffer && slot !== null) this.expressionBuffer.setSpeaking(slot, isSpeaking)
  }

  /** Fades characters that overlap so neither hides the other. */
  public updateOverlapFading(deltaSeconds: number) {
    const { positions, agentStateBuffer } = this
    if (!positions || !agentStateBuffer) return
    const count = this.instanceCount
    for (let slot = 0; slot < count; slot++) {
      let overlap = false
      for (let otherSlot = 0; otherSlot < count; otherSlot++) {
        if (slot === otherSlot) continue
        if (
          (positions[slot * 4] - positions[otherSlot * 4]) ** 2 +
            (positions[slot * 4 + 2] - positions[otherSlot * 4 + 2]) ** 2 <
          OVERLAP_DIST_SQ
        ) {
          overlap = true
          break
        }
      }
      const currentAlpha = agentStateBuffer.getAlpha(slot)
      const targetAlpha = overlap ? OVERLAP_ALPHA : 1.0
      if (Math.abs(currentAlpha - targetAlpha) > 0.01)
        agentStateBuffer.setAlpha(
          slot,
          THREE.MathUtils.lerp(
            currentAlpha,
            targetAlpha,
            Math.min(deltaSeconds * ALPHA_LERP_RATE, 1.0),
          ),
        )
    }
  }

  public dispose() {
    this.cleanupInstances()
    for (const rig of this.rigs.values()) {
      rig.bakedAnimations.dispose()
      rig.clipTable.dispose()
    }
    this.rigs.clear()
    this.isLoaded = false
  }
}
