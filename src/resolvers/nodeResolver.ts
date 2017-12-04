import * as Promise from 'bluebird';

import * as _ from 'lodash';
import * as request from 'request';
import * as semver from 'semver';

const getAsync = Promise.promisify(request.get);

import * as BluebirdLRU from 'bluebird-lru-cache';

import { Bundle, FileInfo, Resolver } from '../resolver';

// Used below for when no engine version can be determined.
const DEFAULT_NODE = '0.10.22';

const versionTest = RegExp.prototype.test.bind(/^[0-9]+\.[0-9]+\.[0-9]+$/);
const versionCache: {
	get: (deviceType: string) => Promise<string[]>;
} = new BluebirdLRU({
	maxAge: 3600 * 1000, // 1 hour
	fetchFn: (deviceType: string) => {
		const get = (prev: string[], url: string): Promise<string[]> => {
			return getAsync({
				url,
				json: true,
			})
			.get('body')
			.then((res: { results: Array<{ name: string }>; next?: string }) => {
				// explicit casting here, as typescript interprets the following statement as {}[]
				const curr: string[] = _(res.results).map('name').filter(versionTest).value() as string[];
				const tags = prev.concat(curr);

				if (res.next != null) {
					return get(tags, res.next);
				} else {
					return tags;
				}
			});
		};

		// 100 is the max page size
		return get(
			[],
			`https://hub.docker.com/v2/repositories/resin/${deviceType}-node/tags/?page_size=100`,
		);
	},
});

export default class NodeResolver implements Resolver {
	public priority = 0;
	public name = 'NodeJS';

	private packageJsonContent?: Buffer;
	private hasScripts = false;

	public entry(file: FileInfo): void {
		if (file.name === 'package.json') {
			this.packageJsonContent = file.contents;
		} else if (file.name === 'wscript' || _.endsWith(file.name, '.gyp')) {
			this.hasScripts = true;
		}
	}

	public isSatisfied(_bundle: Bundle): boolean {
		return this.packageJsonContent != null;
	}

	public resolve(bundle: Bundle): Promise<FileInfo[]> {
		// Generate a dockerfile which will run the file
		// Use latest node base image. Don't use the slim image just in case
		// TODO: Find out which apt-get packages are installed mostly with node
		// base images.
		return Promise.try(() => JSON.parse(this.packageJsonContent!.toString()))
			.catch((e: Error) => {
				throw new Error(`package.json: ${e.message}`);
			})
			.then(packageJson => {
				if (!_.isObject(packageJson)) {
					throw new Error('package.json: must be a JSON object');
				}

				this.hasScripts =
					this.hasScripts ||
					_(packageJson.scripts)
						.pick('preinstall', 'install', 'postinstall')
						.size() > 0;

				const nodeEngine = _.get(packageJson, 'engines.node');
				if (nodeEngine != null && !_.isString(nodeEngine)) {
					throw new Error(
						'package.json: engines.node must be a string if present',
					);
				}
				const range: string = nodeEngine || DEFAULT_NODE; // Keep old default for compatiblity

				return versionCache.get(bundle.deviceType).then(versions => {
					const nodeVersion = semver.maxSatisfying(versions, range);

					if (nodeVersion == null) {
						throw new Error(`Couldn't satisfy node version ${range}`);
					}

					let dockerfile: string;
					if (this.hasScripts) {
						dockerfile = `
						FROM resin/${bundle.deviceType}-node:${nodeVersion}
						RUN mkdir -p /usr/src/app && ln -s /usr/src/app /app
						WORKDIR /usr/src/app
						COPY . /usr/src/app
						RUN DEBIAN_FRONTEND=noninteractive JOBS=MAX npm install --unsafe-perm
						CMD [ "npm", "start" ]
						`;
					} else {
						dockerfile = `
						FROM resin/${bundle.deviceType}-node:${nodeVersion}-onbuild
						RUN ln -s /usr/src/app /app
					`;
					}
					const file: FileInfo = {
						name: 'Dockerfile',
						size: dockerfile.length,
						contents: new Buffer(dockerfile),
					};
					return [file];
				});
			});
	}
}
