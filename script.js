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

// Hand tracking model parameters - Enhanced for better performance
const modelParams = {
  flipHorizontal: true,
  maxNumBoxes: 2, // Reduced for better performance
  iouThreshold: 0.3, // Lower threshold for better detection
  scoreThreshold: 0.7, // Higher confidence threshold
};

// Drawing state variables
let prevX = null, prevY = null;
let pointerColor = 'red';
let isDrawing = false;

// Smoothing variables for better tracking
let smoothingBuffer = [];
const smoothingFactor = 0.7; // How much to smooth (0-1, higher = more smoothing)
const bufferSize = 3; // Number of previous positions to consider

// Performance optimization
let lastDetectionTime = 0;
const detectionInterval = 50; // ms between detections (20 FPS instead of 10)

// Enhanced gesture detection
let gestureHistory = {
  open: [],
  closed: [],
  point: []
};
const gestureBufferSize = 5;

// Generate random color for drawing
const getRandomColor = () =>
  '#' + [...Array(6)].map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join('');

// Smooth position using moving average
const smoothPosition = (x, y) => {
  smoothingBuffer.push({ x, y });
  if (smoothingBuffer.length > bufferSize) {
    smoothingBuffer.shift();
  }

  if (smoothingBuffer.length === 1) {
    return { x, y };
  }

  // Calculate weighted average
  let totalWeight = 0;
  let smoothX = 0;
  let smoothY = 0;

  for (let i = 0; i < smoothingBuffer.length; i++) {
    const weight = (i + 1) / smoothingBuffer.length; // More recent positions have higher weight
    smoothX += smoothingBuffer[i].x * weight;
    smoothY += smoothingBuffer[i].y * weight;
    totalWeight += weight;
  }

  return {
    x: smoothX / totalWeight,
    y: smoothY / totalWeight
  };
};

// Enhanced gesture detection with history
const detectGesture = (predictions) => {
  const currentGestures = {
    open: predictions.filter(p => p.label === "open"),
    closed: predictions.filter(p => p.label === "closed"),
    point: predictions.filter(p => p.label === "point")
  };

  // Add to history
  Object.keys(currentGestures).forEach(gesture => {
    gestureHistory[gesture].push(currentGestures[gesture].length > 0);
    if (gestureHistory[gesture].length > gestureBufferSize) {
      gestureHistory[gesture].shift();
    }
  });

  // Determine stable gesture (majority vote)
  const stableGestures = {};
  Object.keys(gestureHistory).forEach(gesture => {
    const trueCount = gestureHistory[gesture].filter(Boolean).length;
    stableGestures[gesture] = trueCount > gestureBufferSize / 2;
  });

  // Return the most confident gesture
  if (stableGestures.open) return { type: 'open', data: currentGestures.open[0] };
  if (stableGestures.closed) return { type: 'closed', data: currentGestures.closed[0] };
  if (stableGestures.point) return { type: 'point', data: currentGestures.point[0] };
  
  return null;
};

// Reset drawing state
const resetDrawing = () => {
  prevX = prevY = null;
  isDrawing = false;
  smoothingBuffer = [];
};

// Enhanced drawing function with better line smoothing
const drawFromHand = (x, y, { isClosed = false, isOpen = false } = {}) => {
  if (isOpen) {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    resetDrawing();
    return;
  }

  if (isClosed) {
    if (!isDrawing) {
      pointerColor = getRandomColor();
      isDrawing = true;
    }
    return;
  }

  if (!isDrawing) return;

  // Apply position smoothing
  const smoothed = smoothPosition(x, y);
  
  if (prevX === null || prevY === null) {
    prevX = smoothed.x;
    prevY = smoothed.y;
    return;
  }

  // Calculate distance for adaptive line width
  const distance = Math.sqrt((smoothed.x - prevX) ** 2 + (smoothed.y - prevY) ** 2);
  const dynamicLineWidth = Math.max(2, Math.min(8, 150 / (distance + 1)));

  drawCtx.strokeStyle = pointerColor;
  drawCtx.lineWidth = dynamicLineWidth;
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  
  // Use quadratic curves for smoother lines
  drawCtx.beginPath();
  const midX = (prevX + smoothed.x) / 2;
  const midY = (prevY + smoothed.y) / 2;
  drawCtx.moveTo(prevX, prevY);
  drawCtx.quadraticCurveTo(prevX, prevY, midX, midY);
  drawCtx.stroke();

  prevX = smoothed.x;
  prevY = smoothed.y;
};

// Enhanced prediction processing with better gesture detection
const processPredictions = (predictions, model) => {
  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  model.renderPredictions(predictions, liveCanvas, liveCtx, video);

  // Use enhanced gesture detection
  const gesture = detectGesture(predictions);
  
  if (!gesture) {
    isDrawing = false;
    return;
  }

  if (gesture.type === 'open') {
    drawFromHand(0, 0, { isOpen: true });
    return;
  }

  if (gesture.data) {
    const [x, y, w, h] = gesture.data.bbox;
    // Map from video coordinates to full canvas coordinates with bounds checking
    const centerX = Math.max(0, Math.min(drawCanvas.width, (x + w / 2) / liveCanvas.width * drawCanvas.width));
    const centerY = Math.max(0, Math.min(drawCanvas.height, (y + h / 2) / liveCanvas.height * drawCanvas.height));
    
    drawFromHand(centerX, centerY, {
      isClosed: gesture.type === 'closed',
      isOpen: false,
    });
  }
};

// Enhanced hand tracking with optimized performance
const runHandTracking = async () => {
  const model = await handTrack.load(modelParams);
  
  const detect = async () => {
    const currentTime = Date.now();
    
    // Skip detection if not enough time has passed (performance optimization)
    if (currentTime - lastDetectionTime < detectionInterval) {
      requestAnimationFrame(detect);
      return;
    }
    
    lastDetectionTime = currentTime;
    
    try {
      const predictions = await model.detect(video);
      processPredictions(predictions, model);
    } catch (error) {
      console.warn('Detection error:', error);
    }
    
    requestAnimationFrame(detect);
  };
  
  detect();
};

// Enhanced video setup with better constraints
const startVideoFeed = async () => {
  try {
    // Request higher quality video for better tracking
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user'
      }
    });
    
    video.srcObject = stream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        resolve();
      };
    });
    
    const status = await handTrack.startVideo(video);
    if (status) {
      console.log('Hand tracking started successfully');
      runHandTracking();
    } else {
      alert("Please enable video access.");
    }
  } catch (error) {
    console.error('Video setup error:', error);
    alert("Camera access denied or not available.");
  }
};

// Save drawing function
function saveDrawing() {
  const link = document.createElement('a');
  link.download = 'handtrack_drawing.png';
  link.href = drawCanvas.toDataURL('image/png');
  link.click();
}

// Handle window resize with cleanup
window.addEventListener('resize', () => {
  drawCanvas.width = window.innerWidth;
  drawCanvas.height = window.innerHeight;
  liveCanvas.width = 300;
  liveCanvas.height = 200;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  
  // Reset tracking state on resize
  resetDrawing();
});

// Start everything when page loads
document.addEventListener('DOMContentLoaded', () => {
  startVideoFeed();
});
