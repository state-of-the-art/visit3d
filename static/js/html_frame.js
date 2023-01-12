// This logic will allow to bind WebGL object and HTML frame. Originally was a part of Three.js and
// later was ported by ozRocker https://forum.babylonjs.com/t/youtube-videos-on-a-mesh-port-of-css3drenderer-js/10600
// This edition adds a couple of improvements like rotating, proper detection of the frame size out
// of the target mesh and allows to place frame in the back or in the front of the canvas.
// Ways to improve is to somehow make the meshes to interfere with the canvas as was done here:
// https://codesandbox.io/s/youtubeonmesh-tv-mode-htpw4

class CSS3DObject extends BABYLON.Mesh {
  constructor(name, scene, element, width, height) {
    super(name, scene)
    this.element = element
    this.element.style.position = 'absolute'
    this.element.style.pointerEvents = 'auto'

    // Size in scene units
    this.frameObjWidth = width
    this.frameObjHeight = height
  }
}

class CSS3DRenderer {
  constructor() {
    var matrix = new BABYLON.Matrix()

    this.cache = {
      camera: { fov: 0, style: '' },
      objects: new WeakMap()
    }

    this.cameraElement = document.createElement('div')
    this.isIE = (!!document['documentMode'] || /Edge/.test(navigator.userAgent) || /Edg/.test(navigator.userAgent))

    if(!this.isIE) {
      this.cameraElement.style.webkitTransformStyle = 'preserve-3d'
      this.cameraElement.style.transformStyle = 'preserve-3d'
    }
    this.cameraElement.style.pointerEvents = 'none' // Pass the mouse events through the overlay

    this.domElement = document.createElement('div')
    this.domElement.style.overflow = 'hidden'
    this.domElement.style.pointerEvents = 'none' // Pass the mouse events through the overlay
    this.domElement.appendChild(this.cameraElement)
  }

  getSize() {
    return {
      width: this.width,
      height: this.height
    }
  }

  setSize(width, height) {
    this.width = width
    this.height = height
    this.widthHalf = this.width / 2
    this.heightHalf = this.height / 2

    this.domElement.style.width = width + 'px'
    this.domElement.style.height = height + 'px'

    this.cameraElement.style.width = width + 'px'
    this.cameraElement.style.height = height + 'px'
  }

  epsilon(value) {
    return Math.abs(value) < 1e-10 ? 0 : value
  }

  getCameraCSSMatrix(matrix) {
    var elements = matrix.m

    return 'matrix3d(' +
      this.epsilon( elements[ 0 ] ) + ',' +
      this.epsilon( - elements[ 1 ] ) + ',' +
      this.epsilon( elements[ 2 ] ) + ',' +
      this.epsilon( elements[ 3 ] ) + ',' +
      this.epsilon( elements[ 4 ] ) + ',' +
      this.epsilon( - elements[ 5 ] ) + ',' +
      this.epsilon( elements[ 6 ] ) + ',' +
      this.epsilon( elements[ 7 ] ) + ',' +
      this.epsilon( elements[ 8 ] ) + ',' +
      this.epsilon( - elements[ 9 ] ) + ',' +
      this.epsilon( elements[ 10 ] ) + ',' +
      this.epsilon( elements[ 11 ] ) + ',' +
      this.epsilon( elements[ 12 ] ) + ',' +
      this.epsilon( - elements[ 13 ] ) + ',' +
      this.epsilon( elements[ 14 ] ) + ',' +
      this.epsilon( elements[ 15 ] ) +
    ')'
  }

  getObjectCSSMatrix(matrix, cameraCSSMatrix) {
    var elements = matrix.m
    var matrix3d = 'matrix3d(' +
      this.epsilon( elements[ 0 ] ) + ',' +
      this.epsilon( elements[ 1 ] ) + ',' +
      this.epsilon( elements[ 2 ] ) + ',' +
      this.epsilon( elements[ 3 ] ) + ',' +
      this.epsilon( - elements[ 4 ] ) + ',' +
      this.epsilon( - elements[ 5 ] ) + ',' +
      this.epsilon( - elements[ 6 ] ) + ',' +
      this.epsilon( - elements[ 7 ] ) + ',' +
      this.epsilon( elements[ 8 ] ) + ',' +
      this.epsilon( elements[ 9 ] ) + ',' +
      this.epsilon( elements[ 10 ] ) + ',' +
      this.epsilon( elements[ 11 ] ) + ',' +
      this.epsilon( elements[ 12 ] ) + ',' +
      this.epsilon( elements[ 13 ] ) + ',' +
      this.epsilon( elements[ 14 ] ) + ',' +
      this.epsilon( elements[ 15 ] ) +
    ')'

    if( this.isIE ) {
      return 'translate(-50%,-50%)' +
        'translate(' + this.widthHalf + 'px,' + this.heightHalf + 'px)' + cameraCSSMatrix + matrix3d
    }
    return 'translate(-50%,-50%)' + matrix3d
  }

  renderObject(object, scene, camera, cameraCSSMatrix ) {
    if( object instanceof CSS3DObject ) {
      var style
      var objectMatrixWorld = object.getWorldMatrix().clone()
      var camMatrix = camera.getWorldMatrix()
      var innerMatrix = objectMatrixWorld.m

      var element = object.element

      // Size (scale) X
      innerMatrix[0] *= (1 / parseInt(element.style.width)) * object.frameObjWidth * object.scaling.x
      // Size (scale) Y
      innerMatrix[5] *= (1 / parseInt(element.style.height)) * object.frameObjHeight * object.scaling.y
      innerMatrix[6] *= (1 / parseInt(element.style.height)) * object.frameObjHeight * object.scaling.y

      // Set position from camera
      innerMatrix[12] = -camMatrix.m[12] + object.position.x
      innerMatrix[13] = -camMatrix.m[13] + object.position.y
      innerMatrix[14] = camMatrix.m[14] - object.position.z
      innerMatrix[15] = camMatrix.m[15] * 0.00001

      objectMatrixWorld = BABYLON.Matrix.FromArray(innerMatrix)
      if( this.isIE ) {
        objectMatrixWorld = objectMatrixWorld.scale(100)
      }
      style = this.getObjectCSSMatrix(objectMatrixWorld, cameraCSSMatrix)

      var cachedObject = this.cache.objects.get( object )

      if( cachedObject === undefined || cachedObject.style !== style ) {
          element.style.webkitTransform = style
          element.style.transform = style

          var objectData = { style: style }

          this.cache.objects.set( object, objectData )
      }
      if( element.parentNode !== this.cameraElement ) {
          this.cameraElement.appendChild( element )
      }

    } else if ( object instanceof BABYLON.Scene ) {
      for( var i = 0, l = object.meshes.length; i < l; i ++ ) {
        this.renderObject( object.meshes[ i ], scene, camera, cameraCSSMatrix )
      }
    }
  }

  render(scene, camera) {
    var projectionMatrix = camera.getProjectionMatrix()
    var fov = projectionMatrix.m[5] * this.heightHalf

    if (this.cache.camera.fov !== fov) {
      if (camera.mode == BABYLON.Camera.PERSPECTIVE_CAMERA ) {
        this.domElement.style.webkitPerspective = fov + 'px'
        this.domElement.style.perspective = fov + 'px'
      } else {
        this.domElement.style.webkitPerspective = ''
        this.domElement.style.perspective = ''
      }
      this.cache.camera.fov = fov
    }

    if ( camera.parent === null ) camera.computeWorldMatrix()

    var matrixWorld = camera.getWorldMatrix().clone()
    var rotation = matrixWorld.clone().getRotationMatrix().transpose()
    var innerMatrix = matrixWorld.m

    innerMatrix[1] = rotation.m[1]
    innerMatrix[2] = -rotation.m[2]
    innerMatrix[4] = -rotation.m[4]
    innerMatrix[6] = -rotation.m[6]
    innerMatrix[8] = -rotation.m[8]
    innerMatrix[9] = -rotation.m[9]

    matrixWorld = BABYLON.Matrix.FromArray(innerMatrix)

    var cameraCSSMatrix = 'translateZ(' + fov + 'px)' + this.getCameraCSSMatrix( matrixWorld )

    var style = cameraCSSMatrix + 'translate(' + this.widthHalf + 'px,' + this.heightHalf + 'px)'

    if (this.cache.camera.style !== style && !this.isIE ) {
      this.cameraElement.style.webkitTransform = style
      this.cameraElement.style.transform = style
      this.cache.camera.style = style
    }

    this.renderObject(scene, scene, camera, cameraCSSMatrix)
  }
}


// Makes frame to replace the targetMesh and become a part of the scene (actually on background)
// In case it's false - it will just put the frame on top of the canvas so it will be always on top
var frameEmbedded = false
var frameFocused = false // Used to passthrough the events to embedded frame

// targetMesh - What the mesh dimentions/position/scale/rotation to use for the html frame
//              The frame will be a size of the bounding box of the mesh (width:x and height:y)
// docElement - Document (element) that will be used to show in the frame
// resolution - How many pixels of frame will represent 1 scene unit
// scene      - Scene to attach to
var httpFrameInit = function(targetMesh, docElement, resolution, scene) {
  // Init the setup
  var target = scene.getMeshByName(targetMesh)

  // Setup the CSS renderer and object
  let renderer = setupRenderer('canvasParent')

  createCSSobject(targetMesh+"-html", target, scene, renderer, docElement, resolution)

  if( frameEmbedded ) {
    // Cut out the scene in place of the donor object to see the background html element
    createMaskingScreen(target, scene, renderer)
  } else {
    // The mesh is not needed anymore so we can hide it
    target.visibility = false
  }

  // Fix for extended zone after setup of cssobject
  var canvasZone = document.getElementById('canvasParent')
  renderer.setSize(canvasZone.offsetWidth, canvasZone.offsetHeight)

  if( frameEmbedded ) {
    // Pass the mouse events in case the pointer is on the target scene object
    var listener = function(evt) {
      let pick = scene.pick(Math.round(evt.offsetX), Math.round(evt.offsetY))
      if( pick.hit ) {
        if( pick.pickedMesh.name === targetMesh ) {
          if( !frameFocused ) {
            frameFocused = true
            document.getElementsByTagName('body')[0].style.pointerEvents = 'none'
          }
        }
      }
    }

    window.addEventListener('pointermove', listener)
    window.addEventListener('pointerdown', listener)
    window.addEventListener('pointerup', listener)
  }
}

var setupRenderer = function(canvasParent) {
  var container = document.createElement('div')
  container.id = 'css-container'
  container.style.pointerEvents = 'none' // Pass the mouse events through the overlay
  container.style.position = 'absolute'
  container.style.left = '0px'
  container.style.top = '0px'
  container.style.width = '100%'
  container.style.height = '100%'
  if( frameEmbedded )
    container.style.zIndex = '-1'

  var canvasZone = document.getElementById(canvasParent)
  if( frameEmbedded ) {
    canvasZone.insertBefore(container, canvasZone.firstChild)
  } else {
    canvasZone.appendChild(container)
  }

  let renderer = new CSS3DRenderer()
  container.appendChild(renderer.domElement)
  renderer.setSize(canvasZone.offsetWidth, canvasZone.offsetHeight)

  window.addEventListener('resize', e => {
    renderer.setSize(canvasZone.offsetWidth, canvasZone.offsetHeight)
  })

  return renderer
}

var createCSSobject = function(name, mesh, scene, renderer, docElement, resolution) {
  // Getting width & height of the mesh bounding box
  const bb = mesh.getBoundingInfo().boundingBox
  const width = Math.abs(bb.minimum.x) + Math.abs(bb.maximum.x)
  const height = Math.abs(bb.minimum.y) + Math.abs(bb.maximum.y)

  scene.onBeforeRenderObservable.add(() => {
    renderer.render(scene, scene.activeCamera)
  })
  var div = document.createElement('div')
  div.style.width = width * resolution + 'px'
  div.style.height = height * resolution + 'px'
  div.style.backgroundColor = '#0000'
  //div.style.filter = 'blur(1px)' // To deal with no antialiasing of css matrix3d transform
  if( frameEmbedded )
    div.style.zIndex = '1'

  var CSSobject = new CSS3DObject(name, scene, div, width, height)
  // Instead of using the object position it's better to use bounding box center
  //CSSobject.position.copyFrom(mesh.getAbsolutePosition())
  CSSobject.position.copyFrom(bb.centerWorld)
  CSSobject.rotationQuaternion = mesh.rotationQuaternion
  CSSobject.scaling = mesh.scaling

  div.appendChild(docElement)

  if( frameEmbedded ) {
    // Enable the camera rotation on canvas after leaving the html frame
    div.addEventListener('mouseout', () => {
      frameFocused = false
      document.getElementsByTagName('body')[0].style.pointerEvents = 'auto'
    })
  }
}

function createMaskingScreen(maskMesh, scene) {
  let depthMask = new BABYLON.StandardMaterial('matDepthMask', scene)
  depthMask.backFaceCulling = false

  maskMesh.material = depthMask
  maskMesh.onBeforeRenderObservable.add(() => engine.setColorWrite(false))
  maskMesh.onAfterRenderObservable.add(() => engine.setColorWrite(true))

  // swap meshes to put mask first
  var mask_index = scene.meshes.indexOf(maskMesh)
  scene.meshes[mask_index] = scene.meshes[0]
  scene.meshes[0] = maskMesh
}
