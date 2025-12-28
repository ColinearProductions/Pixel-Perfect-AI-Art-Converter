
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers'
;
import { createCanvas, loadImage } from 'canvas';
import { convertImage, renderPixelArt } from './processor.js';

// Setup CLI arguments
const argv = yargs(hideBin(process.argv))
  .option('input', {
    alias: 'i',
    type: 'string',
    description: 'Path to source image or folder',
    demandOption: true
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Path to output image or folder (for batch processing)',
    default: 'output'
  })
  .option('gridWidth', {
    alias: 'w',
    type: 'number',
    default: 32,
    description: 'Grid width'
  })
  .option('gridHeight', {
    alias: 'h',
    type: 'number',
    default: 32,
    description: 'Grid height'
  })
  .option('method', {
    alias: 'm',
    type: 'string',
    choices: ['most', 'average', 'neighbor', 'most_light', 'most_dark'],
    default: 'most',
    description: 'Conversion method'
  })
  .option('scale', {
    alias: 's',
    type: 'number',
    default: 1.0,
    description: 'Source image scale (zoom)'
  })
  .option('offsetX', {
    alias: 'x',
    type: 'number',
    default: 0,
    description: 'Horizontal offset'
  })
  .option('offsetY', {
    alias: 'y',
    type: 'number',
    default: 0,
    description: 'Vertical offset'
  })
  .option('exportScale', {
    alias: 'es',
    type: 'number',
    default: 1,
    description: 'Scale factor for the output image (pixel art size multiplier)'
  })
  .option('canvasWidth', {
    type: 'number',
    description: 'Canvas width used in browser (for exact parameter reproduction)'
  })
  .option('canvasHeight', {
    type: 'number',
    description: 'Canvas height used in browser (for exact parameter reproduction)'
  })
  .help()
  .argv;

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];

/**
 * Process a single image file
 */
async function processImage(inputPath, outputPath, options) {
  try {
    const originalImg = await loadImage(inputPath);
    
    // Match browser behavior: downscale to max 1024px on largest dimension
    const maxSize = 1024;
    let targetWidth = originalImg.width;
    let targetHeight = originalImg.height;
    
    if (targetWidth > maxSize || targetHeight > maxSize) {
      const scaleFactor = Math.min(maxSize / targetWidth, maxSize / targetHeight);
      targetWidth = Math.round(targetWidth * scaleFactor);
      targetHeight = Math.round(targetHeight * scaleFactor);
    }
    
    // Create downscaled image if needed
    let img;
    if (targetWidth !== originalImg.width || targetHeight !== originalImg.height) {
      const tempCanvas = createCanvas(targetWidth, targetHeight);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(originalImg, 0, 0, targetWidth, targetHeight);
      // Load the downscaled image
      img = await loadImage(tempCanvas.toBuffer('image/png'));
    } else {
      img = originalImg;
    }
    
    const canvasWidth = options.canvasWidth || (options.gridWidth * 4);
    const canvasHeight = options.canvasHeight || (options.gridHeight * 4);
    
    // Setup source canvas
    const srcCanvas = createCanvas(img.width, img.height);
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);
    
    const conversionOptions = {
      gridWidth: options.gridWidth,
      gridHeight: options.gridHeight,
      method: options.method,
      offsetX: options.offsetX,
      offsetY: options.offsetY,
      imageScale: options.scale,
      canvasWidth: canvasWidth,
      canvasHeight: canvasHeight
    };
    
    const pixelColors = convertImage(srcCtx, { width: img.width, height: img.height }, conversionOptions);
    
    // Render Output
    const exportScale = options.exportScale;
    const outWidth = options.gridWidth * exportScale;
    const outHeight = options.gridHeight * exportScale;
    const outCanvas = createCanvas(outWidth, outHeight);
    const outCtx = outCanvas.getContext('2d');
    
    renderPixelArt(pixelColors, outCtx, { width: outWidth, height: outHeight });
    
    const buffer = outCanvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return true;
  } catch (err) {
    console.error(`Error processing ${inputPath}:`, err.message);
    return false;
  }
}

/**
 * Get all image files from a directory
 */
function getImageFiles(dirPath) {
  const files = fs.readdirSync(dirPath);
  return files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  }).map(file => path.join(dirPath, file));
}

/**
 * Main execution function
 */
async function run() {
  try {
    const inputPath = argv.input;
    const outputPath = argv.output;
    
    // Check if input is a file or directory
    const stats = fs.statSync(inputPath);
    
    const options = {
      gridWidth: argv.gridWidth,
      gridHeight: argv.gridHeight,
      method: argv.method,
      scale: argv.scale,
      offsetX: argv.offsetX,
      offsetY: argv.offsetY,
      exportScale: argv.exportScale,
      canvasWidth: argv.canvasWidth,
      canvasHeight: argv.canvasHeight
    };
    
    if (stats.isDirectory()) {
      // Batch processing mode
      console.log(`📁 Batch processing folder: ${inputPath}`);
      
      const imageFiles = getImageFiles(inputPath);
      
      if (imageFiles.length === 0) {
        console.log('⚠️  No image files found in the input folder.');
        return;
      }
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      
      console.log(`Found ${imageFiles.length} image(s) to process...\n`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < imageFiles.length; i++) {
        const inputFile = imageFiles[i];
        const fileName = path.basename(inputFile, path.extname(inputFile));
        const outputFile = path.join(outputPath, `${fileName}_pixel.png`);
        
        process.stdout.write(`[${i + 1}/${imageFiles.length}] Processing ${path.basename(inputFile)}... `);
        
        const success = await processImage(inputFile, outputFile, options);
        
        if (success) {
          console.log('✓');
          successCount++;
        } else {
          console.log('✗');
          failCount++;
        }
      }
      
      console.log(`\n✨ Batch processing complete!`);
      console.log(`   Success: ${successCount}`);
      if (failCount > 0) {
        console.log(`   Failed: ${failCount}`);
      }
      console.log(`   Output folder: ${outputPath}`);
      
    } else {
      // Single file processing mode
      console.log(`🖼️  Processing single image: ${inputPath}`);
      
      const success = await processImage(inputPath, outputPath, options);
      
      if (success) {
        console.log(`✓ Successfully created ${outputPath}`);
      } else {
        process.exit(1);
      }
    }
    
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

run();
