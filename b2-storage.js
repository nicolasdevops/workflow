/**
 * Backblaze B2 Storage Module
 *
 * Uses B2's S3-compatible API to store Instagram media permanently.
 * Instagram CDN URLs expire after 24-48 hours, so we download and re-upload
 * to B2 for persistent storage.
 *
 * Required env vars:
 * - B2_KEY_ID: Application Key ID
 * - B2_APPLICATION_KEY: Application Key
 * - B2_BUCKET_NAME: Bucket name
 * - B2_REGION: Region (e.g., 'us-west-004')
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const http = require('http');

// B2 configuration
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_REGION = process.env.B2_REGION || 'us-west-004';

// S3 client for B2
let s3Client = null;

/**
 * Initialize B2 client
 */
function initB2Client() {
    if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET_NAME) {
        console.warn('[B2] Missing credentials, storage disabled');
        return null;
    }

    if (s3Client) return s3Client;

    s3Client = new S3Client({
        endpoint: `https://s3.${B2_REGION}.backblazeb2.com`,
        region: B2_REGION,
        credentials: {
            accessKeyId: B2_KEY_ID,
            secretAccessKey: B2_APPLICATION_KEY,
        },
    });

    console.log('[B2] Storage client initialized');
    return s3Client;
}

/**
 * Check if B2 storage is configured
 */
function isB2Configured() {
    return !!(B2_KEY_ID && B2_APPLICATION_KEY && B2_BUCKET_NAME);
}

/**
 * Download file from URL to buffer
 */
async function downloadToBuffer(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, { timeout: 30000 }, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadToBuffer(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Download failed: ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });

        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

/**
 * Get content type from URL or extension
 */
function getContentType(url, isVideo = false) {
    if (isVideo) return 'video/mp4';

    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    const types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
    };
    return types[ext] || 'application/octet-stream';
}

/**
 * Upload buffer to B2
 * @param {Buffer} buffer - File data
 * @param {string} key - S3 key (path in bucket)
 * @param {string} contentType - MIME type
 * @returns {string} Public URL
 */
async function uploadToB2(buffer, key, contentType) {
    const client = initB2Client();
    if (!client) {
        throw new Error('B2 storage not configured');
    }

    const command = new PutObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });

    await client.send(command);

    // Return the friendly B2 URL
    return `https://f004.backblazeb2.com/file/${B2_BUCKET_NAME}/${key}`;
}

/**
 * Upload Instagram media to B2
 * @param {string} url - Instagram CDN URL
 * @param {string} familyId - Family ID for organization
 * @param {string} shortCode - Post short code
 * @param {string} type - 'post', 'profile', 'video'
 * @param {boolean} isVideo - Whether this is a video
 */
async function uploadInstagramMedia(url, familyId, shortCode, type = 'post', isVideo = false) {
    if (!isB2Configured()) {
        console.log('[B2] Not configured, returning original URL');
        return url;
    }

    if (!url) return null;

    try {
        console.log(`[B2] Downloading ${type}: ${shortCode || 'profile'}`);
        const buffer = await downloadToBuffer(url);

        // Generate key
        const ext = isVideo ? 'mp4' : 'jpg';
        let key;

        if (type === 'profile') {
            key = `families/${familyId}/profile.${ext}`;
        } else {
            key = `families/${familyId}/${type}s/${shortCode}.${ext}`;
        }

        const contentType = getContentType(url, isVideo);

        console.log(`[B2] Uploading to ${key}`);
        const b2Url = await uploadToB2(buffer, key, contentType);

        console.log(`[B2] Uploaded: ${b2Url}`);
        return b2Url;

    } catch (err) {
        console.error(`[B2] Upload failed for ${shortCode || type}:`, err.message);
        // Return original URL as fallback
        return url;
    }
}

/**
 * Upload profile picture to B2
 */
async function uploadProfilePic(url, familyId) {
    return uploadInstagramMedia(url, familyId, null, 'profile', false);
}

/**
 * Upload post image to B2
 */
async function uploadPostImage(url, familyId, shortCode) {
    return uploadInstagramMedia(url, familyId, shortCode, 'post', false);
}

/**
 * Upload video to B2
 */
async function uploadVideo(url, familyId, shortCode) {
    return uploadInstagramMedia(url, familyId, shortCode, 'video', true);
}

/**
 * Upload family media (photos/videos uploaded by families)
 * @param {Buffer} buffer - File data
 * @param {string} familyId - Family ID
 * @param {string} fileName - Original filename
 * @param {string} contentType - MIME type
 * @returns {object} { url, key } or throws error
 */
async function uploadFamilyMedia(buffer, familyId, fileName, contentType) {
    if (!isB2Configured()) {
        throw new Error('B2 storage not configured');
    }

    // Generate unique key
    const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const timestamp = Date.now();
    const key = `families/${familyId}/uploads/${timestamp}.${ext}`;

    console.log(`[B2] Uploading family media: ${key} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    const b2Url = await uploadToB2(buffer, key, contentType);

    console.log(`[B2] Family media uploaded: ${b2Url}`);
    return { url: b2Url, key };
}

/**
 * Delete file from B2
 */
async function deleteFromB2(key) {
    const client = initB2Client();
    if (!client) return;

    try {
        const command = new DeleteObjectCommand({
            Bucket: B2_BUCKET_NAME,
            Key: key,
        });
        await client.send(command);
        console.log(`[B2] Deleted: ${key}`);
    } catch (err) {
        console.error(`[B2] Delete failed:`, err.message);
    }
}

module.exports = {
    initB2Client,
    isB2Configured,
    uploadToB2,
    uploadInstagramMedia,
    uploadProfilePic,
    uploadPostImage,
    uploadVideo,
    uploadFamilyMedia,
    deleteFromB2,
    downloadToBuffer,
};
