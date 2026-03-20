import * as THREE from "three";
import { getRandomV0 } from "./geometryHelpers.js";


export function initParticle(center, scene) {
  const position = center.position.clone()
  const geom = new THREE.SphereGeometry(0.05, 9, 9);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  const particle = new THREE.Mesh(geom, mat);
  particle.position.set(position.x, position.y, position.z)

  scene.add(particle)

  return particle
}

// function getHeight(mesh, x, z, raycaster) {
//   raycaster.set(
//     new THREE.Vector3(x, 10, z),
//     new THREE.Vector3(0, -1, 0)
//   );

//   const hits = raycaster.intersectObject(mesh);

//   if (hits.length === 0) return null;

//   return hits[0].point.y;
// }

export function getHeight(mesh, x, z) {
  const { x1d, y1d, Q } = mesh;

  const nx = x1d.length;
  const ny = y1d.length;

  if (nx < 2 || ny < 2) return null;

  if (x < x1d[0] || x > x1d[nx - 1] || z < y1d[0] || z > y1d[ny - 1]) {
    return null;
  }

  let i = 0;
  while (i + 1 < nx && x1d[i + 1] < x) i++;

  let j = 0;
  while (j + 1 < ny && y1d[j + 1] < z) j++;

  if (i >= nx - 1) i = nx - 2;
  if (j >= ny - 1) j = ny - 2;

  const x0 = x1d[i];
  const x1 = x1d[i + 1];
  const z0 = y1d[j];
  const z1 = y1d[j + 1];

  const tx = (x - x0) / (x1 - x0 || 1);
  const tz = (z - z0) / (z1 - z0 || 1);

  const q00 = Q[j][i];
  const q10 = Q[j][i + 1];
  const q01 = Q[j + 1][i];
  const q11 = Q[j + 1][i + 1];

  if ([q00, q10, q01, q11].some(v => !Number.isFinite(v))) {
    return null;
  }

  const q0 = q00 * (1 - tx) + q10 * tx;
  const q1 = q01 * (1 - tx) + q11 * tx;

  return q0 * (1 - tz) + q1 * tz;
}




function getForce(field, x, z) {
  const { x1d, y1d, Fx, Fy } = field;

  const nx = x1d.length;
  const ny = y1d.length;

  if (x < x1d[0] || x > x1d[nx - 1] || z < y1d[0] || z > y1d[ny - 1]) {
    return null;
  }

  let i = 0;
  while (i + 1 < nx && x1d[i + 1] < x) i++;

  let j = 0;
  while (j + 1 < ny && y1d[j + 1] < z) j++;

  if (i >= nx - 1) i = nx - 2;
  if (j >= ny - 1) j = ny - 2;

  const x0 = x1d[i];
  const x1 = x1d[i + 1];
  const z0 = y1d[j];
  const z1 = y1d[j + 1];

  const tx = (x - x0) / (x1 - x0 || 1);
  const tz = (z - z0) / (z1 - z0 || 1);

  const fx00 = Fx[j][i];
  const fx10 = Fx[j][i + 1];
  const fx01 = Fx[j + 1][i];
  const fx11 = Fx[j + 1][i + 1];

  const fy00 = Fy[j][i];
  const fy10 = Fy[j][i + 1];
  const fy01 = Fy[j + 1][i];
  const fy11 = Fy[j + 1][i + 1];

  if ([fx00, fx10, fx01, fx11, fy00, fy10, fy01, fy11].some(v => Number.isNaN(v))) {
    return null;
  }

  const fx0 = fx00 * (1 - tx) + fx10 * tx;
  const fx1 = fx01 * (1 - tx) + fx11 * tx;
  const fy0 = fy00 * (1 - tx) + fy10 * tx;
  const fy1 = fy01 * (1 - tx) + fy11 * tx;

  const fx = fx0 * (1 - tz) + fx1 * tz;
  const fy = fy0 * (1 - tz) + fy1 * tz;

  return new THREE.Vector2(fx * -1, fy * -1);
}

export function updatePosition(v, particle, dt, hover, mesh, forceField, raycaster) {
  const x = particle.position.x + v.x * dt;
  const z = particle.position.z + v.y * dt;

  const ySurface = getHeight(mesh, x, z, raycaster);
  if (ySurface == null) return v;

  particle.position.set(x, ySurface + hover, z);

  const grad = getForce(forceField, x, z);
  if (grad) {
    v.addScaledVector(grad, dt);
  }

  return v;
}



export function initTrajectories(waveCenter, mesh, forceField, dt, N=100) {
  // const N = 100 // number of particles

  let outOfBounds, position, trajectory, velocity, j
  const trajectories = []
  

  for(let i = 0; i<N; i++) {
    outOfBounds = false
    velocity = getRandomV0(5)
    position = waveCenter.position.clone()
    trajectory = []
    j=0
  

    while(!outOfBounds) {


      if(j==100) {
        trajectory.push(position.clone())
        j=0
      }
      j++

      position.x += velocity.x * dt
      position.z += velocity.y * dt

      if(Math.abs(position.x) > 10 || Math.abs(position.z) > 10) {
        outOfBounds = true
        break
      }

      
      // if(j>200) {
      //   outOfBounds = true
      //   break
      // }
  
      // console.log(mesh)
      position.y = getHeight(mesh, position.x, position.z) + 0.1
      const grad = getForce(forceField, position.x, position.z);
      if (grad) {
        velocity.addScaledVector(grad, dt);
      }
      // velocity.add(getForce(forceField, position.x, position.z))
    }

    trajectories.push(trajectory)
  }


  return trajectories
}
