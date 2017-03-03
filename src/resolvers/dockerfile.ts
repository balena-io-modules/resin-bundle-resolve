import * as Promise from 'bluebird'

import { Bundle, FileInfo, Resolver } from '../resolver'

export default class DockerfileResolver implements Resolver {
	public priority = 0
	public name = 'Standard Dockerfile'

	private gotDockerfile: boolean = false

	public entry(file: FileInfo): void {
		if (file.name === 'Dockerfile') {
			this.gotDockerfile = true
		}
	}

	public isSatisfied(): boolean {
		return this.gotDockerfile
	}

	public resolve(): Promise<FileInfo[]> {
		// We don't need to add any extra files to the Dockerfile project
		return Promise.resolve([])
	}
}
