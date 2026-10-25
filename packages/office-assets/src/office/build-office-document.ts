import { Document, type Node } from "@gltf-transform/core"
import { KHRLightsPunctual, Light } from "@gltf-transform/extensions"
import { agentStateCapacity } from "./agent-state-capacity.ts"
import { addAmbientClip } from "./ambient-clip.ts"
import { bakeAmbientOcclusion } from "./ambient-occlusion.ts"
import { approachPoint } from "./approach-points.ts"
import { buildArchitecture } from "./architecture.ts"
import { isScreenMaterial } from "./draw-call-buckets.ts"
import { mergeDrawCalls } from "./draw-call-merge.ts"
import { FrameBuilder } from "./frame-builder.ts"
import { buildItem } from "./items/build-item.ts"
import { addNavMesh, navExtras } from "./nav-mesh.ts"
import type { OfficeBuildContext } from "./office-build-context.ts"
import { OfficeGeometry } from "./office-geometry.ts"
import { createMaterialFactory } from "./office-gltf-materials.ts"
import type { OfficeLayout } from "./office-layout-schema.ts"
import { statusTextureWidth } from "./office-materials.ts"
import { addOverflowStandSpots } from "./overflow-stand-spots.ts"
import { buildPaletteTextures, buildStatusTexture } from "./palette-textures.ts"
import { officeSceneExtras } from "./scene-extras.ts"
import { packScreenAtlas } from "./screen-atlas.ts"
import { createSeededRandom } from "./seeded-random.ts"
import { type Vector2, type Vector3, yawQuaternion } from "./vector-math.ts"
import { weldVertices } from "./vertex-weld.ts"
import { buildWalkGrid, markReachableFromSpawn } from "./walk-grid.ts"
import { writeWalkGridImage } from "./walk-grid-image.ts"
import { checkZFighting, type ZFightingMode } from "./z-fighting-check.ts"

/** How to build the office. */
export interface OfficeBuildOptions {
  layout: OfficeLayout
  /** Where the procedural textures were written (`build-office-textures`). */
  texturesDirectory: string
  /** Size-based tessellation of small round parts; false (`LOD=0`) keeps the authored counts. */
  tessellateBySize: boolean
  /** Report triangles per item type before culling (`TRIS=1`). */
  reportTriangles: boolean
  zFighting: ZFightingMode
  /** Writes the walk grid as a PNG here when set (`NAV_PNG`), before reachability is enforced. */
  walkGridImagePath?: string
  /** Receives the progress lines (triangle report, AO timing). */
  log: (line: string) => void
}

/** The built office and what the build log reports about it. */
export interface OfficeBuildResult {
  document: Document
  capacity: Record<string, number>
  drawCalls: number
  paletteMaterials: number
  screens: number
  meshStats: Record<string, string>
  poiKinds: Record<string, number>
}

/** The office generator's name in the GLB's asset block. */
const GENERATOR = "agent office generator (gltf-transform)"

/**
 * Builds the agent office from its layout into a glTF document: architecture and items, spawns and
 * idle areas, the walk grid and reachability, approach points, overflow standing spots, the
 * agent-state capacity check, the navMesh, the z-fighting check, draw-call merging (palette and
 * screen atlas), baked AO, then meshes, the Ambient clip, POI nodes, night lights and scene extras.
 * Every step's order is part of the byte-identical output.
 */
export async function buildOfficeDocument(options: OfficeBuildOptions): Promise<OfficeBuildResult> {
  const { layout } = options
  const context: OfficeBuildContext = {
    layout,
    geometry: new OfficeGeometry(),
    tessellateBySize: options.tessellateBySize,
    random: createSeededRandom(11),
    obstacles: [],
    pointsOfInterest: [],
    animationPivots: new Map(),
    slidingRows: [],
    armSwings: [],
    shuttleSlides: [],
    sequenceCounters: new Map(),
    agentBoard: null,
  }
  buildArchitecture(context)

  const trianglesByItemType = new Map<string, number>()
  for (const item of layout.items) {
    const builder = new FrameBuilder(
      context,
      `static-${item.zone}`,
      item.pos[0],
      item.pos[1],
      item.rot || 0,
    )
    const trianglesBefore = context.geometry.triangleCount
    buildItem(builder, item)
    const key = item.type + (item.type === "big_plant" ? `:${item.kind}` : "")
    trianglesByItemType.set(
      key,
      (trianglesByItemType.get(key) || 0) + context.geometry.triangleCount - trianglesBefore,
    )
  }
  if (options.reportTriangles) {
    const report = [...trianglesByItemType]
      .sort((a, b) => b[1] - a[1])
      .map(([type, triangles]) => `${type} ${triangles}`)
      .join(", ")
    options.log(
      `tris by item type (before culling): ${report} | all pushed so far ${context.geometry.triangleCount}`,
    )
  }
  layout.spawns.forEach((spawn, index) => {
    context.pointsOfInterest.push({
      name: `poi-idle-spawn-${index + 1}`,
      position: [spawn[0], 0, spawn[1]],
      rotation: layout.spawnRot,
    })
  })
  for (const [name, area] of Object.entries(layout.areas)) {
    context.pointsOfInterest.push({
      name: `poi-idle-area-${name}`,
      position: [area[0], 0, area[1]],
      rotation: 0,
    })
  }

  const grid = buildWalkGrid(layout, context.obstacles)
  markReachableFromSpawn(grid, context.pointsOfInterest)
  if (options.walkGridImagePath !== undefined) {
    await writeWalkGridImage(grid, context.pointsOfInterest, options.walkGridImagePath)
  }
  const approachPoints = new Map<string, Vector2>()
  for (const point of context.pointsOfInterest) {
    approachPoints.set(point.name, approachPoint(grid, point))
  }
  addOverflowStandSpots(context, grid, approachPoints)
  const capacity = agentStateCapacity(context)
  addNavMesh(context.geometry, grid)
  const nav = navExtras(grid)

  const {
    x: [minX, maxX],
    z: [minZ, maxZ],
  } = layout.room
  checkZFighting(context.geometry.nodes, { minX, maxX, minZ, maxZ }, options.zFighting)

  const materialsInUse = new Set<string>()
  for (const materials of context.geometry.nodes.values()) {
    for (const material of materials.keys()) materialsInUse.add(material)
  }
  const statusWidth = statusTextureWidth(layout.agents.max)
  const palette = await buildPaletteTextures(materialsInUse)
  const statusPng = await buildStatusTexture(statusWidth)
  const screenMaterials = [...materialsInUse].filter(isScreenMaterial).sort()
  const atlas = await packScreenAtlas(screenMaterials, options.texturesDirectory)
  const nodes = mergeDrawCalls(context.geometry.nodes, {
    statusTextureWidth: statusWidth,
    paletteUvs: palette.uvs,
    screenAtlasRects: atlas.rects,
  })

  const aoStart = Date.now()
  const ao = bakeAmbientOcclusion(nodes)
  options.log(
    `AO: ${ao.vertices} vertices x ${ao.rays} rays against ${ao.triangles} triangles in ${((Date.now() - aoStart) / 1000).toFixed(1)} s`,
  )

  const document = new Document()
  const buffer = document.createBuffer()
  const createAccessor = (
    type: "SCALAR" | "VEC2" | "VEC3" | "VEC4",
    array: Float32Array | Uint16Array | Uint32Array,
  ) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  const scene = document.createScene("Scene")
  document.getRoot().setDefaultScene(scene)
  const material = createMaterialFactory(
    document,
    {
      paletteColor: palette.color,
      paletteMetallicRoughness: palette.metallicRoughness,
      paletteEmissive: palette.emissive,
      statusColors: statusPng,
      screenAtlas: atlas.png,
    },
    options.texturesDirectory,
  )
  const meshStats: Record<string, string> = {}
  const nodesByName = new Map<string, Node>()
  for (const [name, buckets] of nodes) {
    const mesh = document.createMesh(name)
    let vertexTotal = 0
    let triangleTotal = 0
    const pivot: Vector3 = context.animationPivots.get(name) || [0, 0, 0]
    for (const [bucket, unwelded] of buckets) {
      const geometry = weldVertices(unwelded)
      const vertexCount = geometry.positions.length / 3
      const positions = new Float32Array(geometry.positions).map(
        (value, index) => value - pivot[index % 3],
      )
      const primitive = document
        .createPrimitive()
        .setMaterial(material(bucket))
        .setAttribute("POSITION", createAccessor("VEC3", positions))
        .setAttribute("NORMAL", createAccessor("VEC3", new Float32Array(geometry.normals)))
        .setAttribute("TEXCOORD_0", createAccessor("VEC2", new Float32Array(geometry.uvs)))
        .setIndices(
          createAccessor(
            "SCALAR",
            vertexCount < 65535
              ? new Uint16Array(geometry.indices)
              : new Uint32Array(geometry.indices),
          ),
        )
      if (geometry.colors)
        primitive.setAttribute("COLOR_0", createAccessor("VEC3", geometry.colors))
      mesh.addPrimitive(primitive)
      vertexTotal += vertexCount
      triangleTotal += geometry.indices.length / 3
    }
    const node = document.createNode(name).setMesh(mesh).setTranslation(pivot)
    nodesByName.set(name, node)
    scene.addChild(node)
    meshStats[name] = `${vertexTotal}v/${triangleTotal}t`
  }
  addAmbientClip(document, context, nodesByName, createAccessor)
  for (const point of context.pointsOfInterest) {
    scene.addChild(
      document
        .createNode(point.name)
        .setTranslation(point.position)
        .setRotation(yawQuaternion(point.rotation)),
    )
  }
  const lights = document.createExtension(KHRLightsPunctual)
  for (const nightLight of layout.nightLights) {
    const light = lights
      .createLight(nightLight.name)
      .setType(Light.Type.POINT)
      .setColor(nightLight.color)
      .setIntensity(nightLight.intensity)
      .setRange(nightLight.range)
    scene.addChild(
      document
        .createNode(`night-light-${nightLight.name}`)
        .setTranslation(nightLight.pos)
        .setExtension("KHR_lights_punctual", light),
    )
  }
  scene.setExtras(
    officeSceneExtras({
      layout,
      statusTextureWidth: statusWidth,
      nav,
      approachPoints,
      screenAtlasRects: atlas.rects,
      agentBoard: context.agentBoard,
      paletteNames: palette.names,
      paletteUvs: palette.uvs,
    }),
  )
  document.getRoot().getAsset().generator = GENERATOR

  const poiKinds: Record<string, number> = {}
  for (const point of context.pointsOfInterest) {
    const kind = point.name.replace(/-\d+$/, "")
    poiKinds[kind] = (poiKinds[kind] || 0) + 1
  }
  let drawCalls = 0
  for (const buckets of nodes.values()) drawCalls += buckets.size
  return {
    document,
    capacity,
    drawCalls,
    paletteMaterials: palette.names.length,
    screens: screenMaterials.length,
    meshStats,
    poiKinds,
  }
}
