# Pixel Perfect - AI Art Converter (CLI Edition)

> **Fork of [Pixel-Perfect-AI-Art-Converter](https://github.com/nygaard91/Pixel-Perfect-AI-Art-Converter)** with added CLI support and batch processing capabilities.

## What's New

This fork adds command-line interface (CLI) support for batch processing, making it easy to convert entire folders of images using parameters fine-tuned in the browser GUI.

**New Features:**
- **CLI Tool** - Process images from the command line
- **Bulk Processing** - Convert entire folders of images at once
- **Parameter Export** - "Get CLI Command" button generates exact CLI commands from browser settings
- **Identical Results** - Shared core logic ensures browser and CLI produce the same output
- **Auto-Downscaling** - Images are automatically downscaled to 1024px max (matching browser behavior)

---

## Quick Start

### Browser Tool
```bash
npm install
npm start
```
Then open http://localhost:3000 in your browser.

### CLI Tool

**Single Image:**
```bash
node cli.js --input image.png --output result.png --gridWidth 32 --gridHeight 32
```

**Bulk Processing (Entire Folder):**
```bash
node cli.js --input ./input --output ./output --gridWidth 64 --gridHeight 64 --method most_dark
```

---

## CLI Reference

### Options

```
Options:
  -i, --input              Path to source image or folder           [required]
  -o, --output             Path to output image or folder  [default: "output"]
  -w, --gridWidth          Grid width                       [default: 32]
  -h, --gridHeight         Grid height                      [default: 32]
  -m, --method             Conversion method
                           [choices: "most", "average", "neighbor", 
                            "most_light", "most_dark"]      [default: "most"]
  -s, --scale              Source image scale (zoom)        [default: 1]
  -x, --offsetX            Horizontal offset                [default: 0]
  -y, --offsetY            Vertical offset                  [default: 0]
      --exportScale, --es  Output scale multiplier          [default: 1]
      --canvasWidth        Canvas width (for exact browser reproduction)
      --canvasHeight       Canvas height (for exact browser reproduction)
      --help               Show help
```

### Conversion Methods

- **`most`** - Most used color (dominant color in each cell)
- **`average`** - Average color (smooth blend)
- **`neighbor`** - Neighbor-aware average (samples larger area)
- **`most_light`** - Most used color prioritizing lighter shades
- **`most_dark`** - Most used color prioritizing darker shades

### Recommended Workflow

1. **Fine-tune in Browser:**
   - Load your image in the browser tool
   - Adjust grid size, zoom, and position
   - Try different conversion methods
   - Preview the result

2. **Export Parameters:**
   - Click "Get CLI Command" button
   - Command is copied to clipboard with exact parameters

3. **Batch Process:**
   - Place all images in a folder (e.g., `./input`)
   - Run the CLI command with `--input ./input`
   - All images processed with same settings
   - Output saved to `./output` folder

### Examples

**Process a single image with custom grid:**
```bash
node cli.js --input character.png --gridWidth 64 --gridHeight 64 --method most_dark
```

**Batch process with exact browser parameters:**
```bash
node cli.js --input ./input --gridWidth 64 --gridHeight 64 --method most_dark --scale 1.69 --offsetX -600 --offsetY -96 --canvasWidth 896 --canvasHeight 896
```

**Export at higher resolution:**
```bash
node cli.js --input sprite.png --gridWidth 32 --gridHeight 32 --exportScale 8
```

---

## Installation

```bash
npm install
```

This installs all dependencies needed for both the browser tool and CLI.

---

## Browser Tool Features

For detailed information about the browser tool features, conversion methods, and technical details, see the [original repository](https://github.com/nygaard91/Pixel-Perfect-AI-Art-Converter).

**Key Features:**
- Interactive GUI for precise positioning
- Multiple conversion methods
- Real-time preview
- Editing tools (brush, eraser, magic wand)
- Undo/Redo support
- Multiple export scales

**Hotkeys:**
- **Ctrl+Z:** Undo
- **Ctrl+Y:** Redo
- **Alt+B:** Toggle background
- **Alt+G:** Toggle grid color

---

## Architecture

The codebase is modular to support both browser and CLI:

- **`processor.js`** - Core conversion logic (shared)
- **`script.js`** - Browser UI and interactions
- **`cli.js`** - Command-line interface
- **`index.html`** - Browser interface

This ensures identical results whether you use the GUI or CLI.

---

## License

Same as the original project. See [LICENSE](LICENSE) file.

---

## Credits

- **Original Project:** [Pixel-Perfect-AI-Art-Converter](https://github.com/nygaard91/Pixel-Perfect-AI-Art-Converter) by nygaard91
- **CLI Extension:** Added batch processing and command-line interface
