import * as THREE from 'three';
import { JoltPhysics } from 'three/addons/physics/JoltPhysics.js';

const physics = await JoltPhysics();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style="position:absolute;top:0px;left:0px;";
document.body.appendChild(renderer.domElement);

const car = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color: 0x6e6e6e}));
physics.addMesh(car, 1500, 0.2);
scene.add(car);

const ground = new THREE.Mesh(new THREE.BoxGeometry(500, 1, 500), new THREE.MeshBasicMaterial({color: 0x00ff00}));
ground.position.y=-2;
physics.addMesh(ground, 0, 0.2);
scene.add(ground);

camera.position.z = 5;

function animate(time) {
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);