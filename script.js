/*********************
 * Global Variables
 *********************/
import { convertImage, toHex, deepCopyPixels, hexToRGB, colorDistance } from './processor.js';

let currentStep = 1;
let gridWidth = 16, gridHeight = 16; // separate grid dimensions
let image = new Image();
let imgLoaded = false;

// For Step 2: positioning of source image
let imageScale = 1, offsetX = 0, offsetY = 0;
let dragStartX, dragStartY, dragStartOffsetX, dragStartOffsetY;

// For Step 3: pixel art data and canvas zoom
let pixelColors = []; // 2D array [row][col] with color strings (or "transparent")
let conversionBackup = []; // stores conversion result for potential reset
let canvasZoom = 1; // Zoom factor (each grid cell becomes canvasZoom × canvasZoom pixels)
let currentDrawColor = "#000000";
let drawingActive = false; // for left-click drawing

// For tool selection in Step 3
let currentTool = "brush"; // "brush", "eraser", "magicWand"

// For brush highlighting in Step 3
let highlightI = undefined;
let highlightJ = undefined;

// For recent colors (only added when drawing occurs)
let recentColors = [];

// Store canvas dimensions used during conversion (for CLI command generation)
let conversionCanvasWidth = 0;
let conversionCanvasHeight = 0;

// Undo/Redo history
let historyStack = [];
let redoStack = [];
let drawingOccurred = false; // flag to know if a drawing action occurred

// Preview cell size for Step 2 (in pixels); now controlled by a slider
let previewCellSize = 4;  // default value

// Magice wand default threshold
let magicWandThreshold = 5;

// Toggle between light and dark background
let isDarkBackground = true;


/*********************
 * DOM Elements
 *********************/
const step1Div = document.getElementById("step1");
const step2Div = document.getElementById("step2");
const step3Div = document.getElementById("step3");

const gridWidthSelect = document.getElementById("gridWidthSelect");
const gridHeightSelect = document.getElementById("gridHeightSelect");
const imageInput = document.getElementById("imageInput");
//const uploadBtn = document.getElementById("uploadBtn");

const zoomSlider = document.getElementById("zoomSlider");
const previewSizeSlider = document.getElementById("previewSizeSlider");
const previewSizeValue = document.getElementById("previewSizeValue");
const convMethodSelect = document.getElementById("convMethod");
const convertBtn = document.getElementById("convertBtn");
const resetPositionBtn = document.getElementById("resetPositionBtn");

const canvasZoomSlider = document.getElementById("canvasZoomSlider");
const resetCanvasZoomBtn = document.getElementById("resetCanvasZoomBtn");
const drawColorPicker = document.getElementById("drawColor");
const transparentBtn = document.getElementById("transparentBtn");
const brushSizeSelect = document.getElementById("brushSizeSelect");
const gridToggle = document.getElementById("gridToggle");
const recentColorsSection = document.getElementById("recentColorsSection");
const recentColorsContainer = document.getElementById("recentColorsContainer");
const resetEditBtn = document.getElementById("resetEditBtn");

// New tool buttons
const brushToolBtn = document.getElementById("brushToolBtn");
const eraserToolBtn = document.getElementById("eraserToolBtn");
const magicWandBtn = document.getElementById("magicWandBtn");

const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");
const mainContent = document.getElementById("mainContent");

// Offscreen canvas for image analysis
let originalCanvas = document.createElement("canvas");
let origCtx = originalCanvas.getContext("2d", { willReadFrequently: true });

// Magic Wand Threshold Slider
const magicWandThresholdSlider = document.getElementById("magicWandThresholdSlider");
const magicWandThresholdValue = document.getElementById("magicWandThresholdValue");
magicWandThresholdSlider.addEventListener("input", function() {
  magicWandThreshold = parseInt(this.value);
  magicWandThresholdValue.textContent = this.value;
});

// New global variables for grid color toggle (separate from background)
let isDarkGrid = true;
const gridLineColorDarkPreview = "rgba(255,255,255,0.5)";
const gridLineColorLightPreview = "rgba(0,0,0,0.5)";
const gridLineColorDarkEdit = "rgba(255,255,255,0.3)";
const gridLineColorLightEdit = "rgba(0,0,0,0.3)";


// Event listeners for new export buttons (Step 3)
document.getElementById("exportX1Btn").addEventListener("click", () => exportImage(1));
document.getElementById("exportX4Btn").addEventListener("click", () => exportImage(4));
document.getElementById("exportX8Btn").addEventListener("click", () => exportImage(8));
document.getElementById("cliBtn").addEventListener("click", () => {
    // Generate CLI command
    // node cli.js --input <IMAGE> --gridWidth ...
    
    // Attempt to guess input filename (mock) or just placeholder
    const inputName = imageInput.files[0] ? imageInput.files[0].name : "image.png";
    const method = convMethodSelect.value;
    const scale = imageScale.toFixed(4); // precision
    const offX = offsetX.toFixed(2);
    const offY = offsetY.toFixed(2);
    
    // Use the stored canvas dimensions from when conversion happened
    // These were captured during the Convert button click in Step 2
    const cWidth = conversionCanvasWidth;
    const cHeight = conversionCanvasHeight;

    const command = `node cli.js --input "./input" --gridWidth ${gridWidth} --gridHeight ${gridHeight} --method ${method} --scale ${scale} --offsetX ${offX} --offsetY ${offY} --canvasWidth ${cWidth} --canvasHeight ${cHeight}`;
    
    // Copy to clipboard or alert
    navigator.clipboard.writeText(command).then(() => {
        alert("CLI Command copied to clipboard:\n" + command);
    }).catch(() => {
        prompt("Copy this command:", command);
    });
});


// New upload button
uploadBtn.addEventListener("click", () => {
  gridWidth = parseInt(gridWidthSelect.value);
  gridHeight = parseInt(gridHeightSelect.value);
  const file = imageInput.files[0];
  if (!file) {
    alert("Please select an image.");
    return;
  }
  loadAndDownscaleImage(file);
  switchStep(2);
});

/*********************
 * Utility Functions
 *********************/
// Utility Functions removed (imported from processor.js)

function saveHistory() {
  historyStack.push(deepCopyPixels(pixelColors));
  // Clear redo stack on new action.
  redoStack = [];
}

/*********************
 * Draggable/Resizable Source Image Window
 *********************/

function createSourceWindow() {
  if (document.getElementById("sourceWindow")) return;
  
  const windowDiv = document.createElement("div");
  windowDiv.id = "sourceWindow";
  // Set default dimensions.
  windowDiv.style.width = "300px";
  windowDiv.style.height = "300px";
  windowDiv.style.position = "absolute";
  windowDiv.style.border = "1px solid #555";
  windowDiv.style.background = "#1a1a1a";
  windowDiv.style.zIndex = "1000";
  windowDiv.style.userSelect = "none";

  
  // Title Bar with minimize button.
  const titleBar = document.createElement("div");
  titleBar.id = "sourceWindowTitleBar";
  titleBar.style.cursor = "move";
  titleBar.style.background = "#333";
  titleBar.style.padding = "5px";
  titleBar.style.display = "flex";
  titleBar.style.justifyContent = "space-between";
  titleBar.style.alignItems = "center";
  
  const titleText = document.createElement("span");
  titleText.textContent = "Source Image";
  titleText.style.color = "#ffd700";
  
  const minimizeBtn = document.createElement("button");
  // Initially, show the collapse icon (▴ means expanded, ▾ means minimized)
  minimizeBtn.textContent = "▴";
  minimizeBtn.style.cursor = "pointer";
  minimizeBtn.style.backgroundColor = "#ffd700";
  minimizeBtn.style.border = "none";
  minimizeBtn.style.width = "16px"
  minimizeBtn.style.height = "16px"

  titleBar.appendChild(titleText);
  titleBar.appendChild(minimizeBtn);
  
  // Content area holds the source image.
  const contentArea = document.createElement("div");
  contentArea.id = "sourceWindowContent";
  contentArea.style.padding = "5px";
  // Reserve space for the title bar.
  contentArea.style.height = "calc(100% - 40px)";
  contentArea.style.overflow = "hidden";
  
  // Create a new image element and assign the source.
  const imgDisplay = new Image();
  imgDisplay.src = image.src;
  imgDisplay.style.display = "block";
  // Ensure the image fits within the container.
  imgDisplay.style.width = "100%";
  imgDisplay.style.height = "auto";
  imgDisplay.style.maxWidth = "100%";
  imgDisplay.style.webkitUserDrag = "none";
  contentArea.appendChild(imgDisplay);
  
  // Resizer handle.
  const resizer = document.createElement("div");
  resizer.style.width = "10px";
  resizer.style.height = "10px";
  resizer.style.background = "#ffd700";
  resizer.style.position = "absolute";
  resizer.style.right = "0";
  resizer.style.bottom = "0";
  resizer.style.cursor = "se-resize";
  
  windowDiv.appendChild(titleBar);
  windowDiv.appendChild(contentArea);
  windowDiv.appendChild(resizer);
  document.body.appendChild(windowDiv);
  
  // Center the window in the viewport.
  const rect = windowDiv.getBoundingClientRect();
  windowDiv.style.left = ((window.innerWidth - rect.width) / 2) + "px";
  windowDiv.style.top = ((window.innerHeight - rect.height) / 2) + "px";
  
  // Draggable functionality.
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  
  titleBar.addEventListener("mousedown", function(e) {
    isDragging = true;
    const rect = windowDiv.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });
  window.addEventListener("mousemove", function(e) {
    if (isDragging) {
      let newLeft = e.clientX - dragOffsetX;
      let newTop = e.clientY - dragOffsetY;
      windowDiv.style.left = newLeft + "px";
      windowDiv.style.top = newTop + "px";
    }
  });
  window.addEventListener("mouseup", function(e) {
    if (isDragging) {
      isDragging = false;
      // Snap into view so the header remains accessible.
      snapWindowIntoView(windowDiv);
    }
  });
  
  // Resizable functionality.
  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let startWidth = 0;
  let startHeight = 0;
  
  resizer.addEventListener("mousedown", function(e) {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    const rect = windowDiv.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener("mousemove", function(e) {
    if (isResizing) {
      let newWidth = startWidth + (e.clientX - resizeStartX);
      let newHeight = startHeight + (e.clientY - resizeStartY);
      // Enforce minimum dimensions.
      newWidth = Math.max(newWidth, 150);
      newHeight = Math.max(newHeight, 100);
      windowDiv.style.width = newWidth + "px";
      windowDiv.style.height = newHeight + "px";
    }
  });
  window.addEventListener("mouseup", function(e) {
    if (isResizing) {
      isResizing = false;
    }
  });
  
  // Minimizable functionality.
  let isMinimized = false;
  minimizeBtn.addEventListener("click", function() {
    if (isMinimized) {
      // Expand the window.
      contentArea.style.display = "block";
      resizer.style.display = "block";
      minimizeBtn.textContent = "▴";
      isMinimized = false;
      // Restore height (for example, back to 300px).
      windowDiv.style.height = "300px";
      contentArea.style.height = "calc(100% - 40px)";
    } else {
      // Collapse to just the title bar.
      contentArea.style.display = "none";
      resizer.style.display = "none";
      minimizeBtn.textContent = "▾";
      isMinimized = true;
      // Set window height to the title bar only.
      windowDiv.style.height = titleBar.offsetHeight + "px";
    }
  });
}

function snapWindowIntoView(winDiv) {
  const rect = winDiv.getBoundingClientRect();
  let newLeft = rect.left;
  let newTop = rect.top;
  // Ensure at least 30px of the header is visible.
  const headerMinVisible = 30;
  if (rect.top < 0) {
    newTop = 0;
  }
  if (rect.left < 0) {
    newLeft = 0;
  }
  if (rect.top + headerMinVisible > window.innerHeight) {
    newTop = window.innerHeight - headerMinVisible;
  }
  if (rect.left + 50 > window.innerWidth) {
    newLeft = window.innerWidth - 50;
  }
  winDiv.style.left = newLeft + "px";
  winDiv.style.top = newTop + "px";
}


function loadAndDownscaleImage(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const tempImg = new Image();
    tempImg.onload = function() {
      const maxSize = 1024;
      let width = tempImg.width;
      let height = tempImg.height;
      // Scale down if the largest dimension exceeds maxSize.
      if (width > maxSize || height > maxSize) {
        const scaleFactor = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * scaleFactor);
        height = Math.round(height * scaleFactor);
      }
      // Create an offscreen canvas to draw the (possibly downscaled) image.
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
      const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
      offscreenCtx.drawImage(tempImg, 0, 0, width, height);
      // Use the base64 data URL from the canvas as the image source.
      image.src = offscreenCanvas.toDataURL("image/png");
      imgLoaded = false;
      image.onload = function() {
        imgLoaded = true;
        // Set up the offscreen canvas for analysis.
        originalCanvas.width = image.width;
        originalCanvas.height = image.height;
        origCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
        origCtx.drawImage(image, 0, 0);
        drawPreview();
      }
    }
    tempImg.src = e.target.result;
  }
  reader.readAsDataURL(file);
}

/*********************
 * Tool UI Functions
 *********************/
function updateToolHighlight() {
  // Remove active-tool class from all tool buttons.
  [brushToolBtn, eraserToolBtn, magicWandBtn].forEach(btn => {
    btn.classList.remove("active-tool");
  });
  // Add active-tool to the currently selected tool button.
  if (currentTool === "brush") {
    brushToolBtn.classList.add("active-tool");
  } else if (currentTool === "eraser") {
    eraserToolBtn.classList.add("active-tool");
  } else if (currentTool === "magicWand") {
    magicWandBtn.classList.add("active-tool");
  }
}

function toggleMainContentBackground() {
  if (isDarkBackground) {
    mainContent.style.background = "repeating-conic-gradient(#d2d2d2 0% 25%, #909090 0% 50%) 50% / 20px 20px";
  } else {
    mainContent.style.background = "repeating-conic-gradient(#222222 0% 25%, #333333 0% 50%) 50% / 20px 20px";
  }
  isDarkBackground = !isDarkBackground;
}

function toggleGridColor() {
  isDarkGrid = !isDarkGrid;
  if (currentStep === 2) {
    drawPreview();
  } else if (currentStep === 3) {
    drawPixelArt();
  }
}

// Toggle background when Alt+B is pressed.
window.addEventListener("keydown", (e) => {
  if (e.altKey && e.key.toLowerCase() === "b") {
    toggleMainContentBackground();
    e.preventDefault();
  }
});

// Toggle grid color when Alt+G is pressed.
window.addEventListener("keydown", (e) => {
  if (e.altKey && e.key.toLowerCase() === "g") {
    toggleGridColor();
    e.preventDefault();
  }
});

/*********************
 * Step Switching
 *********************/
function switchStep(step) {
  currentStep = step;
  step1Div.style.display = (step === 1) ? "block" : "none";
  step2Div.style.display = (step === 2) ? "block" : "none";
  step3Div.style.display = (step === 3) ? "block" : "none";

  if (step === 2) {
    // Set preview canvas size based on grid dimensions and previewCellSize.
    canvas.width = gridWidth * previewCellSize;
    canvas.height = gridHeight * previewCellSize;
    mainContent.style.overflow = "auto";
    // Recalculate image scale and offset to fit the new canvas.
    if (imgLoaded) {
      imageScale = Math.min(canvas.width / image.width, canvas.height / image.height);
      offsetX = (canvas.width - image.width * imageScale) / 2;
      offsetY = (canvas.height - image.height * imageScale) / 2;
    }
    drawPreview();
    } else if (step === 3) {
    // For editing, the canvas size will be gridWidth×canvasZoom by gridHeight×canvasZoom.
    updateCanvasSizeForEdit();
    mainContent.style.overflow = "auto";
    drawPixelArt();
    updateToolHighlight();
    // Save initial state for undo history.
    historyStack = [];
    redoStack = [];
    saveHistory();
    
    // Create the source image window.
    createSourceWindow();
  }
}

/*********************
 * Canvas Update Functions
 *********************/
function updateCanvasSizeForEdit() {
  canvas.width = gridWidth * canvasZoom;
  canvas.height = gridHeight * canvasZoom;
}

function drawPreview() {
  // Draw the source image and overlay grid on the preview canvas (Step 2)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#333333";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (imgLoaded) {
    ctx.drawImage(image, offsetX, offsetY, image.width * imageScale, image.height * imageScale);
  }
  // Draw grid lines for preview using gridWidth and gridHeight
  const cellW = canvas.width / gridWidth;
  const cellH = canvas.height / gridHeight;
  ctx.strokeStyle = isDarkGrid ? gridLineColorDarkPreview : gridLineColorLightPreview;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < gridWidth; i++) {
    ctx.moveTo(i * cellW, 0);
    ctx.lineTo(i * cellW, canvas.height);
  }
  for (let j = 1; j < gridHeight; j++) {
    ctx.moveTo(0, j * cellH);
    ctx.lineTo(canvas.width, j * cellH);
  }
  ctx.stroke();
}

function drawPixelArt() {
  // Draw the pixel art on the edit canvas (Step 3)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cellW = canvas.width / gridWidth;
  const cellH = canvas.height / gridHeight;
  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      if (pixelColors[j][i] !== "transparent") {
        ctx.fillStyle = pixelColors[j][i];
        ctx.fillRect(i * cellW, j * cellH, cellW, cellH);
      }
    }
  }
  // Draw grid lines if toggle is checked
  if (gridToggle.checked) {
    ctx.strokeStyle = isDarkGrid ? gridLineColorDarkEdit : gridLineColorLightEdit;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < gridWidth; i++) {
      ctx.moveTo(i * cellW, 0);
      ctx.lineTo(i * cellW, canvas.height);
    }
    for (let j = 1; j < gridHeight; j++) {
      ctx.moveTo(0, j * cellH);
      ctx.lineTo(canvas.width, j * cellH);
    }
    ctx.stroke();
  }
  // Draw brush highlight if defined
  if (typeof highlightI === "number" && typeof highlightJ === "number") {
    const brushSize = parseInt(brushSizeSelect.value);
    ctx.strokeStyle = "rgba(255,0,0,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      highlightI * (canvas.width / gridWidth),
      highlightJ * (canvas.height / gridHeight),
      brushSize * (canvas.width / gridWidth),
      brushSize * (canvas.height / gridHeight)
    );
  }
}

/*********************
 * Recent Colors Functions
 *********************/
function addRecentColor(color) {
  if (color === "transparent") return;
  recentColors = recentColors.filter(c => c !== color);
  recentColors.unshift(color);
  if (recentColors.length > 6) recentColors.pop();
  updateRecentColorsUI();
}

function updateRecentColorsUI() {
  if (recentColors.length === 0) {
    recentColorsSection.style.display = "none";
    return;
  }
  recentColorsSection.style.display = "block";
  recentColorsContainer.innerHTML = "";
  recentColors.forEach(color => {
    const swatch = document.createElement("div");
    swatch.className = "recent-swatch";
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.addEventListener("click", () => {
      currentDrawColor = color;
      drawColorPicker.value = color;
      currentTool = "brush";
      updateToolHighlight();
    });
    recentColorsContainer.appendChild(swatch);
  });
}

/*********************
 * Step 1: Setup
 *********************/
uploadBtn.addEventListener("click", () => {
  gridWidth = parseInt(gridWidthSelect.value);
  gridHeight = parseInt(gridHeightSelect.value);
  const file = imageInput.files[0];
  if (!file) {
    alert("Please select an image.");
    return;
  }
  const url = URL.createObjectURL(file);
  image.src = url;
  imgLoaded = false;
  image.onload = () => {
    URL.revokeObjectURL(url);
    imgLoaded = true;
    // Set up offscreen canvas for analysis
    originalCanvas.width = image.width;
    originalCanvas.height = image.height;
    origCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    origCtx.drawImage(image, 0, 0);
    drawPreview();
  };
  switchStep(2);
});

/*********************
 * Step 2: Position & Convert
 *********************/
// Slider to adjust previewCellSize
previewSizeSlider.addEventListener("input", function() {
  previewCellSize = parseInt(this.value);
  previewSizeValue.textContent = this.value;
  if (currentStep === 2) {
    canvas.width = gridWidth * previewCellSize;
    canvas.height = gridHeight * previewCellSize;
    if (imgLoaded) {
      imageScale = Math.min(canvas.width / image.width, canvas.height / image.height);
      offsetX = (canvas.width - image.width * imageScale) / 2;
      offsetY = (canvas.height - image.height * imageScale) / 2;
    }
    drawPreview();
  }
});

// Zoom slider: adjust source image scale
zoomSlider.addEventListener("input", () => {
  if (!imgLoaded) return;
  let newScale = parseFloat(zoomSlider.value) / 100;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const centerOrigX = (centerX - offsetX) / imageScale;
  const centerOrigY = (centerY - offsetY) / imageScale;
  imageScale = newScale;
  offsetX = centerX - centerOrigX * imageScale;
  offsetY = centerY - centerOrigY * imageScale;
  drawPreview();
});

// Drag to reposition the image (left mouse button only)
canvas.addEventListener("pointerdown", (e) => {
  if (currentStep === 2 && imgLoaded) {
    if (e.button === 0) {
      const rect = canvas.getBoundingClientRect();
      dragStartX = (e.clientX - rect.left) * (canvas.width / rect.width);
      dragStartY = (e.clientY - rect.top) * (canvas.height / rect.height);
      dragStartOffsetX = offsetX;
      dragStartOffsetY = offsetY;
      canvas.setPointerCapture(e.pointerId);
    }
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (currentStep === 2 && imgLoaded && dragStartX !== undefined) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    offsetX = dragStartOffsetX + (x - dragStartX);
    offsetY = dragStartOffsetY + (y - dragStartY);
    drawPreview();
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (currentStep === 2) {
    dragStartX = undefined;
    dragStartY = undefined;
    canvas.releasePointerCapture(e.pointerId);
  }
});

// Reset positioning button (Step 2)
//resetPositionBtn.addEventListener("click", () => {
//  if (!imgLoaded) return;
//  imageScale = Math.min(canvas.width / image.width, canvas.height / image.height);
//  offsetX = (canvas.width - image.width * imageScale) / 2;
//  offsetY = (canvas.height - image.height * imageScale) / 2;
//  zoomSlider.value = (imageScale * 100).toFixed(0);
//  drawPreview();
//});

resetPositionBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to delete everything and go back to Step 1?")) {
    resetAll();
  }
});


// Conversion: analyze image to create pixel art using selected method
convertBtn.addEventListener("click", () => {
  if (!imgLoaded) return;
  
  // Use the processor module to convert the image.
  // We need to pass the context. Since we have 'origCtx' and 'image' loaded:
  
  // Store canvas dimensions for CLI command generation
  conversionCanvasWidth = canvas.width;
  conversionCanvasHeight = canvas.height;
  
  // Prepare options
  const options = {
    gridWidth,
    gridHeight,
    method: convMethodSelect.value,
    offsetX,
    offsetY,
    imageScale,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };

  // Perform conversion
  // Note: convertImage expects an object with .width, .height for image dimensions logic
  // and the context to read data from.
  // In processor.js, we call ctx.getImageData.
  // We need to ensure we are passing the right context.
  // In the original code, it used `origCtx`.
  
  pixelColors = convertImage(origCtx, { width: image.width, height: image.height }, options);

  historyStack = [];
  redoStack = [];
  saveHistory();
  conversionBackup = deepCopyPixels(pixelColors);
  switchStep(3);
});

// Removed getRepresentativeColor and getRepresentativeColorWeighted (in processor.js)


/*********************
 * Step 3: Edit & Export
 *********************/
// Update canvas size when canvas zoom slider changes
canvasZoomSlider.addEventListener("input", () => {
  canvasZoom = parseFloat(canvasZoomSlider.value);
  updateCanvasSizeForEdit();
  drawPixelArt();
});
resetCanvasZoomBtn.addEventListener("click", () => {
  canvasZoom = 1;
  canvasZoomSlider.value = "1";
  updateCanvasSizeForEdit();
  drawPixelArt();
});

// Update brush highlight on pointer move in Step 3 (for brush preview)
canvas.addEventListener("pointermove", (e) => {
  if (currentStep === 3) {
    updateHighlight(e);
    if (drawingActive) {
      handleDrawing(e);
    } else {
      drawPixelArt();
    }
  }
});

canvas.addEventListener("pointerdown", (e) => {
  if (currentStep === 3) {
    if (e.button === 0) { // left-click
      if (currentTool === "magicWand") {
        // When Magic Wand is active, perform flood fill once (do not set drawingActive)
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const cellW = canvas.width / gridWidth;
        const cellH = canvas.height / gridHeight;
        let i = Math.floor(cx / cellW);
        let j = Math.floor(cy / cellH);
        const brushSize = parseInt(brushSizeSelect.value);
        const startI = i;
        const startJ = j;
        const endI = Math.min(gridWidth - 1, i + brushSize - 1);
        const endJ = Math.min(gridHeight - 1, j + brushSize - 1);
        // Collect all unique non-transparent colors in the brush area.
        let colorsToDelete = new Set();
        for (let m = startJ; m <= endJ; m++) {
          for (let n = startI; n <= endI; n++) {
            let col = pixelColors[m][n];
            if (col !== "transparent") {
              colorsToDelete.add(col);
            }
          }
        }
        // For each unique color, run flood fill from the first cell in the brush area with that color.
        colorsToDelete.forEach(color => {
          let filled = false;
          for (let m = startJ; m <= endJ && !filled; m++) {
            for (let n = startI; n <= endI && !filled; n++) {
              if (pixelColors[m][n] === color) {
                floodFill(m, n, color, "transparent");
                filled = true;
              }
            }
          }
        });
        saveHistory();
        drawPixelArt();
      } else {
        // For Brush and Eraser tools:
        drawingActive = true;
        if (currentTool === "brush" || currentTool === "eraser") {
          if (currentDrawColor !== "transparent") {
            addRecentColor(currentDrawColor);
          }
          handleDrawing(e);
        }
      }
      e.preventDefault();
    }
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (currentStep === 3) {
    // If Magic Wand is selected, do not call handleDrawing (so no continuous fill)
    if (currentTool !== "magicWand") {
      updateHighlight(e);
      if (drawingActive) {
        handleDrawing(e);
      } else {
        drawPixelArt();
      }
    } else {
      updateHighlight(e);
      drawPixelArt();
    }
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (currentStep === 3 && e.button === 0) {
    drawingActive = false;
    if (drawingOccurred) {
      saveHistory();
      drawingOccurred = false;
    }
  }
});

// New: Global pointerup and pointercancel events to catch releases outside the canvas.
window.addEventListener("pointerup", (e) => {
  if (currentStep === 3 && drawingActive) {
    drawingActive = false;
    drawPixelArt();
  }
});
window.addEventListener("pointercancel", (e) => {
  if (currentStep === 3 && drawingActive) {
    drawingActive = false;
    drawPixelArt();
  }
});

// Calculate and update brush highlight based on pointer position
function updateHighlight(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const cellW = canvas.width / gridWidth;
  const cellH = canvas.height / gridHeight;
  let i = Math.floor(cx / cellW);
  let j = Math.floor(cy / cellH);
  i = Math.max(0, Math.min(gridWidth - 1, i));
  j = Math.max(0, Math.min(gridHeight - 1, j));
  highlightI = i;
  highlightJ = j;
}

// Handle drawing: fill cells based on selected brush size.
function handleDrawing(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const cellW = canvas.width / gridWidth;
  const cellH = canvas.height / gridHeight;
  let i = Math.floor(cx / cellW);
  let j = Math.floor(cy / cellH);
  i = Math.max(0, Math.min(gridWidth - 1, i));
  j = Math.max(0, Math.min(gridHeight - 1, j));
  const brushSize = parseInt(brushSizeSelect.value);
  for (let dj = 0; dj < brushSize; dj++) {
    for (let di = 0; di < brushSize; di++) {
      let ni = Math.min(i + di, gridWidth - 1);
      let nj = Math.min(j + dj, gridHeight - 1);
      pixelColors[nj][ni] = currentDrawColor;
    }
  }
  drawingOccurred = true;
  drawPixelArt();
}

// Flood fill for Magic Wand tool (simple 4-directional fill)
function floodFill(startRow, startCol, targetColor, replacementColor) {
  if (targetColor === replacementColor) return;
  const stack = [];
  stack.push({ row: startRow, col: startCol });
  while (stack.length) {
    const { row, col } = stack.pop();
    if (row < 0 || row >= gridHeight || col < 0 || col >= gridWidth) continue;
    const currentColor = pixelColors[row][col];
    if (currentColor === "transparent") continue;
    // Use color distance comparison instead of strict equality.
    if (colorDistance(currentColor, targetColor) > magicWandThreshold) continue;
    pixelColors[row][col] = replacementColor;
    stack.push({ row: row - 1, col: col });
    stack.push({ row: row + 1, col: col });
    stack.push({ row: row, col: col - 1 });
    stack.push({ row: row, col: col + 1 });
  }
}

// Removed hexToRGB and colorDistance (in processor.js)



// Tool button event listeners
brushToolBtn.addEventListener("click", () => {
  currentTool = "brush";
  // When brush is selected, restore the color picker value if not transparent.
  if (drawColorPicker.value !== "#000000") {
    currentDrawColor = drawColorPicker.value;
  }
  updateToolHighlight();
});
eraserToolBtn.addEventListener("click", () => {
  currentTool = "eraser";
  currentDrawColor = "transparent";
  updateToolHighlight();
});
magicWandBtn.addEventListener("click", () => {
  currentTool = "magicWand";
  updateToolHighlight();
});

// Update drawing color from the color picker
drawColorPicker.addEventListener("input", () => {
  currentTool = "brush";
  currentDrawColor = drawColorPicker.value;
  updateToolHighlight();
});
transparentBtn.addEventListener("click", () => {
  currentTool = "eraser";
  currentDrawColor = "transparent";
  updateToolHighlight();
});

// Undo/Redo: Listen for Ctrl+Z (undo) and Ctrl+Y (redo)
window.addEventListener("keydown", (e) => {
  if (currentStep !== 3) return;
  if (e.ctrlKey && e.key === "z") {
    // Undo
    if (historyStack.length > 1) {
      redoStack.push(historyStack.pop());
      pixelColors = deepCopyPixels(historyStack[historyStack.length - 1]);
      drawPixelArt();
    }
    e.preventDefault();
  } else if (e.ctrlKey && e.key === "y") {
    // Redo
    if (redoStack.length > 0) {
      const state = redoStack.pop();
      historyStack.push(deepCopyPixels(state));
      pixelColors = deepCopyPixels(state);
      drawPixelArt();
    }
    e.preventDefault();
  }
});

// Reset button: confirmation alert then reset everything to Step 1.
resetEditBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to reset everything and go back to Step 1?")) {
    resetAll();
  }
});

// Export pixel art as PNG at native resolution (each cell becomes one pixel)
//exportBtn.addEventListener("click", () => {
//  const exportCanvas = document.createElement("canvas");
//  exportCanvas.width = gridWidth;
//  exportCanvas.height = gridHeight;
//  const exportCtx = exportCanvas.getContext("2d");
//  for (let j = 0; j < gridHeight; j++) {
//    for (let i = 0; i < gridWidth; i++) {
//      if (pixelColors[j][i] !== "transparent") {
//        exportCtx.fillStyle = pixelColors[j][i];
//        exportCtx.fillRect(i, j, 1, 1);
//      }
//    }
//  }
//  const dataURL = exportCanvas.toDataURL("image/png");
//  const link = document.createElement("a");
//  link.href = dataURL;
//  link.download = `pixel_art_${gridWidth}x${gridHeight}.png`;
//  document.body.appendChild(link);
//  link.click();
//  document.body.removeChild(link);
//});

function exportImage(scale) {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = gridWidth * scale;
  exportCanvas.height = gridHeight * scale;
  const exportCtx = exportCanvas.getContext("2d");
  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      if (pixelColors[j][i] !== "transparent") {
        exportCtx.fillStyle = pixelColors[j][i];
        exportCtx.fillRect(i * scale, j * scale, scale, scale);
      }
    }
  }
  const dataURL = exportCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = `pixel_art_${gridWidth}x${gridHeight}_x${scale}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


/*********************
 * Reset All Function
 *********************/
function resetAll() {
  currentStep = 1;
  imgLoaded = false;
  image = new Image();
  pixelColors = [];
  conversionBackup = [];
  recentColors = [];
  historyStack = [];
  redoStack = [];
  drawingOccurred = false;
  highlightI = undefined;
  highlightJ = undefined;
  currentTool = "brush";
  // Reset UI elements
  gridWidthSelect.value = "16";
  gridHeightSelect.value = "16";
  imageInput.value = "";
  drawColorPicker.value = "#000000";
  currentDrawColor = "#000000";
  canvasZoom = 1;
  canvasZoomSlider.value = "1";
  previewSizeSlider.value = "4";
  previewSizeValue.textContent = "4";
  previewCellSize = 4;
  recentColorsContainer.innerHTML = "";
  recentColorsSection.style.display = "none";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  switchStep(1);

  // Remove source image window and color scheme elements if present.
  const sw = document.getElementById("sourceWindow");
  if (sw) sw.remove();
}

/*********************
 * Initialize
 *********************/
switchStep(1);
