import { type AgenticSystem, getAllAgents } from "@the-delegation/agents/team"
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
  storage,
  texture,
  uint,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { getAllCharacters } from "../../data/agents"
import { AgentBehavior, AnimationName, type ExpressionKey, type PoiDef } from "../../types"
import { AgentStateBuffer } from "../behavior/AgentStateBuffer"
import { ExpressionBuffer } from "../behavior/ExpressionBuffer"
import { isMesh, isSkinnedMesh } from "../sceneGraphGuards"
import type { PoiManager } from "../world/PoiManager"

type Vec4StorageNode = THREE.StorageBufferNode<"vec4">

/** Walk step per compute dispatch at 60 fps (the shader multiplies it by GOTO_SPEED_MULTIPLIER). */
const BASE_WALK_SPEED = 0.015
const REFERENCE_FPS = 60
/**
 * Lower bound on the frame-time speed scale. Keeps per-dispatch velocity above the vertex
 * shader's MOVING_VELOCITY_THRESHOLD, so walkers keep facing their path on 240 Hz+ displays.
 */
const MIN_SPEED_SCALE = 0.25
const GOTO_SPEED_MULTIPLIER = 3.0
/** Within this distance of the waypoint the compute shader snaps to it; the CPU then switches to IDLE. */
const WAYPOINT_ARRIVAL_RADIUS = 0.2
/** Velocity length above which the vertex shader faces along the velocity instead of the facing override. */
const MOVING_VELOCITY_THRESHOLD = 0.01
const BAKE_FRAMES_PER_SECOND = 60
const FLOATS_PER_MATRIX = 16
/** Upper bound of the random negative idle start time, so idle animations start out of sync. */
const IDLE_DESYNC_SECONDS = 10
const SPAWN_RADIUS = 8
/** Accumulator start value for the skinning matrix sum. */
const ZERO_MATRIX = new THREE.Matrix4().multiplyScalar(0)

/** Per-instance accessory id written to the `accessoryType` attribute and compared in the shaders. */
const ACCESSORY_NONE = 0
const ACCESSORY_HEADPHONES = 1
const ACCESSORY_CAP = 2

/** Characters on screen: the user plus every agent in the team. */
function characterCount(team: AgenticSystem): number {
  return getAllAgents(team).length + 1
}

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

interface InstanceStorage {
  positionStorage: Vec4StorageNode
  velocityStorage: Vec4StorageNode
  agentStateBuffer: AgentStateBuffer
}

interface MeshAttributes extends InstanceStorage {
  colorAttribute: THREE.InstancedBufferAttribute
  accessoryAttribute: THREE.InstancedBufferAttribute
  expressionBuffer: ExpressionBuffer
}

/**
 * Renders every character as GPU-instanced skinned meshes. Animations are baked to bone-matrix
 * buffers at load and sampled in the vertex shader, and walking runs in a compute shader, so the
 * CPU only writes waypoints and state and reads positions back about a frame late.
 */
export class CharacterManager {
  private team: AgenticSystem
  private instanceCount: number
  private poiManager: PoiManager | null = null

  private positionAttribute: THREE.StorageInstancedBufferAttribute | null = null
  private velocityAttribute: THREE.StorageInstancedBufferAttribute | null = null
  private colorAttribute: THREE.InstancedBufferAttribute | null = null
  private accessoryAttribute: THREE.InstancedBufferAttribute | null = null

  /** CPU+GPU waypoint and behaviour state per instance. */
  private agentStateBuffer: AgentStateBuffer | null = null

  /** CPU+GPU eye and mouth atlas offsets per instance. */
  private expressionBuffer: ExpressionBuffer | null = null

  /** CPU-side mirror of GPU positions, refreshed in place by each GPU readback. */
  private cpuPositions: Float32Array | null = null
  /** Bumped on every CPU position write, so a readback started before it is discarded instead of undoing it. */
  private positionWrites = 0

  /** Global time for animation start times; also drives the pause-safe shader time uniform. */
  private currentTime = 0
  private timeUniform = uniform(0)

  private computeNode: THREE.ComputeNode | null = null

  private instancedMeshes: THREE.Mesh[] = []
  private meshData: {
    name: string
    geometry: THREE.BufferGeometry
    colorMap: THREE.Texture | null
  }[] = []

  private animationsMeta: {
    [key: string]: { offset: number; frameCount: number; duration: number; index: number }
  } = {}
  private bakedAnimationsBuffer: THREE.StorageBufferAttribute | null = null
  private metaBuffer: THREE.StorageBufferAttribute | null = null
  private boneCount = 0
  private headBoneIndex = -1

  private walkSpeedUniform = uniform(BASE_WALK_SPEED)
  private readonly scratchForward = new THREE.Vector3()

  public isLoaded = false

  constructor(
    private scene: THREE.Scene,
    team: AgenticSystem,
  ) {
    this.team = team
    this.instanceCount = characterCount(team)
  }

  public setPoiManager(poiManager: PoiManager) {
    this.poiManager = poiManager
  }

  /**
   * Bakes the character GLB's animations and creates the instanced meshes. Throws if the model has
   * no meshes or no animations. A missing clip falls back to idle, then to the first clip.
   */
  public setup(gltf: GLTF) {
    const model = gltf.scene

    const skinnedMeshes: THREE.SkinnedMesh[] = []
    const allMeshes: THREE.Mesh[] = []
    model.traverse((child) => {
      if (!isMesh(child)) return
      allMeshes.push(child)
      if (isSkinnedMesh(child)) skinnedMeshes.push(child)
    })

    if (allMeshes.length === 0) throw new Error("Character model contains no meshes")

    this.meshData = allMeshes.map((mesh) => ({
      name: mesh.name,
      geometry: mesh.geometry,
      colorMap: colorMapOf(mesh.material),
    }))

    const firstSkinnedMesh = skinnedMeshes[0]
    if (firstSkinnedMesh) {
      this.boneCount = firstSkinnedMesh.skeleton.bones.length
      const headBone = firstSkinnedMesh.skeleton.bones.find(
        (bone) => bone.name.toLowerCase() === "head",
      )
      this.headBoneIndex = headBone ? firstSkinnedMesh.skeleton.bones.indexOf(headBone) : -1
    }

    const animations = gltf.animations
    const animationNames = Object.values(AnimationName)
    const bakedDataList: Float32Array[] = []
    const metaArray = new Float32Array(animationNames.length * 4)
    let currentOffset = 0

    animationNames.forEach((name, animationIndex) => {
      let clip = animations.find((animation) => animation.name === name)
      if (!clip) {
        if (name === AnimationName.IDLE) clip = animations[0]
        else
          clip =
            animations.find((animation) => animation.name === AnimationName.IDLE) || animations[0]
      }
      if (!clip) throw new Error("Character model contains no animations")

      const baked = this.bakeAnimation(firstSkinnedMesh, clip, model)
      bakedDataList.push(baked.data)

      this.animationsMeta[name] = {
        offset: currentOffset,
        frameCount: baked.frameCount,
        duration: baked.duration,
        index: animationIndex,
      }

      metaArray[animationIndex * 4 + 0] = currentOffset
      metaArray[animationIndex * 4 + 1] = baked.frameCount
      metaArray[animationIndex * 4 + 2] = baked.duration
      metaArray[animationIndex * 4 + 3] = 0

      currentOffset += baked.frameCount * this.boneCount
    })

    const totalSize = bakedDataList.reduce((total, data) => total + data.length, 0)
    const combinedData = new Float32Array(totalSize)
    let writeOffset = 0
    for (const data of bakedDataList) {
      combinedData.set(data, writeOffset)
      writeOffset += data.length
    }

    this.bakedAnimationsBuffer = new THREE.StorageBufferAttribute(combinedData, FLOATS_PER_MATRIX)
    this.metaBuffer = new THREE.StorageBufferAttribute(metaArray, 4)

    this.initInstances()
    this.isLoaded = true
  }

  /**
   * Switches the characters to another team. Colours and accessories are rewritten in place
   * when the character count is unchanged, so no GPU resources or pipelines are rebuilt.
   * Either way every character is reset to its initial spawn state.
   */
  public setTeam(team: AgenticSystem) {
    this.team = team
    const count = characterCount(team)
    if (!this.isLoaded) {
      this.instanceCount = count
      return
    }
    if (count !== this.instanceCount) {
      this.instanceCount = count
      this.cleanupInstances()
      this.initInstances()
      return
    }
    this.agentStateBuffer?.array.fill(0)
    this.writeInitialState()
  }

  /**
   * Reads the GPU position buffer back into the CPU mirror (about one frame behind).
   * Call after renderer.compute(). Returns the mirror, which is updated in place. A readback that
   * overlaps a rebuild or a teleport is discarded as stale, and a failed readback keeps the last
   * known positions. The attribute's own CPU array is kept current too, so a later setPosition
   * upload doesn't push stale positions.
   */
  public async syncFromGPU(renderer: THREE.WebGPURenderer): Promise<Float32Array | null> {
    const positionAttribute = this.positionAttribute
    const writesBefore = this.positionWrites
    if (!positionAttribute || !this.cpuPositions) return null
    try {
      const buffer: ArrayBuffer = await renderer.getArrayBufferAsync(positionAttribute)
      if (
        positionAttribute !== this.positionAttribute ||
        writesBefore !== this.positionWrites ||
        !this.cpuPositions
      ) {
        return this.cpuPositions
      }
      const gpuPositions = new Float32Array(buffer)
      this.cpuPositions.set(gpuPositions)
      positionAttribute.array.set(gpuPositions)
    } catch {}
    return this.cpuPositions
  }

  /**
   * Advances shader time and dispatches the walk compute shader. The shader moves walkers a fixed
   * step per dispatch, so the step is scaled by frame time to walk at the same speed at any refresh rate.
   */
  public update(deltaSeconds: number, renderer: THREE.WebGPURenderer) {
    this.currentTime += deltaSeconds
    this.timeUniform.value = this.currentTime
    this.walkSpeedUniform.value =
      BASE_WALK_SPEED * Math.max(deltaSeconds * REFERENCE_FPS, MIN_SPEED_SCALE)

    if (this.expressionBuffer) {
      this.expressionBuffer.update(deltaSeconds)
    }
    if (this.computeNode) {
      renderer.compute(this.computeNode)
    }
  }

  private cleanupInstances() {
    for (const mesh of this.instancedMeshes) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      const material = mesh.material
      if (!Array.isArray(material)) material.dispose()
    }
    this.instancedMeshes = []
    this.computeNode?.dispose()
    this.computeNode = null
    this.expressionBuffer = null
  }

  private initInstances() {
    if (this.meshData.length === 0) return

    const count = this.instanceCount
    const positionAttribute = new THREE.StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4,
    )
    const velocityAttribute = new THREE.StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4,
    )
    const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    const accessoryAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    this.positionAttribute = positionAttribute
    this.velocityAttribute = velocityAttribute
    this.colorAttribute = colorAttribute
    this.accessoryAttribute = accessoryAttribute
    this.cpuPositions = new Float32Array(count * 4)

    const positionStorage = storage(positionAttribute, "vec4", count)
    const velocityStorage = storage(velocityAttribute, "vec4", count)

    const agentStateBuffer = new AgentStateBuffer(count)
    const expressionBuffer = new ExpressionBuffer(count)
    this.agentStateBuffer = agentStateBuffer
    this.expressionBuffer = expressionBuffer
    this.writeInitialState()

    this.initComputeNode({ positionStorage, velocityStorage, agentStateBuffer })
    this.createInstancedMesh({
      positionStorage,
      velocityStorage,
      agentStateBuffer,
      colorAttribute,
      accessoryAttribute,
      expressionBuffer,
    })
  }

  /**
   * Writes spawn positions, team colours, accessories and idle state into the existing buffers.
   * The user spawns at the origin; agents take a free spawn POI (and face along it) or a random
   * spot. Idle animations get random negative start times so they play out of sync.
   */
  private writeInitialState() {
    const positionAttribute = this.positionAttribute
    const velocityAttribute = this.velocityAttribute
    const colorAttribute = this.colorAttribute
    const accessoryAttribute = this.accessoryAttribute
    const cpuPositions = this.cpuPositions
    const agentStateBuffer = this.agentStateBuffer
    const expressionBuffer = this.expressionBuffer
    if (
      !positionAttribute ||
      !velocityAttribute ||
      !colorAttribute ||
      !accessoryAttribute ||
      !cpuPositions ||
      !agentStateBuffer ||
      !expressionBuffer
    ) {
      return
    }
    const positions = positionAttribute.array
    const velocities = velocityAttribute.array
    const colors = colorAttribute.array
    const accessories = accessoryAttribute.array
    positions.fill(0)
    velocities.fill(0)
    this.positionWrites++

    const scratchColor = new THREE.Color()

    const spawnPois = this.poiManager?.getFreePoisByPrefix("spawn") || []
    let spawnIndex = 0

    const spawnPoiByCharacter: (PoiDef | null)[] = []

    const system = this.team
    const allCharacters = getAllCharacters(system)

    for (let characterIndex = 0; characterIndex < this.instanceCount; characterIndex++) {
      const character =
        allCharacters.find((candidate) => candidate.index === characterIndex) || system.leadAgent
      scratchColor.set(character.color)

      if (characterIndex === system.user.index) {
        positions[characterIndex * 4 + 0] = 0
        positions[characterIndex * 4 + 2] = 0
        spawnPoiByCharacter[characterIndex] = null
      } else {
        const poi = spawnPois[spawnIndex % spawnPois.length]
        if (poi) {
          this.poiManager?.occupy(poi.id, characterIndex)
          positions[characterIndex * 4 + 0] = poi.position.x
          positions[characterIndex * 4 + 2] = poi.position.z
          spawnIndex++
          spawnPoiByCharacter[characterIndex] = poi
        } else {
          positions[characterIndex * 4 + 0] = (Math.random() - 0.5) * SPAWN_RADIUS * 2
          positions[characterIndex * 4 + 2] = (Math.random() - 0.5) * SPAWN_RADIUS * 2
          spawnPoiByCharacter[characterIndex] = null
        }
        positions[characterIndex * 4 + 3] = 1
        velocities[characterIndex * 4 + 0] = (Math.random() - 0.5) * 0.1
        velocities[characterIndex * 4 + 2] = (Math.random() - 0.5) * 0.1
      }

      colors[characterIndex * 3 + 0] = scratchColor.r
      colors[characterIndex * 3 + 1] = scratchColor.g
      colors[characterIndex * 3 + 2] = scratchColor.b

      if (characterIndex === system.user.index) {
        accessories[characterIndex] = ACCESSORY_NONE
      } else if (characterIndex === system.leadAgent.index) {
        accessories[characterIndex] = ACCESSORY_HEADPHONES
      } else {
        accessories[characterIndex] = ACCESSORY_CAP
      }
    }

    cpuPositions.set(positions)
    positionAttribute.needsUpdate = true
    velocityAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
    accessoryAttribute.needsUpdate = true

    for (let characterIndex = 0; characterIndex < this.instanceCount; characterIndex++) {
      agentStateBuffer.setAlpha(characterIndex, 1)
      this.setPhysicsMode(characterIndex, AgentBehavior.IDLE)

      const idleMeta = this.animationsMeta[AnimationName.IDLE]
      if (idleMeta) {
        agentStateBuffer.setAnimation(
          characterIndex,
          idleMeta.index,
          true,
          -Math.random() * IDLE_DESYNC_SECONDS,
        )
      }

      const poi = spawnPoiByCharacter[characterIndex]
      if (poi && (poi.id.includes("spawn") || poi.id.includes("sit"))) {
        this.setOrientation(characterIndex, poi.quaternion)
      }
      expressionBuffer.setSpeaking(characterIndex, false)
      expressionBuffer.setExpression(characterIndex, "idle")
    }
  }

  /**
   * Builds the walk compute shader. Agent buffer element 0 is (waypointX, animation, waypointZ,
   * mode) with mode 0 = IDLE, 1 = GOTO, 2 = SEATED. GOTO steps toward the waypoint and snaps onto
   * it inside the arrival radius (the CPU switches to IDLE that frame). IDLE and SEATED are the
   * same on the GPU (the difference is CPU-only): velocity is zeroed so the vertex shader turns the
   * character by its facing override instead of a stale walk velocity.
   */
  private initComputeNode({ positionStorage, velocityStorage, agentStateBuffer }: InstanceStorage) {
    const agentStorage = agentStateBuffer.storageNode

    this.computeNode = Fn(() => {
      const positionElement = positionStorage.element(instanceIndex)
      const velocityElement = velocityStorage.element(instanceIndex)
      const agentData = agentStorage.element(instanceIndex.mul(2))
      const agentMode = agentData.w

      const position = positionElement.xyz.toVar()

      const isGoto = agentMode.greaterThan(float(0.5)).and(agentMode.lessThan(float(1.5)))

      If(isGoto, () => {
        const waypoint = vec3(agentData.x, float(0), agentData.z)
        const toWaypoint = waypoint.sub(position)
        const distanceToWaypoint = toWaypoint.length()
        If(distanceToWaypoint.greaterThan(float(WAYPOINT_ARRIVAL_RADIUS)), () => {
          const stepVelocity = toWaypoint
            .normalize()
            .mul(this.walkSpeedUniform.mul(GOTO_SPEED_MULTIPLIER))
          velocityElement.assign(vec4(stepVelocity, 0.0))
          positionElement.assign(vec4(position.add(stepVelocity), 1.0))
        }).Else(() => {
          positionElement.assign(vec4(agentData.x, position.y, agentData.z, 1.0))
        })
      }).Else(() => {
        velocityElement.assign(vec4(float(0), float(0), float(0), float(0)))
        positionElement.assign(vec4(position, 1.0))
      })
    })().compute(this.instanceCount)
  }

  /**
   * Creates one instanced mesh per model part. The body is drawn first (and renderOrder 0) so it
   * writes depth before the eyes and mouth are drawn over it. Only the body and accessories take
   * the instance colour; eyes and mouth sample the expression atlas offset and use polygon offset
   * to avoid z-fighting while still being occluded by walls. Static accessories are rigidly
   * skinned to the head bone.
   */
  private createInstancedMesh({
    colorAttribute,
    accessoryAttribute,
    expressionBuffer,
    agentStateBuffer,
    ...instanceStorage
  }: MeshAttributes) {
    const sortedMeshData = [...this.meshData].sort((a, b) => {
      const aIsBody = a.name.toLowerCase().includes("body")
      const bIsBody = b.name.toLowerCase().includes("body")
      if (aIsBody && !bIsBody) return -1
      if (!aIsBody && bIsBody) return 1
      return 0
    })

    for (const { name, geometry, colorMap } of sortedMeshData) {
      const instancedGeometry = toInstancedGeometry(geometry, this.instanceCount)

      instancedGeometry.setAttribute("instanceColor", colorAttribute)
      instancedGeometry.setAttribute("accessoryType", accessoryAttribute)

      const material = new THREE.MeshStandardNodeMaterial()
      material.roughness = 1
      material.metalness = 0.25

      const instanceColor = attribute<"vec3">("instanceColor", "vec3")

      const expressionData = expressionBuffer.storageNode.element(instanceIndex)
      const animationParams = agentStateBuffer.storageNode.element(instanceIndex.mul(2).add(1))
      const instanceAlpha = animationParams.z
      const accessoryType = attribute<"float">("accessoryType", "float")

      const isEyes = name.toLowerCase().includes("eyes")
      const isMouth = name.toLowerCase().includes("mouth")
      const isHeadphones = name.toLowerCase().includes("headphones")
      const isCap = name.toLowerCase().includes("cap")

      const featureUvNode = isEyes
        ? uv().add(expressionData.xy)
        : isMouth
          ? uv().add(expressionData.zw)
          : null

      material.transparent = true

      const isAccessory = isHeadphones || isCap
      const isBody = name.toLowerCase().includes("body")

      const accessoryOpacityNode = isHeadphones
        ? accessoryType.equal(float(ACCESSORY_HEADPHONES)).select(instanceAlpha, float(0))
        : isCap
          ? accessoryType.equal(float(ACCESSORY_CAP)).select(instanceAlpha, float(0))
          : null
      if (accessoryOpacityNode) material.opacityNode = accessoryOpacityNode

      if (isBody || isAccessory) {
        material.depthWrite = true
        material.depthTest = true

        const baseAlpha =
          accessoryOpacityNode ??
          (colorMap ? texture(colorMap).a.mul(instanceAlpha) : instanceAlpha)

        if (colorMap) {
          const textureColor = texture(colorMap)
          material.colorNode = vec4(textureColor.rgb.mul(instanceColor), baseAlpha)
        } else {
          material.colorNode = vec4(instanceColor, baseAlpha)
        }
      } else {
        material.depthWrite = false
        material.depthTest = true
        material.polygonOffset = true
        material.polygonOffsetFactor = -1
        material.polygonOffsetUnits = -1

        if (colorMap) {
          const textureColor = featureUvNode ? texture(colorMap, featureUvNode) : texture(colorMap)
          material.colorNode = vec4(textureColor.rgb, textureColor.a.mul(instanceAlpha))
        } else {
          material.opacityNode = float(0)
        }
      }

      if (isAccessory && this.headBoneIndex !== -1 && !geometry.attributes.skinIndex) {
        const vertexCount = geometry.attributes.position.count
        const skinIndices = new Float32Array(vertexCount * 4).fill(this.headBoneIndex)
        const skinWeights = new Float32Array(vertexCount * 4).fill(0)
        for (let i = 0; i < vertexCount; i++) skinWeights[i * 4] = 1.0
        instancedGeometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndices, 4))
        instancedGeometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeights, 4))
      }

      const isVisible = isHeadphones
        ? accessoryType.equal(float(ACCESSORY_HEADPHONES))
        : isCap
          ? accessoryType.equal(float(ACCESSORY_CAP))
          : float(1)
      const vertexNode = this.createVertexNode(
        isVisible.and(instanceAlpha.greaterThan(0)),
        instanceStorage,
        agentStateBuffer,
      )
      material.positionNode = vertexNode
      material.castShadowPositionNode = vertexNode

      const instancedMesh = new THREE.Mesh(instancedGeometry, material)
      instancedMesh.frustumCulled = false
      instancedMesh.castShadow = true
      instancedMesh.receiveShadow = true
      instancedMesh.renderOrder = isBody ? 0 : 1
      this.scene.add(instancedMesh)
      this.instancedMeshes.push(instancedMesh)
    }
  }

  /**
   * Vertex shader: samples the baked bone matrices for the instance's current animation frame,
   * turns the character to face its velocity while moving (else its facing override, else +Z),
   * and collapses hidden instances to a point.
   */
  private createVertexNode(
    isVisibleNode: THREE.Node,
    { positionStorage, velocityStorage }: Omit<InstanceStorage, "agentStateBuffer">,
    agentStateBuffer: AgentStateBuffer,
  ) {
    return Fn(() => {
      const instancePosition = positionStorage.element(instanceIndex).xyz
      const velocity = velocityStorage.element(instanceIndex).xyz
      const agentData = agentStateBuffer.storageNode.element(instanceIndex.mul(2))
      const animationParams = agentStateBuffer.storageNode.element(instanceIndex.mul(2).add(1))

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

      if (this.bakedAnimationsBuffer && this.metaBuffer) {
        const bakedAnimationStorage = new THREE.StorageBufferNode<"mat4">(
          this.bakedAnimationsBuffer,
          "mat4",
          this.bakedAnimationsBuffer.count,
        )
        const metaStorage = storage(this.metaBuffer, "vec4", this.metaBuffer.count)

        const animationIndex = agentData.y.toUint()

        const animationMeta = metaStorage.element(animationIndex)
        const animationOffset = uint(animationMeta.x)
        const frameCount = uint(animationMeta.y)
        const duration = float(animationMeta.z)

        const startTime = animationParams.x
        const loopMode = animationParams.y

        const elapsed = this.timeUniform.sub(startTime).max(0)
        const progress = loopMode.greaterThan(0.5)
          ? elapsed.div(duration).fract()
          : elapsed.div(duration).clamp(0, 1)

        const currentFrame = progress.mul(frameCount.toFloat()).toUint()
        const safeFrame = currentFrame.min(frameCount.sub(uint(1)))

        const skinIndex = attribute<"vec4">("skinIndex")
        const skinWeight = attribute<"vec4">("skinWeight")
        const skinMatrix = mat4(ZERO_MATRIX).toVar()

        const boneCount = this.boneCount
        function addInfluence(boneIndexNode: THREE.Node<"float">, weightNode: THREE.Node<"float">) {
          If(weightNode.greaterThan(0), () => {
            const address = animationOffset
              .add(safeFrame.mul(uint(boneCount)))
              .add(boneIndexNode.toUint())
            skinMatrix.addAssign(bakedAnimationStorage.element(address).mul(weightNode))
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

  public getCount() {
    return this.instanceCount
  }

  /** Per-instance waypoint, behavior mode, animation and alpha. */
  public getAgentStateBuffer(): AgentStateBuffer | null {
    return this.agentStateBuffer
  }

  /** CPU mirror of positions (vec4 stride), refreshed in place by syncFromGPU. */
  public getCPUPositions(): Float32Array | null {
    return this.cpuPositions
  }

  /** Writes a character's world position into `out`. Returns false if the index is unknown. */
  public getCPUPosition(index: number, out: THREE.Vector3): boolean {
    if (!this.cpuPositions || index < 0 || index >= this.instanceCount) return false
    const offset = index * 4
    out.set(this.cpuPositions[offset], this.cpuPositions[offset + 1], this.cpuPositions[offset + 2])
    return true
  }

  public setPhysicsMode(index: number, mode: AgentBehavior) {
    if (!this.agentStateBuffer || index < 0 || index >= this.instanceCount) return
    this.agentStateBuffer.setState(index, mode)
  }

  /**
   * Teleport an agent to an exact world position by writing directly to the CPU→GPU buffer.
   * The CPU mirror is updated too, so getCPUPosition() is accurate before the next readback.
   */
  public setPosition(index: number, position: THREE.Vector3): void {
    if (!this.positionAttribute || index < 0 || index >= this.instanceCount) return
    const positions = this.positionAttribute.array
    positions[index * 4 + 0] = position.x
    positions[index * 4 + 1] = position.y
    positions[index * 4 + 2] = position.z
    this.positionAttribute.needsUpdate = true
    this.positionWrites++
    if (this.cpuPositions) {
      this.cpuPositions[index * 4 + 0] = position.x
      this.cpuPositions[index * 4 + 1] = position.y
      this.cpuPositions[index * 4 + 2] = position.z
    }
  }

  /** Teleport an agent and zero their current velocity to avoid sliding. */
  public setPositionAndZeroVelocity(index: number, position: THREE.Vector3): void {
    this.setPosition(index, position)
    if (this.velocityAttribute && index >= 0 && index < this.instanceCount) {
      const velocities = this.velocityAttribute.array
      velocities[index * 4 + 0] = 0
      velocities[index * 4 + 1] = 0
      velocities[index * 4 + 2] = 0
      velocities[index * 4 + 3] = 0
      this.velocityAttribute.needsUpdate = true
    }
  }

  /** Force a specific facing direction when IDLE. */
  public setFacing(index: number, x: number, z: number) {
    if (!this.agentStateBuffer || index < 0 || index >= this.instanceCount) return
    this.agentStateBuffer.setFacing(index, x, z)
  }

  /** Force a specific orientation based on a quaternion. */
  public setOrientation(index: number, quaternion: THREE.Quaternion) {
    const forward = this.scratchForward.set(0, 0, 1).applyQuaternion(quaternion)
    this.setFacing(index, forward.x, forward.z)
  }

  public getAgentState(index: number): AgentBehavior {
    if (!this.agentStateBuffer || index < 0 || index >= this.instanceCount)
      return AgentBehavior.IDLE
    return this.agentStateBuffer.getState(index)
  }

  public setAnimation(index: number, name: AnimationName, loop: boolean = true) {
    if (this.agentStateBuffer && index >= 0 && index < this.instanceCount) {
      const animationMeta = this.animationsMeta[name]
      if (animationMeta) {
        this.agentStateBuffer.setAnimation(index, animationMeta.index, loop, this.currentTime)
      }
    }
  }

  /** Returns the baked clip duration in seconds. Returns 1.0 if the animation is not found. */
  public getAnimationDuration(name: AnimationName): number {
    return this.animationsMeta[name]?.duration ?? 1.0
  }

  public setExpression(index: number, name: ExpressionKey) {
    if (this.expressionBuffer) {
      this.expressionBuffer.setExpression(index, name)
    }
  }

  /** Mouth animation only; callers choose the talk/listen body animation. */
  public setSpeaking(index: number, isSpeaking: boolean) {
    if (this.expressionBuffer) {
      this.expressionBuffer.setSpeaking(index, isSpeaking)
    }
  }

  public dispose() {
    this.cleanupInstances()
    this.isLoaded = false
  }
}
