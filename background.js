let capturedFrames = new Map();
let currentCaptureId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureFrame') {
        handleFrameCapture(request.frameData, sender.tab.id);
        return true;
    } else if (request.action === 'processCapturedFrames') {
        processFrames(request.frames, request.config, sender.tab.id);
        return true;
    } else if (request.action === 'capture') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
            // Create a bitmap from the data URL
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);

            // Create offscreen canvas
            const canvas = new OffscreenCanvas(
                request.area.width * request.area.devicePixelRatio,
                request.area.height * request.area.devicePixelRatio
            );
            const context = canvas.getContext('2d');
            
            // Draw the cropped area
            context.drawImage(
                bitmap,
                request.area.x * request.area.devicePixelRatio,
                request.area.y * request.area.devicePixelRatio,
                request.area.width * request.area.devicePixelRatio,
                request.area.height * request.area.devicePixelRatio,
                0,
                0,
                canvas.width,
                canvas.height
            );

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `screenshot-${timestamp}.png`;
            
            // Convert to blob and back to data URL for the cropped version
            const newBlob = await canvas.convertToBlob({ type: 'image/png' });
            const reader = new FileReader();
            reader.onloadend = () => {
                chrome.downloads.download({
                    url: reader.result,
                    filename: filename,
                    saveAs: true
                });
            };
            reader.readAsDataURL(newBlob);
        });
    }
    return true;
});

async function handleFrameCapture(frameData, tabId) {
    // Capture the visible tab
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
        const frame = {
            dataUrl,
            ...frameData
        };
        
        if (!capturedFrames.has(tabId)) {
            capturedFrames.set(tabId, []);
        }
        capturedFrames.get(tabId).push(frame);
    });
}

async function processFrames(frames, config, tabId) {
    const storedFrames = capturedFrames.get(tabId) || [];
    if (!storedFrames.length) return;

    // Calculate total dimensions
    let totalWidth = config.direction === 'horizontal' 
        ? frames.reduce((max, f) => Math.max(max, f.area.scrollX + f.area.width), 0)
        : config.totalWidth;
    
    let totalHeight = config.direction === 'vertical'
        ? frames.reduce((max, f) => Math.max(max, f.area.scrollY + f.area.height), 0)
        : config.totalHeight;

    // Create final canvas using devicePixelRatio from config
    const canvas = new OffscreenCanvas(
        totalWidth * config.devicePixelRatio,
        totalHeight * config.devicePixelRatio
    );
    const ctx = canvas.getContext('2d');

    // Process each frame
    for (let i = 0; i < storedFrames.length; i++) {
        const frame = storedFrames[i];
        const response = await fetch(frame.dataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        // Calculate position based on scroll offset
        const x = config.direction === 'horizontal' ? frame.area.scrollX : frame.area.x;
        const y = config.direction === 'vertical' ? frame.area.scrollY : frame.area.y;

        // Draw frame
        ctx.drawImage(
            bitmap,
            frame.area.x * frame.area.devicePixelRatio,
            frame.area.y * frame.area.devicePixelRatio,
            frame.area.width * frame.area.devicePixelRatio,
            frame.area.height * frame.area.devicePixelRatio,
            x * frame.area.devicePixelRatio,
            y * frame.area.devicePixelRatio,
            frame.area.width * frame.area.devicePixelRatio,
            frame.area.height * frame.area.devicePixelRatio
        );
    }

    // Clear stored frames
    capturedFrames.delete(tabId);

    // Save the final image
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scrollshot-${timestamp}.png`;
    
    const finalBlob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReader();
    reader.onloadend = () => {
        chrome.downloads.download({
            url: reader.result,
            filename: filename,
            saveAs: true
        });
    };
    reader.readAsDataURL(finalBlob);
}

// Keep existing commands listener
chrome.commands.onCommand.addListener((command) => {
    if (command === "start-capture") {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "startCapture"});
        });
    }
});