"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const _ = require("lodash");
const tar = require("tar-stream");
const bundle_1 = require("./bundle");
exports.Bundle = bundle_1.default;
const Utils = require("./utils");
const archDockerfile_1 = require("./resolvers/archDockerfile");
exports.ArchDockerfileResolver = archDockerfile_1.default;
const dockerfile_1 = require("./resolvers/dockerfile");
exports.DockerfileResolver = dockerfile_1.default;
const dockerfileTemplate_1 = require("./resolvers/dockerfileTemplate");
exports.DockerfileTemplateResolver = dockerfileTemplate_1.default;
const nodeResolver_1 = require("./resolvers/nodeResolver");
function resolveBundle(bundle, resolvers) {
    return new Promise((resolve, reject) => {
        const extract = tar.extract();
        const pack = tar.pack();
        extract.on('entry', (header, stream, next) => {
            Utils.streamToBuffer(stream).then((buffer) => {
                pack.entry(header, buffer);
                const info = {
                    name: Utils.normalizeTarEntry(header.name),
                    size: header.size,
                    contents: buffer,
                };
                resolvers.map(resolver => {
                    resolver.entry(info);
                });
                next();
            });
        });
        extract.on('finish', () => {
            const maybeResolver = _(resolvers)
                .orderBy((val) => val.priority, ['desc'])
                .find((r) => r.isSatisfied(bundle));
            if (maybeResolver === undefined) {
                reject(new Error('No project type resolution could be performed'));
                return;
            }
            const resolver = maybeResolver;
            resolver
                .resolve(bundle)
                .then(additionalItems => {
                return Promise.map(additionalItems, (file) => {
                    pack.entry({ name: file.name, size: file.size }, file.contents);
                    if (file.name === 'Dockerfile') {
                        return bundle.callDockerfileHook(file.contents.toString());
                    }
                })
                    .then(() => {
                    return Promise.try(() => {
                        if (resolver.name === 'Standard Dockerfile') {
                            return bundle.callDockerfileHook(resolver.getDockerfileContents());
                        }
                    });
                })
                    .then(() => {
                    pack.finalize();
                    resolve({
                        projectType: resolver.name,
                        tarStream: pack,
                    });
                });
            })
                .catch(reject);
        });
        bundle.tarStream.pipe(extract);
    });
}
exports.resolveBundle = resolveBundle;
function getDefaultResolvers() {
    return [
        new dockerfile_1.default(),
        new dockerfileTemplate_1.default(),
        new archDockerfile_1.default(),
        new nodeResolver_1.default(),
    ];
}
exports.getDefaultResolvers = getDefaultResolvers;

//# sourceMappingURL=index.js.map
