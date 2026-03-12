export function findLocalMidpoint(mesh, targetX, targetZ, radius = 1) {
  const pos = mesh.geometry.attributes.position;

  let v1 = null;
  let v2 = null;

  for (let i = 0; i < pos.count; i++) {

    const p = new THREE.Vector3(
      pos.getX(i),
      pos.getY(i),
      pos.getZ(i)
    ).applyMatrix4(mesh.matrixWorld);

    const dx = p.x - targetX;
    const dz = p.z - targetZ;

    if (dx * dx + dz * dz <= radius * radius) {

      if (!v1 || p.y > v1.y) {
        v2 = v1;
        v1 = p.clone();
      }
      else if (!v2 || p.y > v2.y) {
        v2 = p.clone();
      }

    }
  }

  if (!v1 || !v2) return null;

  return new THREE.Vector3()
    .addVectors(v1, v2)
    .multiplyScalar(0.5);
}

export function addHelpers(surface) {
  // global point, point2

  let geom = new THREE.SphereGeometry(0.01, 9, 9);
  let mat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const p1 = new THREE.Mesh(geom, mat);
  const p2 = new THREE.Mesh(geom, mat);
  const p3 = new THREE.Mesh(geom, mat);
  const p4 = new THREE.Mesh(geom, mat);
  const s1 = new THREE.Mesh(geom, mat);
  const s2 = new THREE.Mesh(geom, mat);

  p1.position.set(-10, 1, 10);
  p2.position.set(10, 1, 10);
  p3.position.set(-10, 1, -10);
  p4.position.set(10, 1, -10);

  const peak1 = findLocalMidpoint(surface, 0, -3.5, 1);
  const peak2 = findLocalMidpoint(surface, 0,  3.5, 1);

  if (peak1) s1.position.copy(peak1);
  if (peak2) s2.position.copy(peak2);

  s1.position.y += .01
  s2.position.y += .01

  // const point = new THREE.PointLight( 0x9db7ca, 1, 1000 );
  point.position.copy(peak1);
  point.castShadow = true
  scene.add( point );

  
  point2.position.copy(peak2)
  point2.castShadow = true
  scene.add( point2 );

  point.position.y += .3
  point2.position.y += .3

  // s1.position.set(0, getHeight(surface, 0, -3.5), -3.5);
  // s2.position.set(0, getHeight(surface, 0, 3.5), 3.5);

  scene.add(p1);
  scene.add(p2);
  scene.add(p3);
  scene.add(p4);
  scene.add(s1);
  scene.add(s2);

  return {s1, s2}
}

export function makeLineFromVector2(origin, dir, color = 0xff0000) {

  const d = dir.clone()
  // const d = dir.clone().normalize();

  const p1 = new THREE.Vector3(origin.x, origin.y, origin.z);
  const p2 = new THREE.Vector3(
    origin.x + d.x,
    origin.y,
    origin.z + d.y
  );

  const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const material = new THREE.LineBasicMaterial({ color });

  return new THREE.Line(geometry, material);
}

export function getRandomV0(k=2) {
    const theta = Math.random() * (Math.PI) - Math.PI/2
    let v0 = new THREE.Vector2(k * Math.cos(theta), k * Math.sin(theta))
    // console.log('theta = ' + theta)
    // console.log('v0.x = ' + v0.x)
    // console.log('v0.y = ' + v0.y)
    // console.log('v0.x^2 = ' + v0.x**2)
    // console.log('v0.y^2 = ' + v0.y**2)
    // console.log('magnitude v0 = ' + Math.sqrt(v0.x**2 + v0.y**2))

    return v0
}