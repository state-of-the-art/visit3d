// Main logic is here, it begins by initFunction() called from index.js

var canvas = document.getElementById("renderCanvas")

var startRenderLoop = function( engine, canvas ) {
  engine.runRenderLoop(function() {
    if( scene_render && scene_render.activeCamera && scene_ui_render && scene_ui_render.activeCamera ) {
      scene_render.render()
      scene_ui_render.render()
    }
  })
}

var engine = null
var scene = null
var scene_render = null
var scene_ui = null
var scene_ui_render = null

// Will be executed when everything is loaded and the user is here
var onInitCompleted = function() {
  // Start the scroll unwind animation
  var anim = scene_ui.getAnimationGroupByName('ScrollUnwind')
  anim.onAnimationGroupEndObservable.addOnce(function() {
    // Setup scroll content from html data
    scroll_doc = document.getElementById('scrollDocument')
    // WARNING: On mobile safari > 5000 and on android chromium > 8000 is too much and getting cut
    httpFrameInit('ScrollContent', scroll_doc, 5000, scene_ui)

    // We need custom scrolling to deal with buggy one in firefox
    document.addEventListener('wheel', function(e) {
      var scr = scroll_doc.scrollTop + (((e.deltaY / Math.abs(e.deltaY)) * (scroll_doc.clientHeight / 20)) || 0)
      scroll_doc.scroll(0, scr)
    })

    var touchY = null
    document.addEventListener('touchmove', function(e) {
      var deltaY = -event.changedTouches[0].pageY + touchY
      touchY = event.changedTouches[0].pageY
      var scr = scroll_doc.scrollTop + (((deltaY / Math.abs(deltaY)) * (scroll_doc.clientHeight / 20)) || 0)
      scroll_doc.scroll(0, scr)
    })
    document.addEventListener('touchstart', function(e) {
      // Placing initial y position of the touch
      touchY = event.changedTouches[0].pageY
    })
  })
  anim.play(false)
}

var createDefaultEngine = function() {
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: false })
}

var switchCamera = function( camera, scene, control ) {
  if( scene.activeCamera.absoluteRotation ) {
    camera.rotationQuaternion = scene.activeCamera.absoluteRotation.clone()
  }
  camera.fov = scene.activeCamera.fov
  camera.minZ = scene.activeCamera.minZ
  camera.maxZ = scene.activeCamera.maxZ
  if( scene.activeCamera.ellipsoid ) {
    camera.ellipsoid = scene.activeCamera.ellipsoid.clone()
  }
  camera.checkCollisions = scene.activeCamera.checkCollisions
  camera.applyGravity = scene.activeCamera.applyGravity
  camera.speed = 0.5
  camera.postProcesses = scene.activeCamera.postProcesses
  scene.activeCamera.postProcesses = []

  if( control )
    scene.activeCamera.detachControl(canvas)
  if( scene.activeCamera.dispose ) {
    scene.activeCamera.dispose()
  }
  scene.activeCamera = camera
  if( control )
    scene.activeCamera.attachControl(canvas)
}

var createSceneUI = async function() {
  engine.loadingUIText = 'Creating the UI...'
  const scene_ui = new BABYLON.Scene(engine)
  //scene_ui.clearColor = new BABYLON.Color4(0.2, 0.8, 1.0, 0.0)
  scene_ui.autoClear = false

  // Set up new rendering pipeline tonemapping
  //var pipeline = new BABYLON.DefaultRenderingPipeline("default_ui", true, scene_ui)
  scene_ui.imageProcessingConfiguration.toneMappingEnabled = true
  scene_ui.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES
  scene_ui.imageProcessingConfiguration.exposure = 1

  // Glow layer for emissive objects
  const glow_ui = new BABYLON.GlowLayer("glow_ui", scene_ui)

  engine.loadingUIText = 'Loading models...'

  // Load scene_ui models
  BABYLON.SceneLoader.Append("", "ui.glb", scene_ui, function(gltf) {
    // Stop default animations
    for( var anim of gltf.animationGroups ) {
      anim.stop()
    }

    // Hiding scroll content mesh since it will be used later by htmlframe
    scene_ui.getMeshByName('ScrollContent').visibility = false

    // Create camera out of the existing ones in scene ui
    if( scene_ui.cameras.length > 0 ) {
      scene_ui.activeCamera = scene_ui.cameras[0]

      if( engine.getScreenAspectRatio() < 0.9 ) {
        // Moving camera further in case it's narrow portrait (smartphone)
        scene_ui.activeCamera.position.z += 0.3/engine.getScreenAspectRatio()
        scene_ui.activeCamera.position.y += 0.1
      } else {
        // Moving camera left in case the screen is landscape
        scene_ui.activeCamera.position.x -= 0.1
      }
      
      //var camera = new BABYLON.FreeCamera("ActiveCamera", scene_ui.activeCamera.globalPosition, scene_ui)
      //switchCamera(camera, scene_ui, true)
    } else {
      scene_ui.activeCamera = new BABYLON.FreeCamera("ActiveCamera", BABYLON.Vector3.Zero(), scene)
    }
  }, null, function(scene, msg, exc) {
    // On error
    logError("Exception during loading ui scene: " + msg + ": " + exc)
  })

  // Wait for the scene to be rendered once and hide the loading screen and run the UI actions
  scene_ui.onAfterRenderObservable.addOnce(function() {
    engine.loadingUIText = 'Waiting for witness...'
    // Wait for another 1 second to establish the render engine and make sure user is here
    var f = function() {
      if( !document.hidden ) {
        engine.hideLoadingUI()
        // Run main sequence in 1 second
        setTimeout(onInitCompleted, 1000)
      } else {
        // Wait for the user to see the page
        setTimeout(f, 1000)
      }
    }
    setTimeout(f, 1000)
  })

  return scene_ui
}

var createScene = async function() {
  engine.loadingUIText = 'Creating the scene...'
  const scene = new BABYLON.Scene(engine)
  scene.clearColor = new BABYLON.Color3(0.2, 0.8, 1.0)
  // TODO: Use the aggressive optimizations - not works that well...
  //scene.performancePriority = BABYLON.ScenePerformancePriority.Aggressive

  // Set up fog
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR
  scene.fogColor = new BABYLON.Color3(0.1, 0.1, 0.1)
  scene.fogStart = 100.0
  scene.fogEnd = 200.0

  // Set up new rendering pipeline tonemapping
  //var pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene)
  scene.imageProcessingConfiguration.toneMappingEnabled = true
  scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES
  scene.imageProcessingConfiguration.exposure = 1

  // Glow layer for emissive objects
  const glow_main = new BABYLON.GlowLayer("glow", scene)

  engine.loadingUIText = 'Loading models...'

  // Load main scene
  BABYLON.SceneLoader.Append("", "main.glb", scene, function(gltf) {
    engine.loadingUIText = 'Model loaded!'

    // Processing meshes
    for( var mesh of gltf.meshes ) {
      // Skipping instances - they will use origin settings anyway
      // Skipping meshes without material
      if( mesh.isAnInstance || !mesh.material )
        continue

      engine.loadingUIText = 'Processing mesh `'+mesh.name+'`...'

      // Fixing issue with depth test for transparent textures
      if( mesh.material.getAlphaTestTexture() ) {
        mesh.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST
        mesh.material.useAlphaFromAlbedoTexture = false
      }

      // Use custom loaded metadata loaded by GLTFMaterialExtras
      const metadata = Object.assign((mesh.material.metadata || {}), mesh.material._metadata || {})
      mesh.material.metadata = metadata

      if( metadata?.gltf?.extras?.Outline != 0 ) {
        mesh.renderOutline = true
        mesh.outlineColor = new BABYLON.Color3(0.0, 0.0, 0.0)
        mesh.outlineWidth = 0.03 * (metadata?.gltf?.extras?.Outline || 1.0)
      }

      // BugFix: Iphone have a weird behavior with animation shaking, solved after reading:
      // https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons#performance-considerations
      if( mesh.skeleton ) {
        if( ['iPhone', 'iPad'].includes(navigator.platform) ) {
          mesh.skeleton.useTextureToStoreBoneMatrices = false
        }
      }

      if( mesh.material.name.startsWith('Ground') ) {
        // TODO: Fireflies should blink, but right now they just light on
        var firefliesEmitter = new BABYLON.ParticleSystem('fireflies', 200, scene)
        firefliesEmitter.particleTexture = new BABYLON.Texture('textures/firefly.png', scene)
        firefliesEmitter.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE
        //firefliesEmitter.updateSpeed = 0.003
        firefliesEmitter.emitRate = 2.0

        firefliesEmitter.minLifeTime = 10
        firefliesEmitter.maxLifeTime = 100

        firefliesEmitter.minSize = 0.05
        firefliesEmitter.maxSize = 0.1

        firefliesEmitter.color1 = new BABYLON.Color4(1.0, 0.9, 0.2, 1.0)
        firefliesEmitter.color2 = new BABYLON.Color4(0.7, 0.5, 0.0, 1.0)
        firefliesEmitter.colorDead = new BABYLON.Color4(0.2, 0.2, 0.2, 0.0)

        var noiseTexture = new BABYLON.NoiseProceduralTexture("fireflies_velocity", 256, scene, null, false)
        noiseTexture.animationSpeedFactor = 1.0
        noiseTexture.persistence = 2
        noiseTexture.brightness = 0.6
        noiseTexture.octaves = 4

        firefliesEmitter.noiseTexture = noiseTexture
        firefliesEmitter.noiseStrength = new BABYLON.Vector3(10, 10, 10)

        firefliesEmitter.emitter = mesh
        firefliesEmitter.particleEmitterType = new BABYLON.MeshParticleEmitter(mesh)

        firefliesEmitter.limitVelocityDamping = 0.5
        firefliesEmitter.addLimitVelocityGradient(0, 2)
        firefliesEmitter.addLimitVelocityGradient(1, 1.0)

        firefliesEmitter.start()
      }

      // TODO: Enable auto-simplification
      // https://doc.babylonjs.com/features/featuresDeepDive/mesh/simplifyingMeshes
      // https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene
      // https://joepavitt.medium.com/optimizing-a-large-scale-babylon-js-scene-9466bb715e15
      //if( !mesh.name.startsWith('Ground') ) {
      //if( mesh.name.startsWith('Tree') || mesh.name.startsWith('SmallTree') ) {
      //  mesh.simplify([{ quality: 0.5, distance: 80 }, { quality: 0.1, distance: 180 }],
      //    false,
      //    BABYLON.SimplificationType.QUADRATIC,
      //    function(mesh, submeshIndex) { console.log("Simplified:", mesh, submeshIndex) }
      //  )
      //} else {
      //  console.log(mesh.name, mesh.subMeshes)
      //}
    }

    engine.loadingUIText = 'Cleaning and completing...'

    // Set camera position
    if( scene.cameras.length > 0 ) {
      scene.activeCamera = scene.cameras[0]
      //scene.activeCamera.attachControl(true)

      if( engine.getScreenAspectRatio() < 0.9 ) {
        // Moving camera further in case it's narrow portrait (smartphone)
        //scene.activeCamera.position.z += 3.0/engine.getScreenAspectRatio()
        scene.activeCamera.position.z -= 3.0
        scene.activeCamera.rotation.x += 0.08
      } else {
        // Moving camera left in case the screen is landscape
        scene.activeCamera.position.x += 2.1
      }

      setTimeout(function() {
        //var camera = new BABYLON.DeviceOrientationCamera("ActiveCamera", scene.activeCamera.globalPosition, scene)
        var camera = new BABYLON.FreeCamera("ActiveCamera", scene.activeCamera.globalPosition, scene)
        // Return camera to original rotation
        scene.onBeforeRenderObservable.add(() => {
          // Custom camera rotation with return back home
          if( camera._originalRotationQuaternion == undefined ) {
            camera._originalRotationQuaternion = scene.activeCamera.rotationQuaternion.clone()

            // Attach mouse events to the body to catch all the mouse movements for camera
            document.addEventListener('mousemove', function(evt) {
              var offsetX = evt.movementX
              if( scene.useRightHandedSystem ) {
                  offsetX *= -1
              }
              if( camera.parent && camera.parent._getWorldMatrixDeterminant() < 0 ) {
                  offsetX *= -1
              }
              camera.cameraRotation.y += offsetX * 0.00001

              const offsetY = evt.movementY
              camera.cameraRotation.x += offsetY * 0.00001
            })

            // Attach touch events
            var prev_touchX = null
            var prev_touchY = null
            document.addEventListener('touchmove', function(e) {
              var offsetX = -event.changedTouches[0].pageX + prev_touchX
              var offsetY = -event.changedTouches[0].pageY + prev_touchY
              camera.cameraRotation.y += offsetX * 0.0001
              camera.cameraRotation.x += offsetY * 0.0001
              prev_touchX = event.changedTouches[0].pageX
              prev_touchY = event.changedTouches[0].pageY
            })
            document.addEventListener('touchstart', function(e) {
              prev_touchX = event.changedTouches[0].pageX
              prev_touchY = event.changedTouches[0].pageY
            })

            // TODO: Not working that well, need additional changes
            // Attach device orientation events
            /*var prev_alpha = null
            var prev_beta = null
            var prev_gamma = null
            window.addEventListener('deviceorientation', function(evt) {
              var alpha = evt.alpha !== null ? evt.alpha : 0
              if( alpha == 0 )
                return
              var beta = evt.beta !== null ? evt.beta : 0
              var gamma = evt.gamma !== null ? evt.gamma : 0

              if( prev_alpha != null ) {
                // TODO: Better to use something like the commented logic
                // https://github.com/BabylonJS/Babylon.js/blob/4828f81/packages/dev/core/src/Cameras/Inputs/freeCameraDeviceOrientationInput.ts#L217
                camera.cameraRotation.y += (prev_gamma - gamma) * 0.0001
                camera.cameraRotation.x += (prev_beta - beta) * 0.0001
              }

              prev_alpha = alpha
              prev_beta = beta
              prev_gamma = gamma

              //BABYLON.Quaternion.RotationYawPitchRollToRef(
              //  BABYLON.Tools.ToRadians(alpha),
              //  BABYLON.Tools.ToRadians(beta),
              //  -BABYLON.Tools.ToRadians(gamma),
              //  camera.rotationQuaternion)
              //camera.rotationQuaternion.multiplyInPlace(this._screenQuaternion)
              //camera.rotationQuaternion.multiplyInPlace(this._constantTranform)
              //
              ////Mirror on XY Plane
              //camera.rotationQuaternion.z *= -1
              //camera.rotationQuaternion.w *= -1
            })*/
          }

          // If rotation is not the same as original one - rotate towards home
          if( !BABYLON.Quaternion.AreClose(camera._originalRotationQuaternion, camera.rotationQuaternion, 0.00001) ) {
            const resultValue = camera._originalRotationQuaternion.clone()
            if( BABYLON.Quaternion.Dot(camera.rotationQuaternion, camera._originalRotationQuaternion) < 0 ) {
              resultValue.scaleInPlace(-1)
            }
            camera.rotationQuaternion = BABYLON.Quaternion.Slerp(camera.rotationQuaternion, resultValue, 0.1);
          }

        })
        switchCamera(camera, scene, true)
        // We're using custom controls, so don't need any built-in camera inputs
        camera.inputs.clear()
      }, 100)
    } else {
      scene.activeCamera = new BABYLON.DeviceOrientationCamera("ActiveCamera", BABYLON.Vector3.Zero(), scene)
      scene.activeCamera.attachControl(true)
      scene.activeCamera.speed = 0.5
      scene.activeCamera.minZ = 0.1
      scene.activeCamera.maxZ = 1000.0
    }

    // Start all the animations
    for( var anim of gltf.animationGroups ) {
      anim.play(true)
    }
  }, function(e) {
    // Progress printing
    engine.loadingUIText = "Loaded: " + (e.loaded/e.total*100.0).toFixed(0) + "%"
  }, function(scene, msg, exc) {
    // On error
    logError("Exception during loading main scene: " + msg + ": " + exc)
  })

  return scene
}

window.initFunction = async function() {
  // Change loader sceen picture
  BABYLON.DefaultLoadingScreen.DefaultLogoUrl = 'img/loading.jpg'

  // Check the parameters and process user key

  // Precompile material prior to running the scenes
  BABYLON.SceneLoader.OnPluginActivatedObservable.addOnce(function (loader) {
    loader.compileMaterials = true
  })

  // Using localized binaries for draco decompressor
  BABYLON.DracoCompression.Configuration = {
    decoder: {
      wasmUrl: "assets/draco_wasm_wrapper_gltf.js",
      wasmBinaryUrl: "assets/draco_decoder_gltf.wasm",
    }
  }

  // Custom extras loader to _metadata for material because for some reason it's erased somewhere in between
  // https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/loaders/src/glTF/2.0/Extensions/ExtrasAsMetadata.ts
  // https://babylonjs.medium.com/extending-the-gltf-loader-in-babylon-js-588e48fb692b
  function GLTFMaterialExtras(loader) {
    this.name = 'material_extras'
    this.enabled = true

    this.createMaterial = function(context, material, drawMode) {
      if( material.extras && Object.keys(material.extras).length > 0 ) {
        var mtl = loader.createMaterial(context, material, drawMode)
        const metadata = (mtl._metadata = mtl.metadata || {})
        const gltf = (metadata.gltf = metadata.gltf || {})
        gltf.extras = material.extras
        return mtl
      }
    }
    // TODO: The meshes are split by material and the metadata is lost in limb...
    //this.loadNodeAsync = function(context, node, assign) {
    //  var _this = this
    //  return this._loader.loadNodeAsync(context, node, function (babylonTransformNode) {
    //    _this._assignExtras(babylonTransformNode, node)
    //    assign(babylonTransformNode)
    //  })
    //}
  }
  BABYLON.GLTF2.GLTFLoader.RegisterExtension("material_extras", function(loader) { return new GLTFMaterialExtras(loader) })

  // Disable SceneLoader autoshow/hide of the loading screen to control it manually
  BABYLON.SceneLoader.ShowLoadingScreen = false

  // Creating engine
  var asyncEngineCreation = async function() {
    return createDefaultEngine()
  }
  window.engine = await asyncEngineCreation().catch(function(e) { logError(e) })
  if( !engine )
    throw 'engine should not be null.'

  // Show the loading screen and start the loop
  engine.displayLoadingUI()
  startRenderLoop(engine, canvas)

  // Loading assets
  window.scene_ui = await createSceneUI().catch(function(e) { logError(e) })
  window.scene = await createScene().catch(function(e) { logError(e) })
}

// Resize
window.addEventListener("resize", function () {
  engine.resize()
})
