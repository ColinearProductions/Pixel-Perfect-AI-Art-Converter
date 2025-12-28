/**
 * Pixel Art Processor Module
 * Shared logic for Browser and CLI
 */

// Utility Functions
function toHex(num) {
  return num.toString(16).padStart(2, "0").toUpperCase();
}

function deepCopyPixels(pixels) {
  return pixels.map(row => row.slice());
}

function hexToRGB(hex) {
  // Returns an object {r, g, b} for a hex color in the format "#RRGGBB"
  hex = hex.replace("#", "");
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

function colorDistance(hex1, hex2) {
  const c1 = hexToRGB(hex1);
  const c2 = hexToRGB(hex2);
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

function getRepresentativeColor(cellPixels, similarityThreshold = 30) {
  if (cellPixels.length === 0) return null;

  // Count exact colors using a Map.
  const colorCounts = new Map();
  for (let i = 0; i < cellPixels.length; i++) {
    const { r, g, b } = cellPixels[i];
    const colorKey = (r << 16) | (g << 8) | b;
    colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
  }
  
  if (colorCounts.size === 1) {
    const onlyColorKey = colorCounts.keys().next().value;
    return { 
      r: (onlyColorKey >> 16) & 0xFF, 
      g: (onlyColorKey >> 8) & 0xFF, 
      b: onlyColorKey & 0xFF 
    };
  }
  
  // Convert map to an array and sort by frequency.
  const colorEntries = [];
  for (let [key, count] of colorCounts) {
    colorEntries.push({ key, count });
  }
  colorEntries.sort((a, b) => b.count - a.count);
  
  // Group similar colors.
  const clusters = [];
  for (let entry of colorEntries) {
    const colorKey = entry.key;
    const count = entry.count;
    const color = { 
      r: (colorKey >> 16) & 0xFF, 
      g: (colorKey >> 8) & 0xFF, 
      b: colorKey & 0xFF 
    };
    let matchedCluster = null;
    for (let cluster of clusters) {
      const rep = cluster.repColor;
      const dr = color.r - rep.r;
      const dg = color.g - rep.g;
      const db = color.b - rep.b;
      if ((dr * dr + dg * dg + db * db) <= similarityThreshold * similarityThreshold) {
        matchedCluster = cluster;
        break;
      }
    }
    if (matchedCluster) {
      matchedCluster.totalCount += count;
      matchedCluster.members.push({ color, count });
      const t = matchedCluster.totalCount;
      const w = count;
      matchedCluster.repColor = {
        r: Math.round((matchedCluster.repColor.r * (t - w) + color.r * w) / t),
        g: Math.round((matchedCluster.repColor.g * (t - w) + color.g * w) / t),
        b: Math.round((matchedCluster.repColor.b * (t - w) + color.b * w) / t)
      };
    } else {
      clusters.push({
        repColor: { r: color.r, g: color.g, b: color.b },
        totalCount: count,
        members: [ { color, count } ]
      });
    }
  }
  
  // Find the cluster with the highest count.
  let dominantCluster = clusters[0];
  for (let cluster of clusters) {
    if (cluster.totalCount > dominantCluster.totalCount) {
      dominantCluster = cluster;
    }
  }
  
  // Pick the most frequent color from the dominant cluster.
  let representativeColor = dominantCluster.members[0].color;
  let highestCount = dominantCluster.members[0].count;
  for (let entry of dominantCluster.members) {
    if (entry.count > highestCount) {
      representativeColor = entry.color;
      highestCount = entry.count;
    }
  }
  
  return representativeColor;
}

function getRepresentativeColorWeighted(cellPixels, method, similarityThreshold = 30) {
  if (cellPixels.length === 0) return null;

  // cellPixels: an array of {r, g, b} objects.
  // method: either "most_light" or "most_dark"
  // similarityThreshold: defines how similar colors need to be to be grouped.

  const clusters = [];
  
  // Process each pixel and compute its weight based on brightness.
  for (let i = 0; i < cellPixels.length; i++) {
    const { r, g, b } = cellPixels[i];
    // Calculate brightness using a standard formula.
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    let rawWeight;
    if (method === "most_light") {
      rawWeight = brightness / 255;
    } else if (method === "most_dark") {
      rawWeight = (255 - brightness) / 255;
    } else {
      rawWeight = 1; // fallback
    }
    const weight = 0.25 + 0.50 * rawWeight;
    
    // Create an object for this pixel.
    const pixelColor = { r, g, b, weight };

    // Try to find a cluster with a similar representative color.
    let matchedCluster = null;
    for (let cluster of clusters) {
      const rep = cluster.repColor;
      const dr = r - rep.r;
      const dg = g - rep.g;
      const db = b - rep.b;
      if ((dr * dr + dg * dg + db * db) <= similarityThreshold * similarityThreshold) {
        matchedCluster = cluster;
        break;
      }
    }
    
    if (matchedCluster) {
      matchedCluster.totalWeight += weight;
      matchedCluster.members.push(pixelColor);
      let sumR = 0, sumG = 0, sumB = 0;
      for (let member of matchedCluster.members) {
        sumR += member.r * member.weight;
        sumG += member.g * member.weight;
        sumB += member.b * member.weight;
      }
      matchedCluster.repColor = {
        r: Math.round(sumR / matchedCluster.totalWeight),
        g: Math.round(sumG / matchedCluster.totalWeight),
        b: Math.round(sumB / matchedCluster.totalWeight)
      };
    } else {
      // Start a new cluster with this pixel.
      clusters.push({
        repColor: { r, g, b },
        totalWeight: weight,
        members: [ pixelColor ]
      });
    }
  }
  
  // Find the cluster with the highest total weight.
  let dominantCluster = clusters[0];
  for (let cluster of clusters) {
    if (cluster.totalWeight > dominantCluster.totalWeight) {
      dominantCluster = cluster;
    }
  }
  
  return dominantCluster.repColor;
}

/**
 * Core Image Conversion Logic
 * @param {Object} ctx - The canvas context holding the source image (or an object with getImageData)
 * @param {Object} imageDims - { width, height } of the source image
 * @param {Object} options - Conversion options
 * @returns {Array} 2D array of colors (strings or "transparent")
 */
export function convertImage(ctx, imageDims, options) {
  const { 
    gridWidth, 
    gridHeight, 
    method, 
    offsetX, 
    offsetY, 
    imageScale,
    previewCellSize = 1, // Only used to calculate canvas size if needed, but here we expect ctx to be readable
    canvasWidth, // The width of the "preview/canvas" space where the image is positioned
    canvasHeight // The height of the "preview/canvas" space
  } = options;

  const pixelColors = Array.from({ length: gridHeight }, () => Array(gridWidth).fill("transparent"));
  const cellWCanvas = canvasWidth / gridWidth;
  const cellHCanvas = canvasHeight / gridHeight;

  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const cx0 = i * cellWCanvas;
      const cy0 = j * cellHCanvas;
      const cx1 = cx0 + cellWCanvas;
      const cy1 = cy0 + cellHCanvas;
      
      let rOx0, rOy0, rOx1, rOy1;
      
      if (method === "neighbor") {
         // Neighbor-Aware Average: Expand sampling area by 25% margin on each side.
         const marginX = cellWCanvas * 0.25;
         const marginY = cellHCanvas * 0.25;
         const ecx0 = i * cellWCanvas - marginX;
         const ecy0 = j * cellHCanvas - marginY;
         const ecx1 = (i + 1) * cellWCanvas + marginX;
         const ecy1 = (j + 1) * cellHCanvas + marginY;
         
         const ox0 = (ecx0 - offsetX) / imageScale;
         const oy0 = (ecy0 - offsetY) / imageScale;
         const ox1 = (ecx1 - offsetX) / imageScale;
         const oy1 = (ecy1 - offsetY) / imageScale;
         
         rOx0 = Math.max(0, Math.floor(ox0));
         rOy0 = Math.max(0, Math.floor(oy0));
         rOx1 = Math.min(imageDims.width, Math.ceil(ox1));
         rOy1 = Math.min(imageDims.height, Math.ceil(oy1));
      } else {
        const ox0 = (cx0 - offsetX) / imageScale;
        const oy0 = (cy0 - offsetY) / imageScale;
        const ox1 = (cx1 - offsetX) / imageScale;
        const oy1 = (cy1 - offsetY) / imageScale;
        
        rOx0 = Math.max(0, Math.floor(ox0));
        rOy0 = Math.max(0, Math.floor(oy0));
        rOx1 = Math.min(imageDims.width, Math.ceil(ox1));
        rOy1 = Math.min(imageDims.height, Math.ceil(oy1));
      }

      if (rOx1 <= rOx0 || rOy1 <= rOy0) {
        pixelColors[j][i] = "transparent";
        continue;
      }
      
      const imgData = ctx.getImageData(rOx0, rOy0, rOx1 - rOx0, rOy1 - rOy0).data;
      let cellPixels = [];
      let sumR = 0, sumG = 0, sumB = 0, count = 0;

      for (let idx = 0; idx < imgData.length; idx += 4) {
        const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2], a = imgData[idx + 3];
        if (a === 0) continue;  // Skip transparent pixels.
        
        if (method === "average" || method === "neighbor") {
           sumR += r;
           sumG += g;
           sumB += b;
           count++;
        } else {
           cellPixels.push({ r, g, b });
        }
      }
      
      if ((method === "average" || method === "neighbor")) {
        if (count === 0) {
           pixelColors[j][i] = "transparent";
        } else {
           const rAvg = Math.round(sumR / count);
           const gAvg = Math.round(sumG / count);
           const bAvg = Math.round(sumB / count);
           pixelColors[j][i] = `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`;
        }
      } else {
        if (cellPixels.length === 0) {
          pixelColors[j][i] = "transparent";
        } else {
          let repColor;
          if (method === "most") {
             repColor = getRepresentativeColor(cellPixels, 30);
          } else {
             repColor = getRepresentativeColorWeighted(cellPixels, method, 30);
          }
          
          if (!repColor) {
            pixelColors[j][i] = "transparent";
          } else {
            pixelColors[j][i] = `#${toHex(repColor.r)}${toHex(repColor.g)}${toHex(repColor.b)}`;
          }
        }
      }
    }
  }
  return pixelColors;
}

// Re-export utility needed for other parts
export { toHex, deepCopyPixels, hexToRGB, colorDistance };

/**
 * Render Pixel Art to a Canvas-like context
 * @param {Array} pixelColors - 2D array of color strings
 * @param {Object} ctx - Canvas Context to draw on
 * @param {Object} options - { width, height, scale }
 */
export function renderPixelArt(pixelColors, ctx, options) {
  const { width, height, scale = 1 } = options;
  const gridHeight = pixelColors.length;
  const gridWidth = pixelColors[0].length;
  const cellW = width / gridWidth;
  const cellH = height / gridHeight;
  
  ctx.clearRect(0, 0, width, height);
  
  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
        const color = pixelColors[j][i];
        if (color !== "transparent") {
            ctx.fillStyle = color;
            ctx.fillRect(i * cellW, j * cellH, cellW, cellH);
        }
    }
  }
}

