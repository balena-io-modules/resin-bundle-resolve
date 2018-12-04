import * as Promise from 'bluebird';
import * as path from 'path';

import * as DockerfileTemplate from 'dockerfile-template';

import { Bundle, FileInfo, Resolver } from '../resolver';

// Internal tuple to pass files and their extensions around
// the class
// ArchSpecificDockerfile = [extension, file info]
type ArchSpecificDockerfile = [string, FileInfo];

export class ArchDockerfileResolver implements Resolver {
	public priority = 3;
	public name = 'Archicture-specific Dockerfile';
	public allowSpecifiedDockerfile = true;
	public dockerfileContents: string;

	private archDockerfiles: ArchSpecificDockerfile[] = [];
	private satisifiedArch: ArchSpecificDockerfile;
	private satisfiedDeviceType: ArchSpecificDockerfile;

	public entry(file: FileInfo): void {
		// We know that this file is a Dockerfile, so just get the extension,
		// and save it for resolving later
		const ext = path.extname(file.name).substr(1);
		this.archDockerfiles.push([ext, file]);
	}

	public needsEntry(filename: string): boolean {
		if (filename.substr(0, filename.indexOf('.')) === 'Dockerfile') {
			const ext = path.extname(filename);
			return ext !== 'template';
		}
		return false;
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

		this.dockerfileContents = DockerfileTemplate.process(
			satisfied[1].contents.toString(),
			vars,
		);

		return Promise.resolve([
			{
				name: 'Dockerfile',
				size: satisfied[1].size,
				contents: new Buffer(this.dockerfileContents),
			},
		]);
	}

	public getCanonicalName(filename: string): string {
		// All that needs to be done for this class of Dockerfile is to remove the .template
		return filename;
	}
}

export default ArchDockerfileResolver;
