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
        }
    }
    isSatisfied() {
        return this.gotDockerfile;
    }
    resolve() {
        // We don't need to add any extra files to the Dockerfile project
        return Promise.resolve([]);
    }
}
exports.default = DockerfileResolver;

//# sourceMappingURL=dockerfile.js.map
