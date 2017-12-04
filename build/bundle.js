"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const emptyHook = (_contents) => {
    return Promise.resolve();
};
class Bundle {
    constructor(tarStream, deviceType, architecture, hook = emptyHook) {
        this.tarStream = tarStream;
        this.deviceType = deviceType;
        this.architecture = architecture;
        this.dockerfileHook = hook;
    }
    callDockerfileHook(contents) {
        return this.dockerfileHook(contents);
    }
}
exports.default = Bundle;

//# sourceMappingURL=bundle.js.map
