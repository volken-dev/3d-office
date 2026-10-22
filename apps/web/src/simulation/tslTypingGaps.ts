/**
 * Fills gaps in @types/three 0.183's TSL method typings for operations the three.js runtime and
 * WGSL support, so the character shaders type-check without casts. Each entry declares a method
 * chain that three registers at runtime but the typings omit for that operand type.
 */
import type Node from "three/src/nodes/core/Node.js"
import type { MatType } from "three/src/nodes/core/Node.js"

declare module "three/src/nodes/core/Node.js" {
  interface UintExtensions {
    /** `min()` is typed for float vectors only; WGSL `min` also takes u32. */
    min: (other: Node<"uint">) => Node<"uint">
  }

  interface FloatExtensions {
    /** TSL logical operators convert float operands to bool; the typings only allow bool. */
    and: (other: Node<"bool">) => Node<"bool">
  }

  interface MatExtensions<TMat extends MatType> {
    /** WGSL supports matrix-by-scalar multiplication; the typings only cover matrix and vector operands. */
    mul: (scale: Node<"float">) => Node<TMat>
    /** Mat4Extensions types `addAssign` with a mat3 operand (a typo); the runtime takes the same matrix type. */
    addAssign: (other: Node<TMat>) => Node<TMat>
  }
}
