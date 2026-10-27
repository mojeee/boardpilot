// A small builder for detailed models that stay cheap to draw: every box, cylinder or curve is
// added with its colour and a surface finish, and build() merges everything with the same finish
// into one mesh (colours go into the vertices). A part with a hundred pieces costs a handful of
// draw calls, the same as a few plain boxes.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Surface finishes, one shared material each. */
export type Finish = 'matte' | 'satin' | 'gloss' | 'metal' | 'brushed' | 'clear' | 'frosted';

const MATERIALS: Partial<Record<Finish, THREE.Material>> = {};

export function finishMaterial(f: Finish): THREE.Material {
  const hit = MATERIALS[f];
  if (hit) return hit;
  const base = { vertexColors: true } as const;
  const m =
    f === 'matte'
      ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.85, metalness: 0 })
      : f === 'satin'
        ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.5, metalness: 0.05 })
        : f === 'gloss'
          ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.22, metalness: 0.05 })
          : f === 'metal'
            ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.28, metalness: 0.9 })
            : f === 'brushed'
              ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.42, metalness: 0.75 })
              : f === 'clear'
                ? new THREE.MeshStandardMaterial({ ...base, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false })
                : new THREE.MeshStandardMaterial({ ...base, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.88 });
  MATERIALS[f] = m;
  return m;
}

type V3 = [number, number, number];

export interface KitMeshData {
  finish: Finish;
  geometry: THREE.BufferGeometry;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

export class Kit {
  private parts = new Map<Finish, THREE.BufferGeometry[]>();
  /** Offset added to every piece (build a sub-assembly in its own frame). */
  private origin: THREE.Matrix4 | null = null;

  /** Add a geometry (consumed: do not reuse it) at a position, rotation (radians, XYZ) and scale. */
  add(finish: Finish, color: string, geo: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot?: V3, scale?: V3): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    tmpEuler.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    tmpMatrix.compose(new THREE.Vector3(...pos), tmpQuat.setFromEuler(tmpEuler), new THREE.Vector3(...(scale ?? [1, 1, 1])));
    if (this.origin) tmpMatrix.premultiply(this.origin);
    g.applyMatrix4(tmpMatrix);
    tmpColor.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpColor.r;
      col[i * 3 + 1] = tmpColor.g;
      col[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const list = this.parts.get(finish) ?? [];
    list.push(g);
    this.parts.set(finish, list);
    return this;
  }

  /** Run `fn` with every piece moved by `pos` and turned by `rotY` (a sub-assembly). */
  at(pos: V3, rotY: number, fn: () => void): this {
    const prev = this.origin;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
    this.origin = prev ? prev.clone().multiply(m) : m;
    try {
      fn();
    } finally {
      this.origin = prev;
    }
    return this;
  }

  /** A box by size [x, y, z] whose centre is at pos. */
  box(finish: Finish, color: string, size: V3, pos: V3, rot?: V3): this {
    return this.add(finish, color, new THREE.BoxGeometry(...size), pos, rot);
  }

  /** A box standing on y = bottom (pos is the centre of its footprint). */
  block(finish: Finish, color: string, size: V3, x: number, bottom: number, z: number, radius = 0): this {
    const geo = radius > 0 ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, size[0] / 2, size[1] / 2, size[2] / 2)) : new THREE.BoxGeometry(...size);
    return this.add(finish, color, geo, [x, bottom + size[1] / 2, z]);
  }

  /** A vertical cylinder standing on y = bottom. */
  cyl(finish: Finish, color: string, r: number, h: number, x: number, bottom: number, z: number, seg = 20, rTop = r): this {
    return this.add(finish, color, new THREE.CylinderGeometry(rTop, r, h, seg), [x, bottom + h / 2, z]);
  }

  /** A cylinder lying along x (rot 'x') or z, centred at pos. */
  rod(finish: Finish, color: string, r: number, len: number, pos: V3, along: 'x' | 'z', seg = 12): this {
    return this.add(finish, color, new THREE.CylinderGeometry(r, r, len, seg), pos, along === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  }

  /** A flat shape (x/z plane) extruded upward from y = bottom by h. */
  slab(finish: Finish, color: string, shape: THREE.Shape, h: number, bottom: number, curveSegments = 12): this {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments });
    // shape drawn in x/y with y = -z; extruded along +z: rotate so it points up
    geo.rotateX(-Math.PI / 2);
    return this.add(finish, color, geo, [0, bottom, 0]);
  }

  /** A surface of revolution around the vertical axis from (radius, y) points. */
  lathe(finish: Finish, color: string, points: [number, number][], pos: V3, seg = 24, bothSides = false): this {
    this.add(finish, color, new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg), pos);
    // the inside of an open cup or cone: the same surface facing the other way
    if (bothSides) this.add(finish, color, new THREE.LatheGeometry([...points].reverse().map(([r, y]) => new THREE.Vector2(r, y)), seg), pos);
    return this;
  }

  get empty(): boolean {
    return this.parts.size === 0;
  }

  /** One merged geometry per finish. The kit is spent afterwards. */
  build(): KitMeshData[] {
    const out: KitMeshData[] = [];
    for (const [finish, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (merged) {
        merged.computeBoundingSphere();
        out.push({ finish, geometry: merged });
      }
    }
    this.parts.clear();
    return out;
  }
}

/** A rectangle with rounded corners in the x/y plane (for Kit.slab), centred at (cx, -cz). */
export function roundedRect(w: number, d: number, r: number, cx = 0, cz = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = -cz - d / 2;
  const y1 = -cz + d / 2;
  const rr = Math.max(0.001, Math.min(r, w / 2, d / 2));
  s.moveTo(x0 + rr, y0);
  s.lineTo(x1 - rr, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + rr);
  s.lineTo(x1, y1 - rr);
  s.quadraticCurveTo(x1, y1, x1 - rr, y1);
  s.lineTo(x0 + rr, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - rr);
  s.lineTo(x0, y0 + rr);
  s.quadraticCurveTo(x0, y0, x0 + rr, y0);
  return s;
}

/** Add a round hole (x, z) to a shape made by roundedRect. */
export function addHole(s: THREE.Shape, x: number, z: number, r: number): void {
  const h = new THREE.Path();
  h.absarc(x, -z, r, 0, Math.PI * 2, true);
  s.holes.push(h);
}

export function disposeKit(data: KitMeshData[]): void {
  data.forEach((d) => d.geometry.dispose());
}
