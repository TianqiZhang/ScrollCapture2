let isSelecting = false;
let startX, startY;
let overlay, selection;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startCapture") {
        createSelectionOverlay();
    }
});

function createSelectionOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'selection-overlay';
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', startSelection);
    overlay.addEventListener('mousemove', updateSelection);
    overlay.addEventListener('mouseup', endSelection);
}

function startSelection(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selection = document.createElement('div');
    selection.className = 'selection-area';
    overlay.appendChild(selection);
}

function updateSelection(e) {
    if (!isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
}

function endSelection(e) {
    if (!isSelecting) return;
    isSelecting = false;

    const rect = selection.getBoundingClientRect();
    captureArea(rect);

    // Clean up
    document.body.removeChild(overlay);
}

function captureArea(rect) {
    const devicePixelRatio = window.devicePixelRatio;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set canvas size to match the selection size multiplied by device pixel ratio
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;

    // Send message to capture the screen
    chrome.runtime.sendMessage({ 
        action: 'capture',
        area: {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
            devicePixelRatio: devicePixelRatio
        }
    });
}