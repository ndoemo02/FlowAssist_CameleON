// Geometria ekranu sceny (Three.js) współdzielona przez ScreenAnchor i responsywny kadr Front.

import * as THREE from 'three';

/**
 * Skupisko ekranu: meshe, których bryła przecina bryłę największego meshu.
 * Odsiewa obiekty z pasującą nazwą, które nie są ekranem (np. rekwizyt "Object003_photostudio" przed ekranem).
 */
export function screenCluster(meshes: THREE.Mesh[]): THREE.Mesh[] {
    if (meshes.length <= 1) return meshes;
    const boxes = meshes.map((m) => { m.updateWorldMatrix(true, false); return new THREE.Box3().setFromObject(m); });
    const diag = (b: THREE.Box3) => b.getSize(new THREE.Vector3()).length();
    let main = 0;
    boxes.forEach((b, i) => { if (diag(b) > diag(boxes[main])) main = i; });
    const zone = boxes[main].clone().expandByScalar(diag(boxes[main]) * 0.05);
    return meshes.filter((_, i) => zone.intersectsBox(boxes[i]));
}

/** Środek bryły skupiska ekranu w świecie (null, gdy brak meshy). */
export function screenCenter(meshes: THREE.Mesh[]): [number, number, number] | null {
    const cluster = screenCluster(meshes);
    if (cluster.length === 0) return null;
    const box = new THREE.Box3();
    cluster.forEach((m) => box.union(new THREE.Box3().setFromObject(m)));
    return box.getCenter(new THREE.Vector3()).toArray() as [number, number, number];
}
