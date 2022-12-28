var canvas = document.getElementById("renderCanvas")

var startRenderLoop = function( engine, canvas ) {
  engine.runRenderLoop(function() {
    if( sceneToRender && sceneToRender.activeCamera ) {
      sceneToRender.render()
    }
  })
}

var engine = null
var scene = null
var sceneToRender = null
var createDefaultEngine = function() {
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: false })
}

var switchCamera = function( camera ) {
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
  camera.speed = scene.activeCamera.speed
  camera.postProcesses = scene.activeCamera.postProcesses
  scene.activeCamera.postProcesses = []

  scene.activeCamera.detachControl(canvas)
  if( scene.activeCamera.dispose ) {
    scene.activeCamera.dispose()
  }
  scene.activeCamera = camera
  scene.activeCamera.attachControl(canvas)
}

var createScene = async function() {
  engine.loadingUIText = 'Creating the scene...'
  const scene = new BABYLON.Scene(engine)
  scene.clearColor = new BABYLON.Color3(0.2, 0.8, 1.0)
  // TODO: Use the aggressive optimizations - not works that well...
  //scene.performancePriority = BABYLON.ScenePerformancePriority.Aggressive

  // Set up fog
  //scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR
  //scene.fogColor = new BABYLON.Color3(0.1, 0.1, 0.1)
  //scene.fogStart = 100.0
  //scene.fogEnd = 200.0

  // Set up new rendering pipeline and bloom
  var pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene)
  scene.imageProcessingConfiguration.toneMappingEnabled = true
  scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES
  scene.imageProcessingConfiguration.exposure = 1
  //pipeline.bloomEnabled = true
  pipeline.bloomThreshold = 0.5
  pipeline.bloomWeight = 1.0
  pipeline.bloomKernel = 32
  pipeline.bloomScale = 0.5

  // Glow layer for candles and others
  const gl = new BABYLON.GlowLayer("glow", scene)
  //gl.customEmissiveColorSelector = function(mesh, sub, mat, result) {
    /*if( mat.metadata?.gltf?.extras?.Emission === undefined ) {
      result.set(0, 0, 0, 0)
    } else {*/
      //result.set(mat.emissiveColor.r, mat.emissiveColor.g, mat.emissiveColor.b, mat.emissiveColor.a)
    //}
      //console.log("mesh: ", mesh.name)
      //result.set(1, 0, 1, 1)
  //}

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
  }
  BABYLON.GLTF2.GLTFLoader.RegisterExtension("material_extras", function(loader) { return new GLTFMaterialExtras(loader) })

  // TODO: Overriding createEffect to add outline shader modifications
  /*BABYLON.Engine.prototype._createEffect = BABYLON.Engine.prototype.createEffect
  BABYLON.Engine.prototype.createEffect = function(baseName, attributesNamesOrOptions, uniformsNamesOrEngine, samplers, defines, fallbacks, onCompiled, onError, indexParameters, shaderLanguage) {
    if( baseName == 'outline' ) {
      // Adding modelViewProjection to the outline effect
      uniformsNamesOrEngine.push('world')
      //console.log(uniformsNamesOrEngine)
    }
    return this._createEffect(baseName, attributesNamesOrOptions, uniformsNamesOrEngine, samplers, defines, fallbacks, onCompiled, onError, indexParameters, shaderLanguage)
  }*/

  /*scene.registerBeforeRender(function() {
    outline_effects.forEach(function( mesh ) {
  })*/

  engine.loadingUIText = 'Loading materials...'
  const toon_default_mat = await BABYLON.NodeMaterial.ParseFromFileAsync("toon_default", "data/toon_default.json", scene)
  const toon_transparent_mat = await BABYLON.NodeMaterial.ParseFromFileAsync("toon_transparent", "data/toon_transparent.json", scene)
  const emissive_mat = new BABYLON.StandardMaterial("emission", scene)

  engine.loadingUIText = 'Loading models...'
  var gltf = BABYLON.SceneLoader.Append("", "model.glb", scene, function(gltf) {
    engine.loadingUIText = 'Model loaded!'

    // Processing meshes
    for( var mesh of gltf.meshes ) {
      // Skipping instances - they will use origin settings anyway
      // Skipping meshes without material
      // Skipping skybox mesh
      if( mesh.isAnInstance || !mesh.material )
        continue

      engine.loadingUIText = 'Processing mesh `'+mesh.name+'`...'

      // Use custom loaded metadata loaded by GLTFMaterialExtras
      const metadata = Object.assign((mesh.material.metadata || {}), mesh.material._metadata || {})

      // Replace material to toon
      var mat = gltf.getMaterialByName(mesh.material.name+"_gen")
      if( !mat ) {
        // Create new material
        if( metadata?.gltf?.extras?.Transparent === undefined ) {
          if( metadata?.gltf?.extras?.Emission === undefined ) {
            mat = toon_default_mat.clone(mesh.material.name+"_gen")
          } else {
            mat = emissive_mat.clone(mesh.material.name+"_gen")
          }
        } else {
          mat = toon_transparent_mat.clone(mesh.material.name+"_gen")
          mat.getInputBlockByPredicate((b) => b.name === "Transparency").value = metadata.gltf.extras.Transparent
        }
        mat.metadata = metadata

        // If we don't need glosiness - cut it off
        if( metadata?.gltf?.extras?.SpecularIntensity !== undefined ) {
          mat.getInputBlockByPredicate((b) => b.name === "SpecularIntensity").value = metadata.gltf.extras.SpecularCutoff
        }

        // For some models we don't need RimIntensity since it's adds highlight where it's not needed
        if( metadata?.gltf?.extras?.RimIntensity !== undefined ) {
          mat.getInputBlockByPredicate((b) => b.name === "RimIntensity").value = metadata.gltf.extras.RimIntensity
        }

        // Set the material color
        if( mesh.material.emissiveColor ) {
          if( mat.metadata?.gltf?.extras?.Emission === undefined ) {
            mat.getInputBlockByPredicate((b) => b.name === "SurfaceColor").value = mesh.material.emissiveColor
          } else {
            mat.emissiveColor = mesh.material.emissiveColor
          }

          if( mat.metadata?.gltf?.extras?.Edges != undefined ) {
            mesh.enableEdgesRendering(0.99999) // Draw every bit except for really smooth surfaces
            mesh.edgesWidth = mat.metadata.gltf.extras.Edges * 10.0
            mesh.edgesColor = mesh.material.emissiveColor.multiply(new BABYLON.Color4(0.99, 0.99, 0.99, 1.0)).toColor4()
          }
        }
        // Allow backface culling from original material
        mat.backFaceCulling = mesh.material.backFaceCulling
      }

      // Set the mesh material
      mesh.material = mat

      if( mat.metadata?.gltf?.extras?.Outline != 0 ) {
        mesh.renderOutline = true
        mesh.outlineColor = new BABYLON.Color3(0.0, 0.0, 0.0)
        mesh.outlineWidth = 0.03 * (mat.metadata?.gltf?.extras?.Outline || 1.0)
      }

      if( mat.name.startsWith('Ground') ) {
        var firefliesEmitter = new BABYLON.ParticleSystem('fireflies', 200, scene)
        firefliesEmitter.particleTexture = new BABYLON.Texture('textures/firefly.png', scene)
        firefliesEmitter.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE
        //firefliesEmitter.updateSpeed = 0.003

        firefliesEmitter.minLifeTime = 10
        firefliesEmitter.maxLifeTime = 100

        firefliesEmitter.minSize = 0.05
        firefliesEmitter.maxSize = 0.1

        firefliesEmitter.color1 = new BABYLON.Color4(1.0, 0.9, 0.2, 1.0)
        firefliesEmitter.color2 = new BABYLON.Color4(0.7, 0.5, 0.0, 1.0)
        firefliesEmitter.colorDead = new BABYLON.Color4(0.2, 0.2, 0.2, 0.0)

        var noiseTexture = new BABYLON.NoiseProceduralTexture("perlin", 256, scene, null, false)
        noiseTexture.animationSpeedFactor = 5
        noiseTexture.persistence = 2
        noiseTexture.brightness = 0.6
        noiseTexture.octaves = 3

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
      /*if( !mesh.name.startsWith('Ground') ) {
        mesh.simplify([{ quality: 0.5, distance: 80 }, { quality: 0.1, distance: 180 }],
          true,
          BABYLON.SimplificationType.QUADRATIC
        )
      }*/
    }

    toon_default_mat.dispose()
    toon_transparent_mat.dispose()
    emissive_mat.dispose()

    // Removing the not generated materials
    gltf.materials.forEach(function(mat) {
      if( !mat.name.endsWith("_gen") ) {
        // Remove existing material
        mat.dispose()
      }
    })

    // Processing skeletons
    engine.loadingUIText = 'Processing armatures...'
    gltf.skeletons.forEach(function( skel ) {
      //Dragon Scale: 0.189
      // If the mesh have skeleton than
      skel.bones.forEach(function( bone ) {
        if( bone.name.startsWith("ik_target") ) {
          // DEBUG: Simple bending the ik_target bone
          console.log(bone.name, bone.getParent())
          bone.getParent().getTransformNode().rotate(BABYLON.Axis.X, .4)
        }
      })
      //angularSensibilityY
      //var ikCtl = new BABYLON.BoneIKController(mesh, skeleton.bones[14], {targetMesh:target, poleTargetMesh:poleTarget, poleAngle: Math.PI})
    })

    engine.loadingUIText = 'Cleaning and completing...'

    // Setup skybox
    const skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene)
    const skyboxMaterial = new BABYLON.StandardMaterial("skyBox", scene)
    skyboxMaterial.backFaceCulling = false
    skyboxMaterial.reflectionTexture = new BABYLON.CubeTexture("textures/skybox", scene)
    skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE
    skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0)
    skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0)
    skyboxMaterial.disableLighting = true
    skybox.material = skyboxMaterial

    // Set camera position
    if( scene.cameras.length > 0 ) {
      scene.activeCamera = scene.cameras[0]
      scene.activeCamera.attachControl(true)

      setTimeout(function() {
        var camera = new BABYLON.DeviceOrientationCamera("ActiveCamera", scene.activeCamera.globalPosition, scene)
        //var camera = new BABYLON.ArcRotateCamera("ActiveCamera", 0, Math.PI / 2, 12, scene.activeCamera.globalPosition, scene)
        switchCamera(camera)
        // TODO: Set the device camera to initially look at the direction of scene camera
        // https://doc.babylonjs.com/typedoc/classes/BABYLON.DeviceOrientationCamera#resetToCurrentRotation
        // https://forum.babylonjs.com/t/switching-between-freecamera-and-deviceorientationcamera/5973/12
        // https://playground.babylonjs.com/#D3HXVZ#18
        // https://www.eternalcoding.com/understanding-deviceorientation-events-by-creating-a-small-3d-game-with-babylon-js/
        //scene.activeCamera.resetToCurrentRotation(BABYLON.Axis.Y)
      }, 100)
    } else {
      scene.activeCamera = new BABYLON.DeviceOrientationCamera("ActiveCamera", BABYLON.Vector3.Zero(), scene)
      scene.activeCamera.attachControl(true)
    }
  }, function(e) { engine.loadingUIText = "Loaded: " + (e.loaded/e.total*100.0).toFixed(0) + "%" })

  return scene
}

window.initFunction = async function() {
  var asyncEngineCreation = async function() {
    try {
      return createDefaultEngine()
    } catch(e) {
      console.log("the available createEngine function failed. Creating the default engine instead")
      return createDefaultEngine()
    }
  }

  window.engine = await asyncEngineCreation()
  if (!engine) throw 'engine should not be null.'
  startRenderLoop(engine, canvas)
  window.scene = await createScene()
}

initFunction().then(() => {
  // TODO: Modify outline vertex shader to allow clip-space outlines
  // Those should be permanent pixel width depends on how far the camera is
  // https://www.videopoetics.com/tutorials/pixel-perfect-outline-shaders-unity/
  // https://learnopengl.com/Getting-started/Coordinate-Systems
  // https://alexanderameye.github.io/notes/rendering-outlines/
  // https://github.com/BabylonJS/Babylon.js/blob/874972b/packages/dev/core/src/Rendering/outlineRenderer.ts#L338
  // https://github.com/BabylonJS/Babylon.js/blob/874972b/packages/dev/core/src/Shaders/outline.vertex.fx
  // https://forum.babylonjs.com/t/babylonjs-equivalent-of-threejss-modelviewmatrix/28803/18
  /*BABYLON.Effect.ShadersStore.outlineVertexShader = `
// Attribute
attribute vec3 position;
attribute vec3 normal;

#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>

#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]

#include<clipPlaneVertexDeclaration>

// Uniform
uniform float offset;

#include<instancesDeclaration>

uniform mat4 viewProjection;

#ifdef ALPHATEST
varying vec2 vUV;
uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif

#include<logDepthDeclaration>


#define CUSTOM_VERTEX_DEFINITIONS

void main(void)
{
  vec3 positionUpdated = position;
  vec3 normalUpdated = normal;
#ifdef UV1
  vec2 uvUpdated = uv;
#endif

#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]

#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>

  //vec4 clipPosition = (finalWorld * viewProjection) * vec4(positionUpdated, 1.0);
  vec3 offsetPosition = positionUpdated + (normalUpdated * offset);
  //vec4 clipNormal = viewProjection * (finalWorld * vec4(normalUpdated, 1.0));

  //vec2 offsetPosition = vec2(-5.0, 5.0);//normalize(clipNormal.xy) * offset + 5.0;
  //clipPosition.xy += offsetPosition;
  vec4 worldPos = finalWorld * vec4(offsetPosition, 1.0);

  //gl_Position = clipPosition;
  gl_Position = viewProjection * worldPos;

#ifdef ALPHATEST
#ifdef UV1
  vUV = vec2(diffuseMatrix * vec4(uvUpdated, 1.0, 0.0));
#endif
#ifdef UV2
  vUV = vec2(diffuseMatrix * vec4(uv2, 1.0, 0.0));
#endif
#endif
#include<clipPlaneVertex>
#include<logDepthVertex>
}
  `*/
  sceneToRender = scene                    
})

// Resize
window.addEventListener("resize", function () {
  engine.resize()
})
