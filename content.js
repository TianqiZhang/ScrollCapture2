let isSelecting = false;
let isCapturing = false;
let startX, startY;
let overlay, selection;
let frames = [];
let scrollInterval;
let lastScrollPosition = { x: 0, y: 0 };
let preventScrollHandler = null; // Store the handler globally
let captureConfig = {
    direction: 'vertical',
    overlap: 0.2, // 20% overlap between frames
    captureInterval: 100, // ms between captures
};

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

async function endSelection(e) {
    if (!isSelecting) return;
    isSelecting = false;

    const rect = selection.getBoundingClientRect();
    
    // Create capture control UI
    createCaptureControls(rect);
}

function createCaptureControls(rect) {
    const controls = document.createElement('div');
    controls.className = 'capture-controls';
    controls.innerHTML = `
        <button id="startScrollCapture">Start Scroll Capture</button>
        <select id="scrollDirection">
            <option value="vertical">Vertical Scroll</option>
            <option value="horizontal">Horizontal Scroll</option>
        </select>
        <button id="cancelCapture">Cancel</button>
    `;
    
    controls.style.left = rect.left + 'px';
    controls.style.top = (rect.bottom + 10) + 'px';
    document.body.appendChild(controls);

    document.getElementById('startScrollCapture').onclick = () => {
        captureConfig.direction = document.getElementById('scrollDirection').value;
        startScrollCapture(rect);
        document.body.removeChild(controls);
    };

    document.getElementById('cancelCapture').onclick = () => {
        cleanup();
    };
}

async function startScrollCapture(rect) {
    frames = [];
    isCapturing = true;
    
    // Create scroll prevention function
    preventScrollHandler = (e) => {
        if (isCapturing) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    // Create a scroll container overlay
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'scroll-container hide-for-capture';
    scrollContainer.style.left = rect.left + 'px';
    scrollContainer.style.top = rect.top + 'px';
    scrollContainer.style.width = rect.width + 'px';
    scrollContainer.style.height = rect.height + 'px';
    document.body.appendChild(scrollContainer);

    // Save initial scroll position
    lastScrollPosition = {
        x: window.scrollX,
        y: window.scrollY
    };

    // Add scroll event listener to prevent manual scrolling during capture
    document.addEventListener('wheel', preventScrollHandler, { passive: false });
    document.addEventListener('touchmove', preventScrollHandler, { passive: false });

    let currentScroll = 0;
    const scrollStep = Math.floor(rect.height * (1 - captureConfig.overlap));

    // Capture initial frame before starting to scroll
    await captureFrame(rect);

    const simulateScroll = async () => {
        if (!isCapturing) {
            cleanup();
            return;
        }

        // Wait a bit before scrolling to ensure any previous animations have finished
        await new Promise(resolve => setTimeout(resolve, 100));

        // Scroll
        if (captureConfig.direction === 'vertical') {
            window.scrollBy({
                top: scrollStep,
                behavior: 'smooth'
            });
        } else {
            window.scrollBy({
                left: scrollStep,
                behavior: 'smooth'
            });
        }

        // Wait for scroll animation and any dynamic content to settle
        await new Promise(resolve => {
            let scrollEndDetected = false;
            
            const checkScroll = () => {
                if (document.documentElement.classList.contains('scrolling')) {
                    requestAnimationFrame(checkScroll);
                } else if (!scrollEndDetected) {
                    scrollEndDetected = true;
                    // Additional delay for dynamic content
                    setTimeout(resolve, 200);
                }
            };
            
            // Add scrolling class
            document.documentElement.classList.add('scrolling');
            
            // Start checking scroll state
            requestAnimationFrame(checkScroll);
            
            // Fallback timeout in case scroll event doesn't fire
            setTimeout(() => {
                document.documentElement.classList.remove('scrolling');
                resolve();
            }, 1000);
        });

        // Remove scrolling class
        document.documentElement.classList.remove('scrolling');

        // Capture frame after scroll has settled
        await captureFrame(rect);

        const maxScroll = captureConfig.direction === 'vertical' 
            ? document.documentElement.scrollHeight - window.innerHeight
            : document.documentElement.scrollWidth - window.innerWidth;
        
        currentScroll = captureConfig.direction === 'vertical' 
            ? window.scrollY 
            : window.scrollX;

        // Update scroll container position to follow the scroll
        if (captureConfig.direction === 'vertical') {
            scrollContainer.style.top = (rect.top + (currentScroll - lastScrollPosition.y)) + 'px';
        } else {
            scrollContainer.style.left = (rect.left + (currentScroll - lastScrollPosition.x)) + 'px';
        }

        if ((captureConfig.direction === 'vertical' && currentScroll >= maxScroll) ||
            (captureConfig.direction === 'horizontal' && currentScroll >= maxScroll)) {
            await finishCapture(rect);
            return;
        }

        // Use requestAnimationFrame for next scroll
        requestAnimationFrame(simulateScroll);
    };

    // Start the scrolling process
    requestAnimationFrame(simulateScroll);
}

// Add scroll event listener to track scroll state
document.addEventListener('scroll', () => {
    document.documentElement.classList.add('scrolling');
    clearTimeout(window.scrollTimeout);
    window.scrollTimeout = setTimeout(() => {
        document.documentElement.classList.remove('scrolling');
    }, 100);
}, { passive: true });

function captureFrame(rect) {
    return new Promise((resolve) => {
        const frameData = {
            area: {
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height,
                devicePixelRatio: window.devicePixelRatio,
                scrollX: window.scrollX,
                scrollY: window.scrollY
            }
        };
        
        frames.push(frameData);
        
        // Send message and wait for response before resolving
        chrome.runtime.sendMessage({ 
            action: 'captureFrame',
            frameData: frameData
        }, () => {
            // Resolve after getting response from background script
            resolve();
        });
    });
}

async function finishCapture(rect) {
    clearInterval(scrollInterval);
    isCapturing = false;

    // Restore original scroll position
    window.scrollTo(lastScrollPosition.x, lastScrollPosition.y);

    // Send all frames for processing and wait for response
    await new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'processCapturedFrames',
            frames: frames,
            config: {
                direction: captureConfig.direction,
                overlap: captureConfig.overlap,
                totalWidth: rect.width,
                totalHeight: rect.height,
                devicePixelRatio: window.devicePixelRatio
            }
        }, () => {
            resolve();
        });
    });

    cleanup();
}

function cleanup() {
    const scrollContainer = document.querySelector('.scroll-container');
    if (scrollContainer) {
        if (preventScrollHandler) {
            document.removeEventListener('wheel', preventScrollHandler, { passive: false });
            document.removeEventListener('touchmove', preventScrollHandler, { passive: false });
            preventScrollHandler = null;
        }
        document.body.removeChild(scrollContainer);
    }
    
    if (overlay && overlay.parentNode) {
        document.body.removeChild(overlay);
    }
    
    frames = [];
    isCapturing = false;
    if (scrollInterval) {
        clearInterval(scrollInterval);
    }
}