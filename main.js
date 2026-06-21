import * as THREE from 'three';
import { JoltPhysics } from 'three/addons/physics/JoltPhysics.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const physics = await JoltPhysics();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a1a24, 0.05);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const controls = new PointerLockControls(camera, document.body);
controls.enableRotate = false;
document.addEventListener("click",() =>{
    controls.lock();
});

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style="position:absolute;top:0px;left:0px;";
document.body.appendChild(renderer.domElement);

renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 15), new THREE.MeshStandardMaterial({color: 0x1f1f1f, side: THREE.BackSide}));
scene.add(sky);

const ambient = new THREE.AmbientLight(0xffffff, 0.005);
scene.add(ambient);

const car = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0x6e6e6e}));
physics.addMesh(car, 1500, 0.2);
car.castShadow = true;
car.receiveShadow = true;
scene.add(car);

const headlight1 = new THREE.SpotLight(0xffffff, 50);
headlight1.position.set(-0.7, 0.2, 0.8); 
headlight1.angle = Math.PI / 3.5; 
headlight1.shadow.camera.near = 3;
headlight1.penumbra = 1;
headlight1.distance = 40;
headlight1.castShadow = true;
const headlight1target = new THREE.Object3D();
headlight1target.position.set(0.2, 0, -15);
car.add(headlight1target);
headlight1.target = headlight1target;

const headlight2 = new THREE.SpotLight(0xffffff, 50);
headlight2.position.set(0.7, 0.2, 0.8); 
headlight2.angle = Math.PI / 3.5; 
headlight2.shadow.camera.near = 3;
headlight2.penumbra = 1;
headlight2.distance = 40;
headlight2.castShadow = true;
const headlight2target = new THREE.Object3D();
headlight2target.position.set(-0.2, 0, -15);
car.add(headlight2target);
headlight2.target = headlight2target;

car.add(headlight1);
car.add(headlight2);

const ground = new THREE.Mesh(new THREE.BoxGeometry(500, 1, 500), new THREE.MeshStandardMaterial({color: 0x00ff00}));
ground.position.y=-2;
ground.receiveShadow = true;
physics.addMesh(ground, 0, 0.2);
scene.add(ground);

car.add(camera);
camera.position.set(0, 0.5, 0.5);

function animate(time) {
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);