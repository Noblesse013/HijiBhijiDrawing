// Get canvas and video elements
const drawCanvas = document.getElementById('drawCanvas');
const drawCtx = drawCanvas.getContext('2d');
const video = document.getElementById('video');
const liveCanvas = document.getElementById('liveCanvas');
const liveCtx = liveCanvas.getContext('2d');

// Set canvas dimensions
drawCanvas.width = window.innerWidth;
drawCanvas.height = window.innerHeight;
liveCanvas.width = 300;
liveCanvas.height = 200;

// Hand tracking model parameters
const modelParams = {
  flipHorizontal: true,
  maxNumBoxes: 5,
  iouThreshold: 0.5,
  scoreThreshold: 0.6,
};

// Drawing state variables
let prevX = null, prevY = null;
let pointerColor = 'red';

// Generate random color for drawing
const getRandomColor = () =>
  '#' + [...Array(6)].map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join('');

// Reset drawing state
const resetDrawing = () => {
  prevX = prevY = null;
};

// Draw based on hand gestures
const drawFromHand = (x, y, { isClosed = false, isOpen = false } = {}) => {
  if (isOpen) {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    resetDrawing();
    return;
  }

  if (isClosed) {
    pointerColor = getRandomColor();
    return;
  }

  if (prevX === null || prevY === null) {
    prevX = x;
    prevY = y;
  }

  drawCtx.strokeStyle = pointerColor;
  drawCtx.lineWidth = 3;
  drawCtx.lineCap = 'round';
  drawCtx.beginPath();
  drawCtx.moveTo(prevX, prevY);
  drawCtx.lineTo(x, y);
  drawCtx.stroke();

  prevX = x;
  prevY = y;
};

// Process hand tracking predictions
const processPredictions = (predictions, model) => {
  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  model.renderPredictions(predictions, liveCanvas, liveCtx, video);

  const gestures = {
    open: predictions.find(p => p.label === "open"),
    closed: predictions.find(p => p.label === "closed"),
    point: predictions.find(p => p.label === "point"),
  };

  if (gestures.open) {
    drawFromHand(0, 0, { isOpen: true });
    return;
  }

  const activeGesture = gestures.closed || gestures.point;
  if (activeGesture) {
    const [x, y, w, h] = activeGesture.bbox;
    // Map from video coordinates to full canvas coordinates
    const centerX = (x + w / 2) / liveCanvas.width * drawCanvas.width;
    const centerY = (y + h / 2) / liveCanvas.height * drawCanvas.height;
    drawFromHand(centerX, centerY, {
      isClosed: !!gestures.closed,
      isOpen: false,
    });
  } else {
    resetDrawing();
  }
};

// Run hand tracking detection
const runHandTracking = async () => {
  const model = await handTrack.load(modelParams);
  setInterval(async () => {
    const predictions = await model.detect(video);
    processPredictions(predictions, model);
  }, 100);
};

// Start video feed and hand tracking
const startVideoFeed = async () => {
  const status = await handTrack.startVideo(video);
  if (status) {
    await navigator.mediaDevices.getUserMedia({ video: true });
    runHandTracking();
  } else {
    alert("Please enable video access.");
  }
};

// Save drawing function
function saveDrawing() {
  const link = document.createElement('a');
  link.download = 'handtrack_drawing.png';
  link.href = drawCanvas.toDataURL('image/png');
  link.click();
}

// Handle window resize
window.addEventListener('resize', () => {
  drawCanvas.width = window.innerWidth;
  drawCanvas.height = window.innerHeight;
  liveCanvas.width = 300;
  liveCanvas.height = 200;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});

// Start everything when page loads
document.addEventListener('DOMContentLoaded', () => {
  startVideoFeed();
});
