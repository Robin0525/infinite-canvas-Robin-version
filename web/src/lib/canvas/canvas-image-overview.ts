const OVERVIEW_SIZE = 768;
const OVERVIEW_GAP = 6;

export async function createImageOverview(urls: string[]) {
    const visibleUrls = urls.filter(Boolean).slice(0, 9);
    if (!visibleUrls.length) return null;
    const settledImages = await Promise.allSettled(visibleUrls.map(loadImage));
    const images = settledImages.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    if (!images.length) return null;
    const columns = Math.ceil(Math.sqrt(images.length));
    const rows = Math.ceil(images.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = OVERVIEW_SIZE;
    canvas.height = OVERVIEW_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#f5f5f4";
    context.fillRect(0, 0, OVERVIEW_SIZE, OVERVIEW_SIZE);
    const cellWidth = (OVERVIEW_SIZE - OVERVIEW_GAP * (columns - 1)) / columns;
    const cellHeight = (OVERVIEW_SIZE - OVERVIEW_GAP * (rows - 1)) / rows;
    images.forEach((image, index) => {
        const x = (index % columns) * (cellWidth + OVERVIEW_GAP);
        const y = Math.floor(index / columns) * (cellHeight + OVERVIEW_GAP);
        const scale = Math.max(cellWidth / image.width, cellHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.save();
        context.beginPath();
        context.rect(x, y, cellWidth, cellHeight);
        context.clip();
        context.drawImage(image, x + (cellWidth - width) / 2, y + (cellHeight - height) / 2, width, height);
        context.restore();
        image.close();
    });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

async function loadImage(url: string) {
    return createImageBitmap(await (await fetch(url)).blob());
}
