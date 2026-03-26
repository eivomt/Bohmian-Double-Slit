import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// -----------------------------
// Scene setup
// -----------------------------
export function setUpScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9efef);
  // scene.background = new THREE.Color(0x88ABBE);

  const camera = new THREE.PerspectiveCamera();
  // const camera = new THREE.PerspectiveCamera();
  camera.near = 0.1
  camera.position.set(1135, 0, -1077);
  camera.rotation.set(-3,0.8,3.1)
  camera.zoom = .0095
  scene.add( camera );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(100, 0, 0);

  // const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  // scene.add(ambient);

  const dir1 = new THREE.DirectionalLight(0xe9efef, 2.15);
  dir1.position.set(1, 3, 2);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xe9efef, 4.75);
  dir2.position.set(-2, 2, -1);
  scene.add(dir2);

  // const dir3 = new THREE.DirectionalLight(0xffffff, .75);
  // dir3.position.set(1, 0, 0);
  // scene.add(dir3);

  const point = new THREE.PointLight( 0xffffff, 1, 1000 );
  const point2 = new THREE.PointLight( 0xffffff, 1, 1000 );

  return {scene, camera, renderer, controls, dir1, dir2, point, point2}
}