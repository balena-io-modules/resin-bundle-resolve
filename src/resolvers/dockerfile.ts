import * as Promise from 'bluebird';

import { FileInfo, Resolver } from '../resolver';

export default class DockerfileResolver implements Resolver {
	public priority = 0;
	public name = 'Standard Dockerfile';

	private gotDockerfile: boolean = false;
	// Storing the contents of the Dockerfile allows us to
	// call the hook on it, without traversing the new tar
	// stream
	private dockerfileContents: string;

	public entry(file: FileInfo): void {
		if (file.name === 'Dockerfile') {
			this.gotDockerfile = true;
			this.dockerfileContents = file.contents.toString();
		}
	}

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
}
