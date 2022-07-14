import {
  EventDispatcher,
  Quaternion,
  MathUtils,
  Euler,
} from 'three';

// Reworked https://github.com/richtr/threeVR
class DeviceOrientationController extends EventDispatcher {
  constructor( object, domElement ) {
    super();

    this.object = object;
    this.element = domElement || document;
    var origQuat = this.object.quaternion.clone();

    this.freeze = true;

    this.enableManualDrag = true; // enable manual user drag override control by default
    this.multiplier = 0.2;

    this.deviceOrientation = {};
    this.screenOrientation = window.orientation || 0;

    // Manual rotate override components
    var startX = 0, startY = 0,
        currentX = 0, currentY = 0,
        scrollSpeedX, scrollSpeedY,
        tmpQuat = new Quaternion();

    var CONTROLLER_STATE = {
      AUTO: 0,
      MANUAL_ROTATE: 1,
    };

    var appState = CONTROLLER_STATE.AUTO;

    var CONTROLLER_EVENT = {
      CALIBRATE_COMPASS:  'compassneedscalibration',
      SCREEN_ORIENTATION: 'orientationchange',
      MANUAL_CONTROL:     'userinteraction', // userinteractionstart, userinteractionend
      ROTATE_CONTROL:     'rotate',          // rotatestart, rotateend
    };

    var deviceQuat = new Quaternion();
    var initDeviceQuat = null;

    var fireEvent = function () {
      var eventData;

      return function ( name ) {
        eventData = arguments || {};

        eventData.type = name;
        eventData.target = this;

        this.dispatchEvent( eventData );
      }.bind( this );
    }.bind( this )();

    this.onDeviceOrientationChange = function ( event ) {
      this.deviceOrientation = event;
    }.bind( this );

    this.onScreenOrientationChange = function () {
      this.screenOrientation = window.orientation || 0;

      fireEvent( CONTROLLER_EVENT.SCREEN_ORIENTATION );
    }.bind( this );

    this.onCompassNeedsCalibration = function ( event ) {
      event.preventDefault();

      fireEvent( CONTROLLER_EVENT.CALIBRATE_COMPASS );
    }.bind( this );

    this.onDocumentMouseMoveInit = function ( event ) {
      if ( this.enableManualDrag !== true ) return;

      appState = CONTROLLER_STATE.MANUAL_ROTATE;

      this.freeze = true;

      tmpQuat.copy( this.object.quaternion );

      startX = currentX = window.innerWidth/2;
      startY = currentY = window.innerHeight/2;

      // Set consistent scroll speed based on current viewport width/height
      scrollSpeedX = ( 1200 / window.innerWidth ) * this.multiplier;
      scrollSpeedY = ( 800 / window.innerHeight ) * this.multiplier;

      this.element.removeEventListener( 'mousemove', this.onDocumentMouseMoveInit, false );
      this.element.addEventListener( 'mousemove', this.onDocumentMouseMove, false );
      fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'start' );
      fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'start' );
    }.bind( this );

    this.onDocumentMouseMove = function ( event ) {
      currentX = event.pageX;
      currentY = event.pageY;
    }.bind( this );

    this.onDocumentTouchStart = function ( event ) {
      event.preventDefault();
      event.stopPropagation();

      switch ( event.touches.length ) {
        case 1: // ROTATE
          if ( this.enableManualDrag !== true ) return;

          appState = CONTROLLER_STATE.MANUAL_ROTATE;

          this.freeze = true;

          tmpQuat.copy( this.object.quaternion );

          startX = currentX = event.touches[ 0 ].pageX;
          startY = currentY = event.touches[ 0 ].pageY;

          // Set consistent scroll speed based on current viewport width/height
          scrollSpeedX = ( 1200 / window.innerWidth ) * this.multiplier;
          scrollSpeedY = ( 800 / window.innerHeight ) * this.multiplier;

          this.element.addEventListener( 'touchmove', this.onDocumentTouchMove, false );
          this.element.addEventListener( 'touchend', this.onDocumentTouchEnd, false );

          fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'start' );
          fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'start' );

          break;
      }
    }.bind( this );

    this.onDocumentTouchMove = function ( event ) {
      switch( event.touches.length ) {
        case 1:
          currentX = event.touches[ 0 ].pageX;
          currentY = event.touches[ 0 ].pageY;
          break;
      }
    }.bind( this );

    this.onDocumentTouchEnd = function ( event ) {
      this.element.removeEventListener( 'touchmove', this.onDocumentTouchMove, false );
      this.element.removeEventListener( 'touchend', this.onDocumentTouchEnd, false );

      if ( appState === CONTROLLER_STATE.MANUAL_ROTATE ) {

        appState = CONTROLLER_STATE.AUTO; // reset control state

        this.freeze = false;

        fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'end' );
        fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'end' );
      }
    }.bind( this );

    var createQuaternion = function () {

      var finalQuaternion = new Quaternion();
      var deviceEuler = new Euler();
      var screenTransform = new Quaternion();
      var worldTransform = new Quaternion( - Math.sqrt(0.5), 0, 0, Math.sqrt(0.5) ); // - PI/2 around the x-axis
      var minusHalfAngle = 0;

      return function ( alpha, beta, gamma, screenOrientation ) {
        deviceEuler.set( beta, alpha, - gamma, 'YXZ' );
        finalQuaternion.setFromEuler( deviceEuler );
        minusHalfAngle = - screenOrientation / 2;
        screenTransform.set( 0, Math.sin( minusHalfAngle ), 0, Math.cos( minusHalfAngle ) );
        finalQuaternion.multiply( screenTransform );
        finalQuaternion.multiply( worldTransform );
        return finalQuaternion;
      }
    }();

    this.updateManualMove = function () {

      var lat, lon;
      var phi, theta;

      var rotation = new Euler( 0, 0, 0, 'YXZ' );

      var rotQuat = new Quaternion();
      var objQuat = new Quaternion();

      var tmpZ, objZ, realZ;

      return function () {

        objQuat.copy( tmpQuat );

        if ( appState === CONTROLLER_STATE.MANUAL_ROTATE ) {
          lat = -( startY - currentY ) * scrollSpeedY;
          lon = -( startX - currentX ) * scrollSpeedX;

          phi   = MathUtils.degToRad( lat );
          theta = MathUtils.degToRad( lon );

          rotQuat.set( 0, Math.sin( theta / 2 ), 0, Math.cos( theta / 2 ) );
          objQuat.multiply( rotQuat );
          rotQuat.set( Math.sin( phi / 2 ), 0, 0, Math.cos( phi / 2 ) );
          objQuat.multiply( rotQuat );

          // Remove introduced z-axis rotation and add device's current z-axis rotation

          tmpZ  = rotation.setFromQuaternion( tmpQuat, 'YXZ' ).z;
          objZ  = rotation.setFromQuaternion( objQuat, 'YXZ' ).z;
          realZ = rotation.setFromQuaternion( deviceQuat || tmpQuat, 'YXZ' ).z;

          rotQuat.set( 0, 0, Math.sin( ( realZ - tmpZ  ) / 2 ), Math.cos( ( realZ - tmpZ ) / 2 ) );
          tmpQuat.multiply( rotQuat );
          rotQuat.set( 0, 0, Math.sin( ( realZ - objZ  ) / 2 ), Math.cos( ( realZ - objZ ) / 2 ) );
          objQuat.multiply( rotQuat );

          this.object.quaternion.slerp( objQuat, 0.02 ); // smoothing
          //this.object.quaternion.copy( objQuat );
        }
      };
    }();

    this.updateDeviceMove = function () {

      var alpha, beta, gamma, orient, tmpQuat, oldx;

      return function () {
        alpha  = MathUtils.degToRad( this.deviceOrientation.alpha || 0 ); // Z
        beta   = MathUtils.degToRad( this.deviceOrientation.beta  || 0 ); // X'
        gamma  = MathUtils.degToRad( this.deviceOrientation.gamma || 0 ); // Y''
        orient = MathUtils.degToRad( this.screenOrientation       || 0 ); // O

        // only process non-zero 3-axis data
        if ( alpha !== 0 && beta !== 0 && gamma !== 0) {
          deviceQuat = createQuaternion( alpha, beta, gamma, orient );
          if( initDeviceQuat === null ) {
            initDeviceQuat = deviceQuat.clone();
            // Making the opposite rotation to simplify the reset process
            initDeviceQuat.invert();
          }
          if ( this.freeze ) return;

          // Reset device quaternion to the initial location
          deviceQuat.multiply(initDeviceQuat);
          deviceQuat.normalize();

          // Limit the rotation (poor version, but allows free rotation in screen plane)
          deviceQuat.set(deviceQuat.x, deviceQuat.y*0.1, deviceQuat.z*0.1, deviceQuat.w);
          deviceQuat.normalize();

          // Restore the device rotation - when it was multiplied to inverted it's getting a bit weird
          oldx = deviceQuat.x;
          deviceQuat.x = -deviceQuat.z;
          deviceQuat.z = oldx;

          // Getting copy of the original camera quaternion and apply the reset device rotation
          tmpQuat = origQuat.clone();
          tmpQuat.multiply(deviceQuat);
          tmpQuat.normalize();
          this.object.quaternion.slerp( tmpQuat, 0.02 ); // smoothing
          //this.object.quaternion.copy( tmpQuat );
        }
      };

    }();

    this.update = function () {
      this.updateDeviceMove();

      if ( appState !== CONTROLLER_STATE.AUTO ) {
        this.updateManualMove();
      }
    };

    this.connect = function () {
      initDeviceQuat = null
      origQuat = this.object.quaternion.clone();

      window.addEventListener( 'orientationchange', this.onScreenOrientationChange, false );
      window.addEventListener( 'deviceorientation', this.onDeviceOrientationChange, false );

      window.addEventListener( 'compassneedscalibration', this.onCompassNeedsCalibration, false );

      this.element.addEventListener( 'mousemove', this.onDocumentMouseMoveInit, false );
      this.element.addEventListener( 'touchstart', this.onDocumentTouchStart, false );

      this.freeze = false;
    };

    this.disconnect = function () {
      this.freeze = true;

      window.removeEventListener( 'orientationchange', this.onScreenOrientationChange, false );
      window.removeEventListener( 'deviceorientation', this.onDeviceOrientationChange, false );

      window.removeEventListener( 'compassneedscalibration', this.onCompassNeedsCalibration, false );

      this.element.removeEventListener( 'mousemove', this.onDocumentMouseMoveInit, false );
      this.element.removeEventListener( 'mousemove', this.onDocumentMouseMove, false );
      this.element.removeEventListener( 'touchstart', this.onDocumentTouchStart, false );
    };

    this.setRotationMultiplier = function(multiplier) {
      this.multiplier = multiplier;
    };
  }
};

export { DeviceOrientationController };
