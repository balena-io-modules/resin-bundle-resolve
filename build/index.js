"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const _ = require("lodash");
const tar = require("tar-stream");
const bundle_1 = require("./bundle");
exports.Bundle = bundle_1.default;
const Utils = require("./utils");
// Import some default resolvers
const dockerfile_1 = require("./resolvers/dockerfile");
exports.DockerfileResolver = dockerfile_1.default;
const dockerfileTemplate_1 = require("./resolvers/dockerfileTemplate");
exports.DockerfileTemplateResolver = dockerfileTemplate_1.default;
const archDockerfile_1 = require("./resolvers/archDockerfile");
exports.ArchDockerfileResolver = archDockerfile_1.default;
const nodeResolver_1 = require("./resolvers/nodeResolver");
function resolveBundle(bundle, resolvers) {
    return new Promise((resolve, reject) => {
        const extract = tar.extract();
        const pack = tar.pack();
        extract.on('entry', (header, stream, next) => {
            // Read the contents into a buffer
            Utils.streamToBuffer(stream)
                .then((buffer) => {
                // send the file along to the next tar stream regardless
                pack.entry(header, buffer);
                // create a FileInfo from the header
                const info = {
                    name: Utils.normalizeTarEntry(header.name),
                    size: header.size,
                    contents: buffer
                };
                // Now provide the resolvers with the information and file
                resolvers.map((resolver) => {
                    resolver.entry(info);
                });
                next();
            });
        });
        extract.on('finish', () => {
            let maybeResolver = _(resolvers)
                .orderBy((val) => val.priority, ['desc'])
                .find((resolver) => resolver.isSatisfied(bundle));
            // if no resolver was happy this is an error
            if (maybeResolver === undefined) {
                reject(new Error('No project type resolution could be performed'));
                return;
            }
            const resolver = maybeResolver;
            // Now that we have a resolver, add the new files needed to the stream
            resolver.resolve(bundle)
                .then((additionalItems) => {
                return Promise.map(additionalItems, (file) => {
                    pack.entry({ name: file.name, size: file.size }, file.contents);
                    if (file.name === 'Dockerfile') {
                        return bundle.callDockerfileHook(file.contents.toString());
                    }
                })
                    .then(() => {
                    return Promise.try(() => {
                        if (resolver.name === 'Standard Dockerfile') {
                            // The hook will not have been ran on this file yet, as the Dockerfile was not added
                            // as an additional item
                            return bundle.callDockerfileHook(resolver.getDockerfileContents());
                        }
                    });
                })
                    .then(() => {
                    // all of the extra files have now been added to the stream, resolve
                    // the promise with it
                    pack.finalize();
                    resolve({
                        projectType: resolver.name,
                        tarStream: pack
                    });
                });
            })
                .catch((error) => {
                reject(error);
            });
        });
        // Send the bundle away to be parsed
        bundle.tarStream.pipe(extract);
    });
}
exports.resolveBundle = resolveBundle;
function getDefaultResolvers() {
    return [
        new dockerfile_1.default(),
        new dockerfileTemplate_1.default(),
        new archDockerfile_1.default(),
        new nodeResolver_1.default()
    ];
}
exports.getDefaultResolvers = getDefaultResolvers;
//# sourceMappingURL=index.js.map