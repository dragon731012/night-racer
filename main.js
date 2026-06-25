import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

await RAPIER.init();
const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

const susheight = 1.0;
const susstrength = 8000;
const susslower = 1000;
const stiff = 6000;
const grip = 4;
const turnspeed = 0.03;

let colliders = new Map();
let chunkcounter = 0;
let chunkindex = 0;

const maps = {
    "straight": {
        file: "assets/road_straight.glb",
        included: ["ALL"],
        scale: 2,
        enteroffset: new THREE.Vector3(0, 0, 0),
        exitoffset: new THREE.Vector3(0.68, 7, -89),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(-15,13,0)
    },
    "turns": {
        file: "assets/road_turns.glb",
        included: ["Object_2","Object_3","Object_4"],
        scale: 2,
        enteroffset: new THREE.Vector3(29.2, -11.4, 5),
        exitoffset: new THREE.Vector3(1.15, 8, -87),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(15, 2, 5)
    }
};

let currentmapexitpos = new THREE.Vector3(0, 0, 0);
let loaded = [];

let currentsteer = 0;

let meshes=[];
// AI assisted with the physics manager except the mesh updater
const PhysicsManager = {
    addBox: (mesh, mass, friction = 0.5) => {
        mesh.updateMatrixWorld(true);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        mesh.getWorldPosition(position);
        mesh.getWorldQuaternion(quaternion);

        const bodyDesc = mass === 0 
            ? RAPIER.RigidBodyDesc.fixed() 
            : RAPIER.RigidBodyDesc.dynamic();
            
        bodyDesc.setTranslation(position.x, position.y, position.z)
            .setRotation(quaternion);
        const body = world.createRigidBody(bodyDesc);

        mesh.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        mesh.geometry.boundingBox.getSize(size);
        const scale = new THREE.Vector3();
        mesh.getWorldScale(scale);
        size.multiply(scale);

        const volume = size.x * size.y * size.z;
        const density = mass > 0 ? (mass / volume) : 0;

        const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
            .setFriction(friction);
            
        if (mass > 0) {
            colliderDesc.setDensity(density);
        }
        
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
        
        return world.createCollider(colliderDesc, body);
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
//scene.fog = new THREE.FogExp2(0x000000, 0.05);
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

// AI slightly assisted with this preloading for loop to reduce lag from my original code
let assets = {};
for (const [key, data] of Object.entries(maps)) {
    assets[key] = await new Promise(res => {
        loader.load(data.file, gltf => {
            gltf.scene.scale.set(data.scale, data.scale, data.scale);
            res(gltf.scene);
        });
    });
}

const car = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 2), new THREE.MeshStandardMaterial({color: 0x6e6e6e}));

function loadMap(type, spawn = false) {
    let model = assets[type].clone();
    let pos = currentmapexitpos.clone().sub(maps[type].enteroffset);
    model.position.copy(pos);
    scene.add(model);
    model.updateMatrixWorld(true);

    // didnt know how to get children so i asked ai :( thats it tho for this part
    model.traverse((child) => {
        if (child.isMesh && maps[type].included.some(item => child.name.toLowerCase().includes(item.toLowerCase())) || maps[type].included[0] == "ALL") {
            try {
                let collider = PhysicsManager.addTrimesh(child,0,0.99);
                colliders.set(collider.handle, chunkcounter);
            } catch (e) {}
        } else {
            //console.log(child.name);
        }
    });

    if (spawn) {
        let spawnpos = pos.clone().add(maps[type].spawn);
        car.position.copy(spawnpos);
    }

    loaded.push(model);
    currentmapexitpos.copy(pos).add(maps[type].exitoffset);
}


loadMap("turns", true);
loadMap("straight");
loadMap("straight");
loadMap("turns");
loadMap("straight");

function handleNextChunk(start = false) {
    let keys = Object.keys(maps);
    let randomkey = keys[Math.floor(Math.random() * keys.length)];
    loadMap(randomkey, start);
    chunkcounter++;
}
handleNextChunk(true);
handleNextChunk();

//car.geometry.translate(0, -0.5, 0); 
//car.position.set(1, 0, 5);
let carbody = PhysicsManager.addBox(car, 800, 0.99);
carbody.setLinearDamping(0.1);
carbody.setAngularDamping(0.5);
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

car.add(camera);
camera.position.set(0, -0.05, 0.5);

function animate(time) {
    carbody.resetForces(true);

    const rot = carbody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const worldup = new THREE.Vector3(0, 1, 0);
    const worlddown = new THREE.Vector3(0, -1, 0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

    const wheelxoffset = 1;
    const wheelzoffset = 1.5;
    let onground = false;
    let usesus = (up.dot(worldup) > 0.5);

    let carvel = carbody.linvel();
    let speed = Math.sqrt(carvel.x * carvel.x + carvel.y * carvel.y + carvel.z * carvel.z);
    let maxsteer = Math.max(0.15, 0.8 * (1.0 - speed / 50));

    let targetsteer = 0;
    if (keys["a"]) targetsteer = maxsteer;
    if (keys["d"]) targetsteer = -maxsteer;
    currentsteer += (targetsteer - currentsteer) * turnspeed;

    // ai assisted with some of the complex math and physics, but I did it and wrote it
    for (let i=0;i<4;i++) {
        let carpos = carbody.translation();
        // dont mind this line lol
        let wheelpos = new THREE.Vector3((i % 2) ? wheelxoffset : -wheelxoffset, -0.5, (i > 1) ? wheelzoffset : -wheelzoffset).applyQuaternion(quat).add(carpos);

        let localdown = new THREE.Vector3(0, -1, 0).applyQuaternion(quat);
        //let ray = new RAPIER.Ray(wheelpos, worlddown);
        let ray = new RAPIER.Ray(wheelpos, localdown);
        let hit = world.castRay(ray, susheight, false, null, null, null, carbody);

        let steerangle = 0;
        if (i<2) steerangle = currentsteer;

        if (hit && usesus) {
            let touchedchunk = colliders.get(hit.collider.handle);
            if (touchedchunk) {
                if (touchedchunk > chunkindex) {
                    chunkindex = touchedchunk;
                    handleNextChunk();
                }
            }

            onground = true;
            let compression = 1.0 - (hit.timeOfImpact / susheight);
            if (compression>0) {                
                let wheelvel = carbody.velocityAtPoint(wheelpos);
                let threewheelvel = new THREE.Vector3(wheelvel.x, wheelvel.y, wheelvel.z);
                let compressspeed = threewheelvel.dot(up);

                // calc suspension force and apply it
                let springforce = compression*susstrength;
                if (compression > 0.7) {
                    let excesscompression = compression - 0.7;
                    springforce += excesscompression * susstrength * 4.0;
                }
                let susimp = Math.max(0,springforce-(compressspeed*susslower));
                let susvec = up.clone().multiplyScalar(susimp);
                carbody.addForceAtPoint({x: susvec.x, y: susvec.y, z: susvec.z}, wheelpos, true);

                // calc steering
                let localthreewheelvel = threewheelvel.clone().applyQuaternion(quat.clone().invert());
                if (i<2) {
                    let steerquatr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steerangle);
                    localthreewheelvel.applyQuaternion(steerquatr.clone().invert());
                }
                let side = -localthreewheelvel.x * stiff;
                let maxfriction = susimp * grip;
                let wheelsideforce = Math.max(-maxfriction, Math.min(maxfriction, side));
                let localsideforcevec = new THREE.Vector3(wheelsideforce, 0, 0);
                if (i<2) {
                    let steerquatr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steerangle);
                    localsideforcevec.applyQuaternion(steerquatr);
                }
                let sideforce = localsideforcevec.applyQuaternion(quat);
                let forcepos = new THREE.Vector3((i % 2) ? wheelxoffset : -wheelxoffset, 0, (i > 1) ? wheelzoffset : -wheelzoffset).applyQuaternion(quat).add(carpos);
                carbody.addForceAtPoint({ x: sideforce.x, y: sideforce.y, z: sideforce.z }, forcepos, true);
            }
        }
    }
        
           
    if (onground) {
        let localvelocity = PhysicsManager.getRelativeLinvel(carbody);
        
        let maxspeed = 40;
        let acceleration = 3;
        let targetforwardimp = (maxspeed - Math.abs(localvelocity.z)) * acceleration;
        let forwardimp = 0;

        if (keys["w"]) forwardimp = targetforwardimp;
        if (keys["s"]) forwardimp = -targetforwardimp * 0.8;

        PhysicsManager.applyRelativeImpulse(carbody, {x: 0, y: 0, z: -forwardimp});

        let carangvel = carbody.angvel();
        carbody.setAngvel({ x: carangvel.x * 0.7, y: carangvel.y * 0.95, z: carangvel.z * 0.7 }, true);
    }

    world.step();
    PhysicsManager.updateMeshes();
    camera.rotation.set(0, 0, 0);
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);