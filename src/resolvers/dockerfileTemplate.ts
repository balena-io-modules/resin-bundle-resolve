import * as Promise from 'bluebird';

import * as DockerfileTemplate from 'dockerfile-template';

import { Bundle, FileInfo, Resolver } from '../resolver';
import { removeExtension } from '../utils';

export class DockerfileTemplateResolver implements Resolver {
	public priority = 2;
	public name = 'Dockerfile.template';
	public allowSpecifiedDockerfile = true;

	private hasDockerfileTemplate = false;
	private templateContent: Buffer;

	public entry(file: FileInfo): void {
		this.templateContent = file.contents;
		this.hasDockerfileTemplate = true;
	}

	public needsEntry = (filename: string) => filename === 'Dockerfile.template';

	public isSatisfied(_bundle: Bundle): boolean {
		return this.hasDockerfileTemplate;
	}

	public resolve(
		bundle: Bundle,
		specifiedFilename: string = 'Dockerfile',
	): Promise<FileInfo[]> {
		const dockerfile: FileInfo = {
			name: specifiedFilename,
			size: 0,
			contents: new Buffer(''),
		};

		// Generate the variables to replace
		const vars: DockerfileTemplate.TemplateVariables = {
			RESIN_ARCH: bundle.architecture,
			RESIN_MACHINE_NAME: bundle.deviceType,
			BALENA_ARCH: bundle.architecture,
			BALENA_MACHINE_NAME: bundle.deviceType,
		};

		return new Promise<FileInfo[]>(resolve => {
			// FIXME: submit a PR to DockerfileTemplate to take Buffers as an input
			dockerfile.contents = new Buffer(
				DockerfileTemplate.process(this.templateContent.toString(), vars),
			);
			dockerfile.size = dockerfile.contents.length;
			resolve([dockerfile]);
		});
	}

	public getCanonicalName(filename: string): string {
		// All that needs to be done for this class of Dockerfile is to remove the extension
		return removeExtension(filename);
	}
}

export default DockerfileTemplateResolver;
