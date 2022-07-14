import WebGL from './three-webgl.min.js';
import * as THREE from 'three';
import { OutlineEffect } from './three-outlineeffect.min.js';
import { DRACOLoader } from './three-dracoloader.min.js';
import { GLTFLoader } from './three-gltfloader.min.js';
import { DeviceOrientationController } from './three-deviceorientation.js';
import { VRButton } from './three-vrbutton.min.js';
import { CCDIKSolver, CCDIKHelper } from './three-ccdiksolver.min.js';
import { DragControls } from './three-dragcontrols.js';

var ikSolver, dcontrols;
const mouse = new THREE.Vector2(), raycaster = new THREE.Raycaster();

if( !WebGL.isWebGLAvailable() ) {
  // TODO: Implement simple welcome screen if webgl is not supported
  const warning = WebGL.getWebGLErrorMessage();
  document.body.appendChild(warning);
} else {
  const scene = new THREE.Scene();

  // Default camera will be replaced by the active one from the gltf loader
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set( 0, 250, 0 );
  camera.lookAt( 0, 0, 0 );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Adding VRButton to indicate VR support
  document.body.appendChild(VRButton.createButton(renderer));

  // Slightly rotate camera on mouse move
  const controls = new DeviceOrientationController(camera, renderer.domElement);

  // Load the model
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('./js/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.load('./model.glb', function(gltf) {
    gltf.scene.traverse(toonMaterial);
    scene.add(gltf.scene);
    if( gltf.cameras ) {
      camera = gltf.cameras[0]
      onWindowResize();

      // Set the camera to control
      controls.object = camera;
      controls.setRotationMultiplier(0.01);
      controls.connect();

      // Add mouse dragging of objects
      dcontrols = new DragControls( [ ... scene.children ], camera, renderer.domElement );
      console.log(dcontrols.getObjects());
    }
  }, function (xhr) {
    console.log(( xhr.loaded / xhr.total * 100 ) + '% loaded');
  }, function(error) {
    console.error(error);
  });

  scene.background = new THREE.Color( 0xffffff );

  window.addEventListener('resize', onWindowResize);

  // Cell shading outline effect with VR support
  const outline_effect = new OutlineEffect(renderer);
  let renderingOutline = false;
  scene.onAfterRender = function () {
    if( renderingOutline ) return;
    renderingOutline = true;
    outline_effect.renderOutline(scene, camera);
    renderingOutline = false;
  };

  // Create IK tree
  initBones();

function createGeometry( sizing ) {
  const geometry = new THREE.CylinderGeometry(
    5, // radiusTop
    5, // radiusBottom
    sizing.height, // height
    8, // radiusSegments
    sizing.segmentCount * 1, // heightSegments
    true // openEnded
  );

  const position = geometry.attributes.position;

  const vertex = new THREE.Vector3();

  const skinIndices = [];
  const skinWeights = [];

  for ( let i = 0; i < position.count; i ++ ) {

    vertex.fromBufferAttribute( position, i );

    const y = ( vertex.y + sizing.halfHeight );

    const skinIndex = Math.floor( y / sizing.segmentHeight );
    const skinWeight = ( y % sizing.segmentHeight ) / sizing.segmentHeight;

    skinIndices.push( skinIndex, skinIndex + 1, 0, 0 );
    skinWeights.push( 1 - skinWeight, skinWeight, 0, 0 );

  }

  geometry.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( skinIndices, 4 ) );
  geometry.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( skinWeights, 4 ) );

  return geometry;
}

function createBones( sizing ) {
  var bones = [];

  // "root bone"
  const rootBone = new THREE.Bone();
  rootBone.name = 'root';
  rootBone.position.y = - sizing.halfHeight;
  bones.push( rootBone );

  //
  // "bone0", "bone1", "bone2", "bone3"
  //

  // "bone0"
  let prevBone = new THREE.Bone();
  prevBone.position.y = 0;
  rootBone.add( prevBone );
  bones.push( prevBone );

  // "bone1", "bone2", "bone3"
  for ( let i = 1; i <= sizing.segmentCount; i ++ ) {

    const bone = new THREE.Bone();
    bone.position.y = sizing.segmentHeight;
    bones.push( bone );
    bone.name = `bone${i}`;
    prevBone.add( bone );
    prevBone = bone;
  }

  // "target"
  const targetBone = new THREE.Bone();
  targetBone.name = 'target';
  targetBone.position.y = sizing.height + sizing.segmentHeight; // relative to parent: rootBone
  rootBone.add( targetBone );
  bones.push( targetBone );

  return bones;
}

function createMesh( geometry, bones ) {

  const material = new THREE.MeshPhongMaterial( {
    color: 0x156289,
    emissive: 0x072534,
    side: THREE.DoubleSide,
    flatShading: true,
    wireframe: true
  } );

  const mesh = new THREE.SkinnedMesh( geometry,  material );
  const skeleton = new THREE.Skeleton( bones );

  mesh.add( bones[ 0 ] );

  mesh.bind( skeleton );

  const skeletonHelper = new THREE.SkeletonHelper( mesh );
  skeletonHelper.material.linewidth = 2;
  scene.add( skeletonHelper );

  return mesh;
}

function initBones() {
  const segmentHeight = 8;
  const segmentCount = 3;
  const height = segmentHeight * segmentCount;
  const halfHeight = height * 0.5;

  const sizing = {
    segmentHeight,
    segmentCount,
    height,
    halfHeight
  };

  const geometry = createGeometry( sizing );
  const bones = createBones( sizing );
  const mesh = createMesh( geometry, bones );

  scene.add( mesh );

  // Positioning tree
  mesh.translateX(120.0);
  mesh.translateZ(120.0);

  //
  // ikSolver
  //

  const iks = [
    {
      target: 5,
      effector: 4,
      links: [ { index: 3 }, { index: 2 }, { index: 1 } ]
    }
  ];
  ikSolver = new CCDIKSolver( mesh, iks );
  scene.add( new CCDIKHelper( mesh, iks ) );
}

/*function setupDatGui() {

  gui.add( mesh, 'pose' ).name( 'mesh.pose()' );

  mesh.skeleton.bones
    .filter( ( bone ) => bone.name === 'target' )
    .forEach( function ( bone ) {

      const folder = gui.addFolder( bone.name );

      const delta = 20;
      folder.add( bone.position, 'x', - delta + bone.position.x, delta + bone.position.x );
      folder.add( bone.position, 'y', - bone.position.y, bone.position.y );
      folder.add( bone.position, 'z', - delta + bone.position.z, delta + bone.position.z );

  } );

  gui.add( ikSolver, 'update' ).name( 'ikSolver.update()' );
  gui.add( state, 'ikSolverAutoUpdate' );

}*/

  // Running animation
  renderer.setAnimationLoop(render);

  function toonMaterial(obj) {
    // Replaces material to toon shading saving the color of original material
    if( obj.material ) {
      obj.material = new THREE.MeshToonMaterial({
        color: obj.material.color,
        side: THREE.DoubleSide,
      });
    }
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  function render() {
    ikSolver?.update();
    controls.update();

    renderer.render(scene, camera);
  };
}
