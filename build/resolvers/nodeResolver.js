"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const _ = require("lodash");
class NodeResolver {
    constructor() {
        this.priority = 0;
        this.name = 'NodeJS';
        this.hasScripts = false;
    }
    entry(file) {
        if (file.name == 'package.json') {
            this.packageJsonContent = file.contents;
        }
        else if (file.name === 'wscript' || _.endsWith(file.name, '.gyp')) {
            this.hasScripts = true;
        }
    }
    isSatisfied(bundle) {
        return this.packageJsonContent != null;
    }
    resolve(bundle) {
        // Generate a dockerfile which will run the file
        // Use latest node base image. Don't use the slim image just in case
        // TODO: Find out which apt-get packages are installed mostly with node
        // base images.
        return Promise.try(() => JSON.parse(this.packageJsonContent.toString())).catch((e) => {
            throw new Error(`package.json: ${e.message}`);
        }).then((packageJson) => {
            if (!_.isObject(packageJson)) {
                throw new Error('package.json: must be a JSON object');
            }
            this.hasScripts = this.hasScripts || _(packageJson.scripts).pick('preinstall', 'install', 'postinstall').size() > 0;
            let dockerfile;
            if (this.hasScripts) {
                dockerfile = `
					FROM resin/${bundle.deviceType}-node
					WORKDIR /usr/src/app
					RUN ln -s /usr/src/app /app
					COPY . /usr/src/app
					RUN DEBIAN_FRONTEND=noninteractive JOBS=MAX npm install --unsafe-perm
					CMD [ "npm", "start" ]
					`;
            }
            else {
                dockerfile = `
					FROM resin/${bundle.deviceType}-node
					WORKDIR /usr/src/app
					RUN ln -s /usr/src/app /app

					COPY package.json .
					RUN DEBIAN_FRONTEND=noninteractive JOBS=MAX npm install --unsafe-perm

					COPY . ./
					CMD ["npm", "start"]
				`;
            }
            const file = {
                name: 'Dockerfile',
                size: dockerfile.length,
                contents: new Buffer(dockerfile)
            };
            return [file];
        });
    }
}
exports.default = NodeResolver;
//# sourceMappingURL=nodeResolver.js.map