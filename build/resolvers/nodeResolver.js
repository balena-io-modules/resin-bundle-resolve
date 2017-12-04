"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const _ = require("lodash");
const request = require("request");
const semver = require("semver");
const getAsync = Promise.promisify(request.get);
const BluebirdLRU = require("bluebird-lru-cache");
const DEFAULT_NODE = '0.10.22';
const versionTest = RegExp.prototype.test.bind(/^[0-9]+\.[0-9]+\.[0-9]+$/);
const versionCache = new BluebirdLRU({
    maxAge: 3600 * 1000,
    fetchFn: (deviceType) => {
        const get = (prev, url) => {
            return getAsync({
                url,
                json: true,
            })
                .get('body')
                .then((res) => {
                const curr = _(res.results).map('name').filter(versionTest).value();
                const tags = prev.concat(curr);
                if (res.next != null) {
                    return get(tags, res.next);
                }
                else {
                    return tags;
                }
            });
        };
        return get([], `https://hub.docker.com/v2/repositories/resin/${deviceType}-node/tags/?page_size=100`);
    },
});
class NodeResolver {
    constructor() {
        this.priority = 0;
        this.name = 'NodeJS';
        this.hasScripts = false;
    }
    entry(file) {
        if (file.name === 'package.json') {
            this.packageJsonContent = file.contents;
        }
        else if (file.name === 'wscript' || _.endsWith(file.name, '.gyp')) {
            this.hasScripts = true;
        }
    }
    isSatisfied(_bundle) {
        return this.packageJsonContent != null;
    }
    resolve(bundle) {
        return Promise.try(() => JSON.parse(this.packageJsonContent.toString()))
            .catch((e) => {
            throw new Error(`package.json: ${e.message}`);
        })
            .then(packageJson => {
            if (!_.isObject(packageJson)) {
                throw new Error('package.json: must be a JSON object');
            }
            this.hasScripts =
                this.hasScripts ||
                    _(packageJson.scripts)
                        .pick('preinstall', 'install', 'postinstall')
                        .size() > 0;
            const nodeEngine = _.get(packageJson, 'engines.node');
            if (nodeEngine != null && !_.isString(nodeEngine)) {
                throw new Error('package.json: engines.node must be a string if present');
            }
            const range = nodeEngine || DEFAULT_NODE;
            return versionCache.get(bundle.deviceType).then(versions => {
                const nodeVersion = semver.maxSatisfying(versions, range);
                if (nodeVersion == null) {
                    throw new Error(`Couldn't satisfy node version ${range}`);
                }
                let dockerfile;
                if (this.hasScripts) {
                    dockerfile = `
						FROM resin/${bundle.deviceType}-node:${nodeVersion}
						RUN mkdir -p /usr/src/app && ln -s /usr/src/app /app
						WORKDIR /usr/src/app
						COPY . /usr/src/app
						RUN DEBIAN_FRONTEND=noninteractive JOBS=MAX npm install --unsafe-perm
						CMD [ "npm", "start" ]
						`;
                }
                else {
                    dockerfile = `
						FROM resin/${bundle.deviceType}-node:${nodeVersion}-onbuild
						RUN ln -s /usr/src/app /app
					`;
                }
                const file = {
                    name: 'Dockerfile',
                    size: dockerfile.length,
                    contents: new Buffer(dockerfile),
                };
                return [file];
            });
        });
    }
}
exports.default = NodeResolver;

//# sourceMappingURL=nodeResolver.js.map
