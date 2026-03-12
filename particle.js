
export function initParticle(center) {
  const position = center.position.clone()
  const geom = new THREE.SphereGeometry(0.05, 9, 9);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  const particle = new THREE.Mesh(geom, mat);
  particle.position.set(position.x, position.y, position.z)

  scene.add(particle)

  return particle
}

export function updatePosition(v, particle, dt, hover, mesh) {
  const x = particle.position.x + v.x * dt;
  const z = particle.position.z + v.y * dt;

  const ySurface = getHeight(mesh, x, z);
  if (ySurface == null) return v;

  particle.position.set(x, ySurface + hover, z);

  const grad = getGradient(mesh, x, z);
  if (grad) {
    v.addScaledVector(grad, dt);
  }

  return v;
}