import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

await RAPIER.init();
const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

const susheight = 1.0;
const susstrength = 8000;
const susslower = 1000;
const stiff = 6000;
const grip = 4;
const camerasmoothness = 0.2;
let turnspeed = 0.03;
let maxsteeramount = 0.15;
let maxspeed = 40;

let freecam = false;
let clock = new THREE.Clock();

let score = 0;
let highscore = localStorage.getItem("highscore");
let crashed = false;
document.getElementById("highscore").innerText = highscore ? highscore : 0;

let lastcaryvel = 0;
let lastcarxvel = 0;
let lastcarzvel = 0;
let cambounceyoffset = 0;
let cambouncezoffset = 0;
let cambouncexoffset = 0;
let cambounceyvel = 0;
let cambouncezvel = 0;
let cambouncexvel = 0;
const cambounceystrength = 150;
const cambounceydamp = 6;
const cambounceysens = 0.2;
const cambouncexstrength = 150;
const cambouncexdamp = 6;
const cambouncexsens = 0.1;
const cambouncezstrength = 150;
const cambouncezdamp = 6;
const cambouncezsens = 0.1;

let steeringwheel;

let colliders = new Map();
let chunkcounter = 0;
let chunkindex = 0;

let bg = new Audio("assets/bg.mp3");
bg.loop = true;

let engine = new Audio("assets/engine.wav");
engine.volume = 0.1;
engine.loop = true;

let midaccelerate = new Audio("assets/midaccelerate.wav");
midaccelerate.loop = true;
let accelerating = false;

const maps = {
    "straight": {
        file: "assets/road_straight.glb",
        included: ["Object_0","Object_1","Object_2"],
        scale: 2,
        enteroffset: new THREE.Vector3(-16.096542358398438, 7.981929779052734, 53.090206146240234),
        exitoffset: new THREE.Vector3(-15.130682945251465, 7.986536979675293, -51.763545989990234),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(-15,9,0)
    },
    "curveleft": {
        file: "assets/road_curve_left.glb",
        included: ["Object_0","Object_1","Object_2"],
        scale: 2,
        enteroffset: new THREE.Vector3(32.42043685913086, 1.3111519813537598, 104.15299987792969),
        exitoffset: new THREE.Vector3(-18.35940933227539, 1.26669442653656, 24.343416213989258),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(32.5, 3.5, 102)
    },
    "curveright": {
        file: "assets/road_curve_right.glb",
        included: ["Object_0","Object_1","Object_2"],
        scale: 2,
        enteroffset: new THREE.Vector3(-51.66175842285156, 1.2974135875701904, 102.94046020507812),
        exitoffset: new THREE.Vector3(-16.634490966796875, 1.206100583076477, 12.328327178955078),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(-52, 3.5, 102)
    },
    "up": {
        file: "assets/road_up.glb",
        included: ["Object_0","Object_1","Object_2"],
        scale: 2,
        enteroffset: new THREE.Vector3(-20.994415283203125, -14.38963794708252, 104.52879333496094),
        exitoffset: new THREE.Vector3(-14.442913055419922, 1.3251999616622925, 0.35062703490257263),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(-21, -11, 100.5)
    },
    "down": {
        file: "assets/road_down.glb",
        included: ["Object_0","Object_1","Object_2"],
        scale: 2,
        enteroffset: new THREE.Vector3(-20.813392639160156, 0.8175168633460999, 103.45845794677734),
        exitoffset: new THREE.Vector3(-14.634032249450684, -10.295941352844238, 1.7138200998306274),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(-20, 3.5, 103)
    }/*,
    "turns": {
        file: "assets/road_turns.glb",
        included: ["Object_2","Object_3","Object_4"],
        scale: 2,
        enteroffset: new THREE.Vector3(13.326072692871094, -3.465733051300049, 36.96432876586914),
        exitoffset: new THREE.Vector3(-15.49168586730957, 14.95290470123291, -29.34079360961914),
        rotation: new THREE.Vector3(0,0,0),
        spawn: new THREE.Vector3(15, 2, 5)
    }*/
};

let currentmapexitpos = new THREE.Vector3(0, 0, 0);
let farthestcardis;
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

        const col = world.createCollider(colliderDesc, body);
        return [col, body];
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

let cameraobject = new THREE.Object3D();

const controls = new PointerLockControls(cameraobject, document.body);
controls.pointerSpeed = 10;
document.addEventListener("click",() =>{
    if (!crashed) {
        controls.lock();
        if (bg.paused) bg.play();
        if (engine.paused) engine.play();
    }
});

let keys=[];
document.addEventListener("keydown",(e)=>{
    keys[e.key.toLowerCase()]=true;

    if (!crashed) {
        if (keys["w"] && !accelerating) {
            midaccelerate.play();
            accelerating = true;
        }
    }
});
document.addEventListener("keyup",(e)=>{
    keys[e.key.toLowerCase()]=false;

    if (!crashed && accelerating && e.key.toLowerCase() == "w") {
        accelerating = false;
    }
});

setInterval(() => {
    let add = 0.05;
    let subt = 0.1;
    if (!accelerating) {
        if (midaccelerate.volume - subt > 0) { 
            midaccelerate.volume -= subt;
        } else {
            midaccelerate.volume = 0;
            midaccelerate.pause();
        }
    } else {
        if (midaccelerate.volume + add < 1) {
            midaccelerate.volume += 0.05;
        } else {
            midaccelerate.volume = 1;
        }
    }
},100);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style = "position:absolute; top:0px; left:0px; width:100%; height:100%;";
document.body.appendChild(renderer.domElement);

renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let fly = new FlyControls(camera, renderer.domElement);
fly.movementSpeed = 5;
fly.rollSpeed = 1;

/*const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 15), new THREE.MeshStandardMaterial({color: 0x1f1f1f, side: THREE.BackSide}));
scene.add(sky);*/

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

    let bodies = [];

    // ai assisted with the initial traversal loop and i built from it
    model.traverse((child) => {
        let base = child.name.includes("_", child.name.indexOf("_") + 1) ? child.name.replace(/_\d+$/, "") : child.name;
        //console.log(base);
        if (child.isMesh && maps[type].included.some(item => base.toLowerCase() == item.toLowerCase()) || maps[type].included[0] == "ALL") {
            try {
                let mesh = PhysicsManager.addTrimesh(child,0,0.99);
                let collider = mesh[0];
                bodies.push(mesh[1]);

                colliders.set(collider.handle, chunkcounter);
            } catch (e) {}
        }
    });

    if (spawn) {
        let spawnpos = pos.clone().add(maps[type].spawn);
        car.position.copy(spawnpos);
    }

    loaded.push({
        index: chunkcounter, 
        model,
        bodies
    });
    
    currentmapexitpos.copy(pos).add(maps[type].exitoffset);
}

function removeOldestChunk() {
    let map = loaded.at(0);
    if (map) {
        scene.remove(map.model);
        map.model.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                let mats;
                if (Array.isArray(child.material)) {
                    mats = child.material;
                } else {
                    mats = [child.material];
                }
                for (let mat of mats) {
                    mat.dispose();
                }
            }
        });
        for (let body of map.bodies) {
            world.removeRigidBody(body);
        }
        loaded.shift();
    }
}

function handleNextChunk(start = false) {
    let mapkeys = Object.keys(maps);
    let randomkey = mapkeys[Math.floor(Math.random() * mapkeys.length)];
    loadMap(randomkey, start);
    chunkcounter++;
    while (loaded.length > 3) {
        removeOldestChunk();
    }
}

function mapChunk(name, free = false) {
    let model = assets[name].clone();
    model.position.set(0, 0, 0);
    scene.add(model);
    model.updateMatrixWorld(true);
    let addedCount = 0;
    model.traverse((child) => {
        let base = child.name.includes("_", child.name.indexOf("_") + 1) ? child.name.replace(/_\d+$/, "") : child.name;
        if (child.isMesh && maps[name].included.some(item => base.toLowerCase() == item.toLowerCase())) {
            try {
                let collider = PhysicsManager.addTrimesh(child, 0, 0.99);
                colliders.set(collider.handle, 0);
                addedCount++;
            } catch (e) { console.error(e); }
        }
    });
    car.position.copy(maps[name].spawn);
    freecam = free;
    if (free) {
        scene.add(camera);
        camera.position.copy(maps[name].spawn);
    }
    let sun = new THREE.DirectionalLight(0xfff2e0, 1.5);
    scene.add(sun);
    document.addEventListener("keydown", (e) => {
        if (e.key.toLowerCase() === "p") {
            if (free) console.log(camera.position);
            let t = carbody.translation();
            console.log("car position:", [t.x, t.y, t.z]);
        }
    });
}

handleNextChunk(true);
handleNextChunk();
//mapChunk("up");

//car.geometry.translate(0, -0.5, 0); 
//car.position.set(1, 0, 5);
let carbody = PhysicsManager.addBox(car, 800, 0.99);
carbody.setLinearDamping(0.1);
carbody.setAngularDamping(0.5);
car.castShadow = true;
car.receiveShadow = true;
scene.add(car);

async function addCarModel(num) {
    let gltf = await loader.loadAsync("assets/car" + num + ".glb");
    let carmodel = gltf.scene;
    carmodel.scale.set(0.43, 0.43, 0.43);
    carmodel.rotation.set(0, Math.PI, 0);
    carmodel.position.set(0.12, -0.75, 0.7);
    car.add(carmodel);
    carmodel.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    steeringwheel = carmodel.getObjectByName("steeringWheel");
}
addCarModel(2);

const headlight1 = new THREE.SpotLight(0xffffff, 50);
headlight1.position.set(-0.7, 0.2, -1); 
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
headlight2.position.set(0.7, 0.2, -1); 
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

const carlight = new THREE.PointLight(0xfff4e0, 0.8, 3);
carlight.position.set(0, 0.3, 0.2);
car.add(carlight);

if (!freecam) {
    car.add(cameraobject);
    car.add(camera);
}
cameraobject.position.set(0, -0.05, 0.5);
camera.position.set(0, -0.05, 0.5);

function animate(time) {
    if (freecam) {
        let delta = clock.getDelta();
        fly.update(delta);
        renderer.render(scene, camera);
        return;
    }

    maxspeed = 40 + chunkindex * 0.8;
    turnspeed = Math.min(0.08, 0.03 + chunkindex * 0.002);
    maxsteeramount = Math.min(0.4, 0.15 + chunkindex * 0.0035);

    carbody.resetForces(true);
    carbody.resetTorques(true);

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
    let maxsteer = Math.max(maxsteeramount, 0.8 * (1.0 - speed / 50));

    let playback = 1 + Math.min(speed / maxspeed, 1) * 0.8;
    engine.playbackRate = playback;
    midaccelerate.playbackRate = playback;

    let targetsteer = 0;
    if (keys["a"]) targetsteer = maxsteer;
    if (keys["d"]) targetsteer = -maxsteer;
    currentsteer += (targetsteer - currentsteer) * turnspeed;
    if (steeringwheel) steeringwheel.rotation.z = Math.PI - currentsteer * 6;

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
            if (touchedchunk != undefined) {
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

        let acceleration = 3;
        let targetforwardimp = (maxspeed - Math.abs(localvelocity.z)) * acceleration;
        let forwardimp = 0;

        if (keys["w"]) forwardimp = targetforwardimp;
        if (keys["s"]) forwardimp = -targetforwardimp * 0.95;

        PhysicsManager.applyRelativeImpulse(carbody, {x: 0, y: 0, z: -forwardimp});

        let carangvel = carbody.angvel();
        carbody.setAngvel({ x: carangvel.x * 0.7, y: carangvel.y * 0.95, z: carangvel.z * 0.7 }, true);
    }

    // crash detection
    let velocity = carbody.linvel();
    let hitamount = new THREE.Vector3(velocity.x - lastcarxvel, (velocity.y - lastcaryvel) * 0.7, velocity.z - lastcarzvel).length();
    if (hitamount > 1.2 && !crashed) {
        crashed = true;
        bg.pause();
        engine.pause();
        midaccelerate.pause();
        controls.unlock();
        renderer.setAnimationLoop(null);
        document.querySelectorAll("canvas")[0].style.display = "none";
        document.getElementById("cont").style.justifyContent = "center";
        document.getElementById("score").style = "transition: 0s all; display: none; opacity: 0; font-size: 3vh;";
        document.getElementById("highscore").style = "transition: 0s all; display: none; opacity: 0; font-size: 3vh;";
        document.getElementById("othertext").style = "transition: 0s all; display: none; opacity: 0; font-size: 3vh;";
        document.getElementById("score").innerText = "Score: " + document.getElementById("score").innerText;
        document.getElementById("highscore").innerText = "High Score: " + document.getElementById("highscore").innerText;
        document.getElementById("gameover").style.display = "block";
        setTimeout(() => {
            document.getElementById("gameover").style.opacity = 1;
            document.getElementById("score").style = "transition: 2s all; display: block; opacity: 0; font-size: 3vh; margin-top: 10px;";
            document.getElementById("othertext").style = "transition: 2s all; display: block; opacity: 0; font-size: 3vh; margin-top: 10px;";
            document.getElementById("highscore").style = "transition: 2s all; display: block; opacity: 0; font-size: 3vh;";
            setTimeout(() => {
                document.getElementById("othertext").style.opacity = 1;
                setTimeout(() => {
                    document.getElementById("score").style.opacity = 1;
                    setTimeout(() => {
                        document.getElementById("highscore").style.opacity = 1;
                        setTimeout(() => {
                            document.getElementById("restart").style.opacity = 1;
                        },900);
                    },900);
                },1500);
            },2500);
        },1000);
    }

    // camera bouncing
    let caryveloffset = carbody.linvel().y - lastcaryvel;
    lastcaryvel = carbody.linvel().y;
    cambounceyvel -= caryveloffset * cambounceysens;
    let camyforce = -cambounceyoffset * cambounceystrength - cambounceyvel * cambounceydamp;
    cambounceyvel += camyforce * (1/60);
    cambounceyoffset += cambounceyvel * (1/60);
    camera.position.y = -0.05 + cambounceyoffset;

    let carxveloffset = carbody.linvel().x - lastcarxvel;
    lastcarxvel = carbody.linvel().x;
    cambouncexvel -= carxveloffset * cambouncexsens;
    let camxforce = -cambouncexoffset * cambouncexstrength - cambouncexvel * cambouncexdamp;
    cambouncexvel += camxforce * (1/60);
    cambouncexoffset += cambouncexvel * (1/60);
    camera.position.x = 0 + cambouncexoffset;

    let carzveloffset = carbody.linvel().z - lastcarzvel;
    lastcarzvel = carbody.linvel().z;
    cambouncezvel -= carzveloffset * cambouncezsens;
    let camzforce = -cambouncezoffset * cambouncezstrength - cambouncezvel * cambouncezdamp;
    cambouncezvel += camzforce * (1/60);
    cambouncezoffset += cambouncezvel * (1/60);
    camera.position.z = 0.5 + cambouncezoffset;

    world.step();
    PhysicsManager.updateMeshes();
    camera.quaternion.slerp(cameraobject.quaternion, camerasmoothness);
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

setInterval(() => {
    if (!crashed) {
        if (!farthestcardis) farthestcardis = car.position.clone();
        if (car.position.z < farthestcardis.z) {
            let speed = Math.sqrt(carbody.linvel().x**2 + carbody.linvel().y**2 + carbody.linvel().z**2);
            score += Math.floor((farthestcardis.z - car.position.z) * (1 + speed / 10));
            farthestcardis.z = car.position.z;
            document.getElementById("score").innerText = score;
        }
        if (score > highscore) {
            highscore = score;
            localStorage.setItem("highscore", highscore);
            document.getElementById("highscore").innerText = highscore;
        }
    }
},50);