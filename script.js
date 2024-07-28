console.clear();

// Config
const idleRPM = 800;
const idleWiggleRange = 32; // RPM
const idleWigglePeriod = 1400; // MS
const warnRPM = 6000;
const fuelCutoffRPM = 7500;
const fuelCutoffRestart = 7100;

// Collection of SVG nodes accessed in code.
// CSS selector values are converted into elements.
const nodes = {
  root: 'svg',
  needleGroup: '.needle-group',
  needle: '.needle',
  needleReflection: '.needle-reflection',
  needleMarker: '.needle-marker' };


Object.keys(nodes).forEach(key => {
  nodes[key] = document.querySelector(nodes[key]);
});


function getTorqueFromRPM(rpm) {
  return (rpm / 7500) ** 0.76 * 0.6 + 0.4;
}

function getNeedleAngleFromRPM(rpm) {
  const start = -140;
  const angle = start + 28 * (rpm / 1000);
  // Limit decimal digits - value used as an element attribute.
  // Value will be small, so an easy multiply-and-round solution is fine.
  return Math.round(angle * 1000) / 1000;
}

function shouldWarnRPM(rpm) {
  return rpm >= warnRPM;
}


// UI Manipulation

function setNeedlePosition(rpm) {
  nodes.needleGroup.style.transform = `rotate(${getNeedleAngleFromRPM(rpm)}deg)`;
  nodes.needleGroup.classList.toggle('warn', shouldWarnRPM(rpm));
}

let needleMarkerVisible = false;
let markerFadeTimerId = null;
function showNeedleMarker() {
  needleMarkerVisible = true;
  clearTimeout(markerFadeTimerId);
  markerFadeTimerId = null;
  nodes.needleMarker.classList.remove('hide');
  nodes.needleMarker.classList.remove('fade');
}

function hideNeedleMarker(fade) {
  if (needleMarkerVisible) {
    nodes.needleMarker.classList.add('hide');
    nodes.needleMarker.classList.toggle('fade', !!fade);

    if (fade) {
      if (!markerFadeTimerId) {
        markerFadeTimerId = setTimeout(() => {
          markerFadeTimerId = null;
          peakMarkerRPM = 0;
          localPeakRPM = 0;
          needleMarkerVisible = false;
        }, 1000);
      }
    } else
    {
      clearTimeout(markerFadeTimerId);
      peakMarkerRPM = 0;
      needleMarkerVisible = false;
    }
  }
}

let markerTimerId;
let peakMarkerRPM = 0;
function setNeedleMarkerPosition(rpm) {
  if (rpm >= peakMarkerRPM && rpm > 0) {
    peakMarkerRPM = rpm;
    localPeakRPM = 0;
    showNeedleMarker();
    nodes.needleMarker.style.transform = `rotate(${getNeedleAngleFromRPM(rpm)}deg)`;
    nodes.needleMarker.classList.toggle('warn', shouldWarnRPM(rpm));

    clearTimeout(markerTimerId);
    markerTimerId = setTimeout(() => {
      hideNeedleMarker(true);
    }, 1000);
  }
}




// Initialize

// Show SVG after document is ready and JS is executing.
setTimeout(() => {
  nodes.root.classList.add('ready');
  // There's an odd Chrome bug where setting an SVG element's transform too early puts it in a wonky position.
  // So, delay it another tick. The fade in animation helps cover this up.
  setTimeout(() => {
    // Set initial needle position.
    setNeedlePosition(rpm);
  }, 0);
}, 0);

// Mutable state
let throttle = 0;
let rpm = idleRPM;
let localPeakRPM = idleRPM;
let slowdownMultiplier = 0;
let idling = true;
let idleStartTime = 0;
let fuelCut = false;

function openThrottle() {
  throttle = 1;
}

function closeThrottle() {
  throttle = 0;
  setNeedleMarkerPosition(localPeakRPM);
}

let lastTouchEndTime = 0;
const recentTouch = () => Date.now() - lastTouchEndTime < 200;
window.addEventListener('mousedown', () => {
  !recentTouch() && openThrottle();
});
window.addEventListener('mouseup', () => {
  !recentTouch() && closeThrottle();
});
window.addEventListener('touchstart', openThrottle);
window.addEventListener('touchend', () => {
  lastTouchEndTime = Date.now();
  closeThrottle();
});


// Run event loop
Ticker.addListener(function tick(frameTime, lag) {
  const now = Date.now();

  if (throttle > 0 && !fuelCut) {
    idling = false;
    slowdownMultiplier = 0;

    rpm += frameTime * 15 * throttle * getTorqueFromRPM(rpm);
    if (rpm > fuelCutoffRPM) {
      fuelCut = true;
      rpm = fuelCutoffRPM;
    }

    if (needleMarkerVisible && rpm > peakMarkerRPM) {
      hideNeedleMarker();
    }

    if (rpm > localPeakRPM) {
      localPeakRPM = rpm;
    }
  } else {
    if (idling) {
      rpm = -Math.sin((now - idleStartTime) / (idleWigglePeriod / (Math.PI * 2))) * idleWiggleRange + idleRPM;
    } else
    {
      slowdownMultiplier += frameTime / 240;
      const maxSlowdown = rpm > 4000 ? 1 : rpm / 4000 * 0.9 + 0.1;
      if (slowdownMultiplier > maxSlowdown) {
        slowdownMultiplier = maxSlowdown;
      }
      rpm -= frameTime * 6 * slowdownMultiplier;
      if (rpm < idleRPM) {
        rpm = idleRPM;
        idling = true;
        idleStartTime = now;
      }
    }

    if (fuelCut && rpm <= fuelCutoffRestart) {
      fuelCut = false;
    }
  }


  setNeedlePosition(rpm);
});