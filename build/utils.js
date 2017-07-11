"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const path = require("path");
/**
 * normalizeTarEntry: Depending on how the tar archive was created,
 * filenames can be presented in several different forms, and this function
 * aims to make them all similar, for example;
 *  * ./Dockerfile -> Dockerfile
 *  * /Dockerfile -> Dockerfile
 *  * Dockerfile -> Dockerfile
 *  * ./a/b/Dockerfile -> a/b/Dockerfile
 */
function normalizeTarEntry(name) {
    const normalized = path.normalize(name);
    if (path.isAbsolute(normalized)) {
        return normalized.substr(normalized.indexOf(path.sep) + 1);
    }
    return normalized;
}
exports.normalizeTarEntry = normalizeTarEntry;
/**
 * streamToBuffer: Given a stream, read it into a buffer
 * @param stream
 * @param size
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        let buffer = new Buffer('');
        stream.on('data', (data) => (buffer = Buffer.concat([buffer, data])));
        stream.on('end', () => resolve(buffer));
        stream.on('error', reject);
    });
}
exports.streamToBuffer = streamToBuffer;

//# sourceMappingURL=utils.js.map
