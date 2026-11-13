/**
 * 성능: 움직이지 않는 메시 합치기. 그리기 호출은 메시 하나에 한 번이라, 기둥·난간·선체 부재처럼
 * 같은 재질의 작은 메시 수백 개가 그대로면 GPU 보다 호출 수에서 먼저 막힌다(2026-11-13 실측: 도크 화면 1,130번).
 * root 아래에서 재질과 그림자 설정이 같은 Mesh / LineSegments 를 하나로 합쳐 root 에 붙이고 원본은 뗀다.
 *
 * 쓰는 조건: 합친 뒤에는 개별 부재를 옮기거나 숨길 수 없다. root 자체를 옮기는 것은 괜찮다.
 * - recursive = false 면 root 의 직접 자식만(자식 그룹은 따로 움직이는 부품일 때).
 * - 재질이 배열인 메시, InstancedMesh, 꼭짓점 색을 쓰는 메시, 뒤집힌(음수 배율) 메시는 그대로 둔다.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Item = THREE.Mesh | THREE.LineSegments;

export function mergeStatic(root: THREE.Object3D, recursive = true) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, Item[]>();
  const m4 = new THREE.Matrix4();

  const consider = (o: THREE.Object3D) => {
    const isMesh = (o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh;
    const isLines = (o as THREE.LineSegments).isLineSegments;
    if (!isMesh && !isLines) return;
    const it = o as Item;
    if (Array.isArray(it.material) || !it.visible) return;
    if ((it.material as THREE.Material).vertexColors || it.geometry.morphAttributes.position) return;
    if (!recursive && it.children.some((c) => !(c as THREE.LineSegments).isLineSegments)) return;
    if (it.matrixWorld.determinant() < 0) return;
    const key = `${isMesh ? 'm' : 'l'}|${(it.material as THREE.Material).uuid}|${it.castShadow}|${it.receiveShadow}|${it.renderOrder}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(it);
  };
  if (recursive) root.traverse((o) => o !== root && consider(o));
  else
    for (const c of root.children) {
      consider(c);
      // 직접 자식 메시에 붙은 외곽선(LineSegments)은 같이 합친다
      for (const cc of c.children) if ((cc as THREE.LineSegments).isLineSegments) consider(cc);
    }

  let saved = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const isMesh = (list[0] as THREE.Mesh).isMesh;
    const geos = list.map((it) => {
      let g = it.geometry.index ? it.geometry.toNonIndexed() : it.geometry.clone();
      g.applyMatrix4(m4.multiplyMatrices(inv, it.matrixWorld));
      // 속성을 맞춘다(하나라도 다르면 합칠 수 없음)
      const keep = isMesh ? ['position', 'normal', 'uv'] : ['position'];
      for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
      if (isMesh && !g.attributes.normal) g.computeVertexNormals();
      if (isMesh && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      g = g as THREE.BufferGeometry;
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = list[0];
    const out = isMesh ? new THREE.Mesh(merged, first.material) : new THREE.LineSegments(merged, first.material);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    // 합쳐진 원본은 뗀다. 원본에 붙어 있던 다른 자식(합치지 못한 것)은 위치를 지킨 채 root 로 옮긴다
    for (const it of list) {
      for (const c of [...it.children]) if (!list.includes(c as Item) && ![...groups.values()].some((l) => l.length > 1 && l.includes(c as Item))) root.attach(c);
    }
    for (const it of list) it.removeFromParent();
    root.add(out);
    saved += list.length - 1;
  }
  return saved;
}
