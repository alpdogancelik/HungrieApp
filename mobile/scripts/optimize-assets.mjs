#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import sharp from "sharp";

const write = process.argv.includes("--write");
const assetsRoot = resolve(import.meta.dirname, "../assets");
const thresholdBytes = 300 * 1024;
const minimumPsnr = 38;
const supported = new Set([".png", ".jpg", ".jpeg"]);

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
});

const resizeLimit = (path) => {
    const normalized = path.replaceAll("\\", "/");
    if (normalized.includes("/app-icon/") || /(?:splash-icon|hungrie-mark)/i.test(normalized)) return null;
    if (normalized.includes("/Categories/")) return 512;
    if (normalized.includes("/images/")) return 1600;
    return null;
};

const psnr = async (original, candidate, width, height) => {
    const reference = await sharp(original).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const decoded = await sharp(candidate).ensureAlpha().raw().toBuffer();
    if (reference.length !== decoded.length) return 0;
    let squaredError = 0;
    for (let index = 0; index < reference.length; index += 1) {
        const difference = reference[index] - decoded[index];
        squaredError += difference * difference;
    }
    if (!squaredError) return Number.POSITIVE_INFINITY;
    const mse = squaredError / reference.length;
    return 10 * Math.log10((255 * 255) / mse);
};

const results = [];
for (const path of walk(assetsRoot)) {
    const extension = extname(path).toLowerCase();
    const originalBytes = statSync(path).size;
    if (originalBytes <= thresholdBytes || !supported.has(extension)) continue;

    const original = readFileSync(path);
    const metadata = await sharp(original).metadata();
    const max = resizeLimit(path);
    const mustResize = Boolean(max && metadata.width && metadata.height && Math.max(metadata.width, metadata.height) > max);
    let pipeline = sharp(original, { animated: false });
    if (mustResize) pipeline = pipeline.resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
    if (extension === ".png") pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false });
    else pipeline = pipeline.jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: "4:4:4" });
    const candidate = await pipeline.toBuffer();
    const candidateMetadata = await sharp(candidate).metadata();
    const similarity = await psnr(original, candidate, candidateMetadata.width, candidateMetadata.height);
    const accepted = candidate.length < original.length && similarity >= minimumPsnr;
    if (write && accepted) writeFileSync(path, candidate);
    results.push({
        path: relative(assetsRoot, path), originalBytes, optimizedBytes: accepted ? candidate.length : originalBytes,
        width: metadata.width, height: metadata.height, optimizedWidth: candidateMetadata.width,
        optimizedHeight: candidateMetadata.height, psnr: Number.isFinite(similarity) ? Number(similarity.toFixed(2)) : "lossless",
        status: accepted ? (write ? "optimized" : "would optimize") : "kept",
    });
}

const soundPath = join(assetsRoot, "sounds/hungrie.wav");
if (statSync(soundPath).size > thresholdBytes) {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "hungrie-audio-"));
    const candidatePath = join(temporaryDirectory, "hungrie.wav");
    try {
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", soundPath, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", candidatePath]);
        const originalBytes = statSync(soundPath).size;
        const optimizedBytes = statSync(candidatePath).size;
        if (write && optimizedBytes < originalBytes) renameSync(candidatePath, soundPath);
        results.push({ path: "sounds/hungrie.wav", originalBytes, optimizedBytes, status: write ? "optimized mono PCM" : "would optimize mono PCM" });
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

const originalTotal = results.reduce((sum, item) => sum + item.originalBytes, 0);
const optimizedTotal = results.reduce((sum, item) => sum + item.optimizedBytes, 0);
console.log(JSON.stringify({ mode: write ? "write" : "dry-run", minimumPsnr, originalTotal, optimizedTotal, savedBytes: originalTotal - optimizedTotal, files: results }, null, 2));
