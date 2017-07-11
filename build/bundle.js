"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const emptyHook = (contents) => {
    return Promise.resolve();
};
class Bundle {
    /**
     * constructor: Initialise a resin-bundle with a tar archive stream
     *
     * @param tarStream
     *	A readable stream which when consumed will produce a tar archive containing
     *	a resin bundle
     * @param deviceType
     *  The machine name of the device that this resin bundle is currently targeting
     * @param architecture
     *  The architecture that this resin bundle is currently targeting
     */
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
