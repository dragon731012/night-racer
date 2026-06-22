import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

await RAPIER.init();
const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

let meshes=[];
// AI assisted with the physics manager except the mesh updater
const PhysicsManager = {
    addBox: (mesh, mass, friction = 0.5) => {
        mesh.updateMatrixWorld(true);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        mesh.getWorldPosition(position);
        mesh.getWorldQuaternion(quaternion);

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setRotation(quaternion);
        const body = world.createRigidBody(bodyDesc);

        mesh.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        mesh.geometry.boundingBox.getSize(size);
        const scale = new THREE.Vector3();
        mesh.getWorldScale(scale);
        size.multiply(scale);

        const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
            .setFriction(friction)
            .setDensity(mass);
        
        world.createCollider(colliderDesc, body);
        mesh.userData.physicsBody = body;
        meshes.push(mesh);
        return body;
    },
    applyRelativeImpulse: (body, localImpulse) => {
        const r = body.rotation();
        const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        const worldImpulse = new THREE.Vector3(localImpulse.x, localImpulse.y, localImpulse.z);
        worldImpulse.applyQuaternion(quat);
        body.applyImpulse(worldImpulse, true);
    },
    getRelativeLinvel: (body) => {
        const wVel = body.linvel();
        const r = body.rotation();
        const quat = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
        const localVel = new THREE.Vector3(wVel.x, wVel.y, wVel.z).applyQuaternion(quat);
        return localVel;
    },
    addTrimesh: (mesh, mass, friction = 0.5) => {
        mesh.updateMatrixWorld(true);
        
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);

        const vertices = geometry.attributes.position.array;
        let indices = geometry.index?.array;

        if (!indices) {
            indices = new Uint32Array(vertices.length / 3);
            for (let i = 0; i < indices.length; i++) indices[i] = i;
        } else if (!(indices instanceof Uint32Array)) {
            indices = new Uint32Array(indices);
        }

        const bodyDesc = RAPIER.RigidBodyDesc.fixed();
        const body = world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
            .setFriction(friction)
            .setDensity(mass);
        
        world.createCollider(colliderDesc, body);
        return body;
    },
    updateMeshes: () => {
        for (let mesh of meshes) {
            if (mesh.userData){
                mesh.position.copy(mesh.userData.physicsBody.translation());
                mesh.quaternion.copy(mesh.userData.physicsBody.rotation());
            }
        }
    }
};

const loader = new GLTFLoader();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.05);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const controls = new PointerLockControls(camera, document.body);
controls.enableRotate = false;
document.addEventListener("click",() =>{
    controls.lock();
});

let keys=[];
document.addEventListener("keydown",(e)=>{
    keys[e.key.toLowerCase()]=true;
});
document.addEventListener("keyup",(e)=>{
    keys[e.key.toLowerCase()]=false;
});

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style = "position:absolute; top:0px; left:0px; width:100%; height:100%;";
document.body.appendChild(renderer.domElement);

renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 15), new THREE.MeshStandardMaterial({color: 0x1f1f1f, side: THREE.BackSide}));
scene.add(sky);

const ambient = new THREE.AmbientLight(0xffffff, 0.005);
scene.add(ambient);

const car = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0x6e6e6e}));
car.position.set(0, 0, 5);
let carbody = PhysicsManager.addBox(car, 1500, 0.99);
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

loader.load('assets/dirt.glb', (gltf) => {
    const model = gltf.scene;
    model.rotation.y=Math.PI*3;
    scene.add(model);
    model.updateMatrixWorld(true);

    model.traverse((child) => {
        if (child.isMesh) {
            PhysicsManager.addTrimesh(child,0,0.99);
        }
    });
});

car.add(camera);
camera.position.set(0, -0.05, 0.5);

function animate(time) {
    let carpos = carbody.translation();
    let rayorigin = { x: carpos.x, y: carpos.y - 0.6, z: carpos.z };
    let raydirection = { x: 0, y: -1, z: 0 };
    let ray = new RAPIER.Ray(rayorigin, raydirection);
    let hit = world.castRay(ray, 2.0, true);
    let wantedy=0.5;
    if (hit) {
        if (hit.timeOfImpact<.3) {
            let compression = wantedy - hit.timeOfImpact - 0.2;
            if (compression>0) {
                let susimp = (compression*8000)-(carbody.linvel().y*300);
                carbody.applyImpulse({ x: 0, y: susimp, z: 0 }, true);
                //PhysicsManager.applyRelativeImpulse(carbody, {x: 0, y: susimp, z: 0});
            }
        
            let localvelocity = PhysicsManager.getRelativeLinvel(carbody);

            let mass = 1500;
            let sideimp = -localvelocity.x * mass * 0.15;
            
            let maxspeed = 40;
            let acceleration = 3;
            let targetforwardimp = (maxspeed - Math.abs(localvelocity.z)) * acceleration;
            let forwardimp = 0;

            if (keys["w"]) forwardimp = targetforwardimp;
            if (keys["s"]) forwardimp = -targetforwardimp * 0.5;

            PhysicsManager.applyRelativeImpulse(carbody, {x: sideimp, y: 0, z: -forwardimp});

            let turn = 0;
            if (keys["a"]) turn = -1;
            if (keys["d"]) turn = 1;
            if (forwardimp<0) turn = turn * -1;
            let currentspeed = Math.abs(localvelocity.z);
            let turnimp = Math.min(1.0, currentspeed / 30)*turn*150;
            carbody.applyTorqueImpulse({ x: 0, y: -turnimp, z: 0}, true);
            carbody.setAngvel({ x: carbody.angvel().x, y: carbody.angvel().y * 0.95, z: carbody.angvel().z }, true);
        }
    }

    world.step();
    PhysicsManager.updateMeshes();
    camera.rotation.set(0, 0, 0);
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);