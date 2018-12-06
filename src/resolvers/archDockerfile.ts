import * as path from 'path';

import * as DockerfileTemplate from 'dockerfile-template';

import { Bundle, FileInfo, Resolver } from '../resolver';
import { removeExtension } from '../utils';

// Internal tuple to pass files and their extensions around
// the class
// ArchSpecificDockerfile = [extension, file info]
type ArchSpecificDockerfile = [string, FileInfo];

export class ArchDockerfileResolver implements Resolver {
	public priority = 3;
	public name = 'Architecture-specific Dockerfile';
	public allowSpecifiedDockerfile = true;
	public dockerfileContents: string;

	private archDockerfiles: ArchSpecificDockerfile[] = [];

	public entry(file: FileInfo): void {
		// We know that this file is a Dockerfile, so just get the extension,
		// and save it for resolving later
		const ext = path.extname(file.name).substr(1);
		this.archDockerfiles.push([ext, file]);
	}

	public needsEntry(filepath: string): boolean {
		const filename = path.basename(filepath);
		return (
			filename.startsWith('Dockerfile.') && !filename.endsWith('.template')
		);
	}

	public isSatisfied(bundle: Bundle): boolean {
		// Check for both satisfied architecture and device type
		const satisfied = this.getSatisfiedArch(bundle);
		return satisfied.arch !== undefined || satisfied.deviceType !== undefined;
	}

	public resolve(
		bundle: Bundle,
		specifiedFilename?: string,
	): Promise<FileInfo[]> {
		// Return the satisfied arch/deviceType specific dockerfile,
		// as a plain Dockerfile, and the docker daemon will then
		// execute that
		const name =
			specifiedFilename != null
				? this.getCanonicalName(specifiedFilename)
				: 'Dockerfile';

		// device type takes precedence
		const satisfiedPair = this.getSatisfiedArch(bundle);
		let satisfied: ArchSpecificDockerfile;

		if (satisfiedPair.deviceType != null) {
			satisfied = satisfiedPair.deviceType;
		} else if (satisfiedPair.arch != null) {
			satisfied = satisfiedPair.arch;
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
				name,
				size: satisfied[1].size,
				contents: new Buffer(this.dockerfileContents),
			},
		]);
	}

	public getCanonicalName(filename: string): string {
		// All that needs to be done for this class of Dockerfile is to remove the extension
		return removeExtension(filename);
	}

	private getSatisfiedArch(
		bundle: Bundle,
	): { arch?: ArchSpecificDockerfile; deviceType?: ArchSpecificDockerfile } {
		let arch: ArchSpecificDockerfile;
		let deviceType: ArchSpecificDockerfile;
		this.archDockerfiles.map(dockerfile => {
			if (dockerfile[0] === bundle.architecture) {
				arch = dockerfile;
			} else if (dockerfile[0] === bundle.deviceType) {
				deviceType = dockerfile;
			}
		});
		return { arch, deviceType };
	}
}

export default ArchDockerfileResolver;
