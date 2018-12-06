import * as path from 'path';

import { Bundle } from '../bundle';
import { FileInfo, Resolver } from '../resolver';
import { removeExtension } from '../utils';

export class DockerfileResolver implements Resolver {
	public priority = 0;
	public name = 'Standard Dockerfile';
	public allowSpecifiedDockerfile = true;
	public dockerfileContents: string;

	private gotDockerfile: boolean = false;

	public entry(file: FileInfo): void {
		this.gotDockerfile = true;
		this.dockerfileContents = file.contents.toString();
	}

	public needsEntry(filePath: string): boolean {
		return path.basename(filePath) === 'Dockerfile';
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

	public getCanonicalName(filename: string): string {
		return filename;
	}
}

export default DockerfileResolver;
