"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const path = require("path");
function normalizeTarEntry(name) {
    const normalized = path.normalize(name);
    if (path.isAbsolute(normalized)) {
        return normalized.substr(normalized.indexOf(path.sep) + 1);
    }
    return normalized;
}
exports.normalizeTarEntry = normalizeTarEntry;
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
