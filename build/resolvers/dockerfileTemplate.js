"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const DockerfileTemplate = require("dockerfile-template");
class DockerfileTemplateResolver {
    constructor() {
        this.priority = 2;
        this.name = 'Dockerfile.template';
        this.hasDockerfileTemplate = false;
    }
    entry(file) {
        if (file.name === 'Dockerfile.template') {
            this.templateContent = file.contents;
            this.hasDockerfileTemplate = true;
        }
    }
    isSatisfied(_bundle) {
        return this.hasDockerfileTemplate;
    }
    resolve(bundle) {
        const dockerfile = {
            name: 'Dockerfile',
            size: 0,
            contents: new Buffer(''),
        };
        const vars = {
            RESIN_ARCH: bundle.architecture,
            RESIN_MACHINE_NAME: bundle.deviceType,
        };
        return new Promise(resolve => {
            dockerfile.contents = new Buffer(DockerfileTemplate.process(this.templateContent.toString(), vars));
            dockerfile.size = dockerfile.contents.length;
            resolve([dockerfile]);
        });
    }
}
exports.default = DockerfileTemplateResolver;

//# sourceMappingURL=dockerfileTemplate.js.map
