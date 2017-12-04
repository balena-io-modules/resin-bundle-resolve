"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
class DockerfileResolver {
    constructor() {
        this.priority = 0;
        this.name = 'Standard Dockerfile';
        this.gotDockerfile = false;
    }
    entry(file) {
        if (file.name === 'Dockerfile') {
            this.gotDockerfile = true;
            this.dockerfileContents = file.contents.toString();
        }
    }
    isSatisfied() {
        return this.gotDockerfile;
    }
    resolve() {
        return Promise.resolve([]);
    }
    getDockerfileContents() {
        return this.dockerfileContents;
    }
}
exports.default = DockerfileResolver;

//# sourceMappingURL=dockerfile.js.map
