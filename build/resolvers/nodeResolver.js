"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
class NodeResolver {
    constructor() {
        this.priority = 0;
        this.name = 'NodeJS';
        this.hasPackageJson = false;
    }
    entry(file) {
        if (file.name == 'package.json') {
            this.hasPackageJson = true;
        }
    }
    isSatisfied(bundle) {
        return this.hasPackageJson;
    }
    resolve(bundle) {
        // Generate a dockerfile which will run the file
        // Use latest node base image. Don't use the slim image just in case
        // TODO: Find out which apt-get packages are installed mostly with node
        // base images.
        const dockerfile = `FROM resin/${bundle.deviceType}-node

WORKDIR /usr/src/app

COPY package.json .
RUN npm install

COPY . ./
CMD ["npm", "start"]
		`;
        const file = {
            name: 'Dockerfile',
            size: dockerfile.length,
            contents: new Buffer(dockerfile)
        };
        return Promise.resolve([file]);
    }
}
exports.default = NodeResolver;
//# sourceMappingURL=nodeResolver.js.map