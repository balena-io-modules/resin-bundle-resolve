import * as Promise from 'bluebird'

import { Bundle, FileInfo, Resolver } from '../resolver'

export default class NodeResolver implements Resolver {
	public priority = 0
	public name = 'NodeJS project'

	private hasPackageJson = false

	public entry(file: FileInfo): void {
		if (file.name == 'package.json') {
			this.hasPackageJson = true
		}
	}

	public isSatisfied(bundle: Bundle): boolean {
		return this.hasPackageJson
	}

	public resolve(bundle: Bundle): Promise<FileInfo[]> {
		// Generate a dockerfile which will run the file
		// Use latest node base image. Don't use the slim image just in case
		// TODO: Find out which apt-get packages are installed mostly with node
		// base images.
		const dockerfile = `FROM resin/${bundle.deviceType}-node

WORKDIR /usr/src/app

COPY package.json .
RUN npm install

COPY . ./
CMD ["npm", "start"]
		`

		const file: FileInfo = {
			name: 'Dockerfile',
			size: dockerfile.length,
			contents: new Buffer(dockerfile)
		}

		return Promise.resolve([file])
	}
}
