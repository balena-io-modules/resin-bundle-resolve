"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const path = require("path");
class ArchDockerfileResolver {
    constructor() {
        this.priority = 1;
        this.name = 'Archicture-specific Dockerfile';
        this.archDockerfiles = [];
    }
    entry(file) {
        if (file.name.substr(0, file.name.indexOf('.')) === 'Dockerfile') {
            // If it's a dockerfile with an extension, save it
            // unless it's a Dockerfile.template, in which case don't
            // Remove the . from the start of the extension
            const ext = path.extname(file.name).substr(1);
            if (ext !== 'template') {
                this.archDockerfiles.push([ext, file]);
            }
        }
    }
    isSatisfied(bundle) {
        // Check for both satisfied architecture and device type
        this.archDockerfiles.map((dockerfile) => {
            if (dockerfile[0] === bundle.architecture) {
                this.satisifiedArch = dockerfile;
            }
            else if (dockerfile[0] === bundle.deviceType) {
                this.satisfiedDeviceType = dockerfile;
            }
        });
        return (this.satisifiedArch !== undefined)
            || (this.satisfiedDeviceType !== undefined);
    }
    resolve(bundle) {
        // Return the satisfied arch/deviceType specific dockerfile,
        // as a plain Dockerfile, and the docker daemon will then
        // execute that
        // device type takes precedence
        let satisfied;
        if (this.satisfiedDeviceType !== undefined) {
            satisfied = this.satisfiedDeviceType;
        }
        else if (this.satisifiedArch !== undefined) {
            satisfied = this.satisifiedArch;
        }
        else {
            throw new Error('Resolve called without a satisfied architecture specific dockerfile');
        }
        return Promise.resolve([{
                name: 'Dockerfile',
                size: satisfied[1].size,
                contents: satisfied[1].contents
            }]);
    }
}
exports.default = ArchDockerfileResolver;

//# sourceMappingURL=archDockerfile.js.map
