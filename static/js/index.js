// WARNING: Initial file have to work in IE to show the error message, so please keep it simple

var logError = function(msg) {
  var err = document.createElement('div')
  err.innerHTML = msg
  var container = document.getElementById('errorContainer')
  container.insertBefore(err, container.firstChild)
  container.removeAttribute('style')
}

if(/MSIE|Trident|Edge?\/\d./i.test(window.navigator.userAgent)) {
  logError('Sorry, but Internet Exporer and Edge browsers are not supported, please download <a href="https://www.mozilla.org/">Firefox</a> for god sake.')
}

try {
  initFunction().then(function() {
    scene_render = scene
    scene_ui_render = scene_ui
  })
} catch( e ) {
  logError(e)
  throw e
}
