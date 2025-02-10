chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'capture') {
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