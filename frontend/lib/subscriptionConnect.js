export function getV2raytunImportUrl(value) {
    if (typeof value !== "string" || value.length > 4096
        || !/^https:\/\//i.test(value) || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;

    try {
        const url = new URL(value);
        if (!url.hostname || url.username || url.password || url.hash) return null;
    } catch {
        return null;
    }

    // The native handler expects the original subscription URL, not another encoding layer.
    return `v2raytun://import/${value}`;
}
