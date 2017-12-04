"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const path = require("path");
const DockerfileTemplate = require("dockerfile-template");
class ArchDockerfileResolver {
    constructor() {
        this.priority = 3;
        this.name = 'Archicture-specific Dockerfile';
        this.archDockerfiles = [];
    }
    entry(file) {
        if (file.name.substr(0, file.name.indexOf('.')) === 'Dockerfile') {
            const ext = path.extname(file.name).substr(1);
            if (ext !== 'template') {
                this.archDockerfiles.push([ext, file]);
            }
        }
    }
    isSatisfied(bundle) {
        this.archDockerfiles.map(dockerfile => {
            if (dockerfile[0] === bundle.architecture) {
                this.satisifiedArch = dockerfile;
            }
            else if (dockerfile[0] === bundle.deviceType) {
                this.satisfiedDeviceType = dockerfile;
            }
        });
        return (this.satisifiedArch !== undefined ||
            this.satisfiedDeviceType !== undefined);
    }
    resolve(bundle) {
        let satisfied;
        if (this.satisfiedDeviceType !== undefined) {
            satisfied = this.satisfiedDeviceType;
        }
        else if (this.satisifiedArch !== undefined) {
            satisfied = this.satisifiedArch;
        }
        else {
            return Promise.reject('Resolve called without a satisfied architecture specific dockerfile');
        }
        const vars = {
            RESIN_ARCH: bundle.architecture,
            RESIN_MACHINE_NAME: bundle.deviceType,
        };
        return Promise.resolve([{
                name: 'Dockerfile',
                size: satisfied[1].size,
                contents: new Buffer(DockerfileTemplate.process(satisfied[1].contents.toString(), vars)),
            }]);
    }
}
exports.default = ArchDockerfileResolver;

//# sourceMappingURL=archDockerfile.js.map
