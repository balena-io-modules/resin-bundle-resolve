import * as Promise from 'bluebird';

import { Bundle } from '../bundle';
import { FileInfo, Resolver } from '../resolver';
import { removeExtension } from '../utils';

export class DockerfileResolver implements Resolver {
	public priority = 0;
	public name = 'Standard Dockerfile';
	public allowSpecifiedDockerfile = true;

	private gotDockerfile: boolean = false;
	// Storing the contents of the Dockerfile allows us to
	// call the hook on it, without traversing the new tar
	// stream
	private dockerfileContents: string;

	public entry(file: FileInfo): void {
		this.gotDockerfile = true;
		this.dockerfileContents = file.contents.toString();
	}

	public needsEntry = (filename: string): boolean => filename === 'Dockerfile';

	public isSatisfied(): boolean {
		return this.gotDockerfile;
	}

	public resolve(): Promise<FileInfo[]> {
		// We don't need to add any extra files to the Dockerfile project
		return Promise.resolve([]);
	}

	public getDockerfileContents(): string {
		return this.dockerfileContents;
	}

	public getCanonicalName(filename: string): string {
		// All that needs to be done for this class of Dockerfile is to remove the .template
		return filename;
	}
}

export default DockerfileResolver;
