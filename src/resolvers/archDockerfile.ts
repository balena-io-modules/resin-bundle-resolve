import * as Promise from 'bluebird';
import * as path from 'path';

import * as DockerfileTemplate from 'dockerfile-template';

import { Bundle, FileInfo, Resolver } from '../resolver';

// Internal tuple to pass files and their extensions around
// the class
// ArchSpecificDockerfile = [extension, file info]
type ArchSpecificDockerfile = [string, FileInfo];

export default class ArchDockerfileResolver implements Resolver {
	public priority = 3;
	public name = 'Archicture-specific Dockerfile';

	private archDockerfiles: ArchSpecificDockerfile[] = [];
	private satisifiedArch: ArchSpecificDockerfile;
	private satisfiedDeviceType: ArchSpecificDockerfile;

	public entry(file: FileInfo): void {
		if (file.name.substr(0, file.name.indexOf('.')) === 'Dockerfile') {
			// If it's a dockerfile with an extension, save it
			// unless it's a Dockerfile.template, in which case don't

			// Remove the . from the start of the extension
			const ext = path.extname(file.name).substr(1);
			if (ext !== 'template') {
				this.archDockerfiles.push([ext, file]);
			}
		}
	}

	public isSatisfied(bundle: Bundle): boolean {
		// Check for both satisfied architecture and device type
		this.archDockerfiles.map(dockerfile => {
			if (dockerfile[0] === bundle.architecture) {
				this.satisifiedArch = dockerfile;
			} else if (dockerfile[0] === bundle.deviceType) {
				this.satisfiedDeviceType = dockerfile;
			}
		});
		return (
			this.satisifiedArch !== undefined ||
			this.satisfiedDeviceType !== undefined
		);
	}

	public resolve(bundle: Bundle): Promise<FileInfo[]> {
		// Return the satisfied arch/deviceType specific dockerfile,
		// as a plain Dockerfile, and the docker daemon will then
		// execute that

		// device type takes precedence
		let satisfied: ArchSpecificDockerfile;
		if (this.satisfiedDeviceType !== undefined) {
			satisfied = this.satisfiedDeviceType;
		} else if (this.satisifiedArch !== undefined) {
			satisfied = this.satisifiedArch;
		} else {
			return Promise.reject(
				'Resolve called without a satisfied architecture specific dockerfile',
			);
		}

		// Generate the variables to replace
		const vars: DockerfileTemplate.TemplateVariables = {
			RESIN_ARCH: bundle.architecture,
			RESIN_MACHINE_NAME: bundle.deviceType,
		};

		return Promise.resolve([{
			name: 'Dockerfile',
			size: satisfied[1].size,
			contents: new Buffer(DockerfileTemplate.process(satisfied[1].contents.toString(), vars)),
		}]);
	}
}
