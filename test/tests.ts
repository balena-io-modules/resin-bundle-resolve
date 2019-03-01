/**
 * @license
 * Copyright 2019 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';

import * as Resolve from '../src/index';
import * as Utils from '../src/utils';

// The following indices are mapped to the order of resolvers returned
// by Resolve.getDefaultResolvers()
// If the order that they are returned changes, then so should these indices
// but that will be obvious because the tests will fail
const dockerfileResolverIdx = 0;
const dockerfileTemplateResolverIdx = 1;
const archDockerfileResolverIdx = 2;
const nodeResolverIdx = 3;
const defaultResolvers: () => Resolve.Resolver[] = () =>
	Resolve.getDefaultResolvers();

function getDockerfileFromTarStream(
	stream: Readable,
	name = 'Dockerfile',
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const extract = tar.extract();
		let foundDockerfile = false;

		extract.on(
			'entry',
			(
				header: tar.Headers,
				entryStream: NodeJS.ReadableStream,
				next: () => void,
			) => {
				if (path.normalize(header.name) === name) {
					let contents = '';
					entryStream.on('data', (data: string) => {
						contents += data;
					});
					entryStream.on('end', () => {
						foundDockerfile = true;
						resolve(contents);
					});
				} else {
					entryStream.resume();
				}
				next();
			},
		);

		extract.on('finish', () => {
			if (!foundDockerfile) {
				reject(new Error('Could not find a dockerfile in returned archive'));
			}
		});
		stream.pipe(extract);
	});
}

function getPromiseForEvents(
	events: { [event: string]: (eventArg: Error | string) => void },
	rejectOnError = true,
	resolveOnEnd = false,
): [Promise<object>, Resolve.ResolveListeners] {
	const listeners: Resolve.ResolveListeners = {};
	const resolvePromise = new Promise((resolve, reject) => {
		listeners['error'] = [rejectOnError ? reject : resolve];
		if (resolveOnEnd) {
			listeners['end'] = [resolve];
		}
		for (const event of Object.keys(events)) {
			listeners[event] = [
				eventArg => {
					try {
						events[event](eventArg);
						if (resolveOnEnd) {
							if (event === 'end') {
								resolve({ event: eventArg });
							}
						} else {
							resolve({ event: eventArg });
						}
					} catch (error) {
						reject(error);
					}
				},
			];
		}
	});
	return [resolvePromise, listeners];
}

describe('Resolvers', () => {
	it('should return resolve a standard Dockerfile project', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/Dockerfile/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, '', '');
		const resolvers = defaultResolvers();
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) =>
				expect(resolverName).to.equal(resolvers[dockerfileResolverIdx].name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		outStream.resume();
		await resolvePromise;
	});

	it('should resolve a Dockerfile.template correctly', async () => {
		const deviceType = 'device-type-test';
		const arch = 'architecture-test';
		const stream = fs.createReadStream(
			require.resolve('./test-files/DockerfileTemplate/archive.tar'),
		);
		const resolvers = defaultResolvers();
		const name = resolvers[dockerfileTemplateResolverIdx].name;

		const bundle = new Resolve.Bundle(stream, deviceType, arch);
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) => expect(resolverName).to.equal(name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		const dockerfile = await getDockerfileFromTarStream(outStream);
		const lines = dockerfile.split(/\r?\n/);
		expect(lines[0]).to.equal(`FROM resin/${deviceType}-node:slim`);
		expect(lines[1]).to.equal(`RUN echo ${arch}`);
		await resolvePromise;
	});

	it('should resolve a balena Dockerfile.template correctly', async () => {
		const deviceType = 'device-type-test';
		const arch = 'architecture-test';
		const stream = fs.createReadStream(
			require.resolve('./test-files/BalenaDockerfileTemplate/archive.tar'),
		);
		const resolvers = defaultResolvers();
		const name = resolvers[dockerfileTemplateResolverIdx].name;

		const bundle = new Resolve.Bundle(stream, deviceType, arch);
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) => expect(resolverName).to.equal(name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		const dockerfile = await getDockerfileFromTarStream(outStream);
		const lines = dockerfile.split(/\r?\n/);
		expect(lines[0]).to.equal(`FROM resin/${deviceType}-node:slim`);
		expect(lines[1]).to.equal(`RUN echo ${arch}`);
		await resolvePromise;
	});

	it('should resolve an architecture specific dockerfile', async () => {
		const arch = 'i386';
		const resolvers = defaultResolvers();
		const name = resolvers[archDockerfileResolverIdx].name;
		const stream = fs.createReadStream(
			require.resolve('./test-files/ArchitectureDockerfile/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, '', arch);
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) => expect(resolverName).to.equal(name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(dockerfile.trim()).to.equal('correct');
		await resolvePromise;
	});

	it('should prioritise architecture dockerfiles over dockerfile templates', async () => {
		const arch = 'i386';
		const resolvers = defaultResolvers();
		const name = resolvers[archDockerfileResolverIdx].name;
		const stream = fs.createReadStream(
			'./test/test-files/ArchTemplatePriority/archive.tar',
		);

		const bundle = new Resolve.Bundle(stream, '', arch);
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) => expect(resolverName).to.equal(name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(dockerfile.trim()).to.equal(arch);
		await resolvePromise;
	});

	it('should prioritise device type over architecture dockerfiles', async () => {
		const arch = 'armv7hf';
		const deviceType = 'raspberry-pi2';
		const resolvers = defaultResolvers();
		const name = resolvers[archDockerfileResolverIdx].name;
		const stream = fs.createReadStream(
			require.resolve('./test-files/ArchPriority/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, deviceType, arch);
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) => expect(resolverName).to.equal(name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(dockerfile.trim()).to.equal('correct');
		await resolvePromise;
	});

	it('should handle incorrect template variables', () => {
		const resolvers = defaultResolvers();
		const stream = fs.createReadStream(
			require.resolve('./test-files/IncorrectTemplateMacros/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, '', '');
		const [resolvePromise, listeners] = getPromiseForEvents(
			{
				end: () => {
					throw new Error('No error thrown for incorrect template variables');
				},
			},
			false,
		);
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		outStream.resume();
		return resolvePromise;
	});

	it.skip('should resolve a nodeJS project', function() {
		this.timeout(6000000);
		const resolvers = defaultResolvers();
		const arch = '';
		const deviceType = 'raspberrypi3';
		const name = resolvers[nodeResolverIdx].name;
		const stream = fs.createReadStream(
			require.resolve('./test-files/NodeProject/archive.tar'),
		);
		const bundle = new Resolve.Bundle(stream, deviceType, arch);
		const [resolvePromise, listeners] = getPromiseForEvents({
			resolver: (resolverName: string) => expect(resolverName).to.equal(name),
		});
		const outStream = Resolve.resolveInput(bundle, resolvers, listeners);
		return getDockerfileFromTarStream(outStream)
			.then(content => {
				expect(content.trim().split(/\r?\n/)[0]).to.equal(
					`FROM resin/${deviceType}-node:0.10.22-onbuild`,
				);
			})
			.then(() => resolvePromise);
	});
});

describe('Hooks', () => {
	it('should call a hook on a resolved Dockerfile.template bundle', async () => {
		const resolvers = defaultResolvers();
		const arch = 'arch';
		const deviceType = 'dt';

		const stream = fs.createReadStream(
			require.resolve('./test-files/Hooks/Template/archive.tar'),
		);

		let content: string;

		const hook = (c: string): void => {
			content = c;
		};

		const bundle = new Resolve.Bundle(stream, deviceType, arch, hook);
		const [resolvePromise, listeners] = getPromiseForEvents(
			{ end: () => 0 },
			true,
			true,
		);
		const outputStream = Resolve.resolveInput(bundle, resolvers, listeners);

		outputStream.resume();
		await resolvePromise;
		expect(content.trim()).to.equal(`${deviceType}:${arch}`);
	});

	it('should call a hook on a resolved Dockerfile bundle', async () => {
		const resolvers = defaultResolvers();
		const arch = '';
		const deviceType = '';

		const stream = fs.createReadStream(
			require.resolve('./test-files/Hooks/Dockerfile/archive.tar'),
		);

		let content: string;
		const hook = (c: string): void => {
			content = c;
		};

		const bundle = new Resolve.Bundle(stream, deviceType, arch, hook);
		const [resolvePromise, listeners] = getPromiseForEvents(
			{ end: () => 0 },
			true,
			true,
		);
		const outputStream = Resolve.resolveInput(bundle, resolvers, listeners);

		outputStream.resume();
		await resolvePromise;
		expect(content.trim()).to.equal('This is the dockerfile contents');
	});
});

describe('Utils', () => {
	it('should correctly normalize tar entries', () => {
		const fn = TarUtils.normalizeTarEntry;
		expect(fn('Dockerfile')).to.equal('Dockerfile');
		expect(fn('./Dockerfile')).to.equal('Dockerfile');
		expect(fn('../Dockerfile')).to.equal(path.join('..', 'Dockerfile'));
		expect(fn('/Dockerfile')).to.equal('Dockerfile');
		expect(fn('./a/b/Dockerfile')).to.equal(path.join('a', 'b', 'Dockerfile'));
	});

	it('should correctly remove file extensions', () => {
		const fn = Utils.removeExtension;
		expect(fn('Dockerfile.template')).to.equal('Dockerfile');
		expect(fn('test/Dockerfile.template')).to.equal('test/Dockerfile');
		expect(fn('Dockerfile')).to.equal('Dockerfile');
		expect(fn('test/Dockerfile')).to.equal('test/Dockerfile');
	});
});

describe('Specifying dockerfiles', () => {
	it('should allow a Dockerfile to be specified in a different location', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedDockerfile/archive.tar'),
		);

		let content: string;
		const resolverName = 'Standard Dockerfile';
		const dockerfileName = 'test/Dockerfile';

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', '', hook);
		const [resolvePromise, listeners] = getPromiseForEvents(
			{
				resolver: (rsvrName: string) => expect(rsvrName).to.equal(resolverName),
				'resolved-name': (resolvedName: string) =>
					expect(resolvedName).to.equal(dockerfileName),
			},
			true,
			true,
		);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			listeners,
			dockerfileName,
		);

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			dockerfileName,
		);
		await resolvePromise;

		expect(tarContent.trim()).to.equal('correct');
		expect(content.trim()).to.equal('correct');
	});

	it('should allow a Dockerfile.template to be specified in a different location', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedDockerfileTemplate/archive.tar'),
		);

		let content: string;
		const resolverName = 'Dockerfile.template';
		const dockerfileName = 'test/Dockerfile';

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', '', hook);
		const [resolvePromise, listeners] = getPromiseForEvents(
			{
				resolver: (rsvrName: string) => expect(rsvrName).to.equal(resolverName),
				'resolved-name': (resolvedName: string) =>
					expect(resolvedName).to.equal(dockerfileName),
			},
			true,
			true,
		);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			listeners,
			'test/Dockerfile.template',
		);

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			dockerfileName,
		);
		outputStream.resume();
		await resolvePromise;

		expect(tarContent.trim()).to.equal('correct');
		expect(content.trim()).to.equal('correct');
	});

	it('should allow an arch specific dockerfile to be specified', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedArchDockerfile/archive.tar'),
		);

		let content: string;
		const resolverName = 'Architecture-specific Dockerfile';
		const dockerfileName = 'test/Dockerfile';

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', 'armv7hf', hook);
		const [resolvePromise, listeners] = getPromiseForEvents(
			{
				resolver: (rsvrName: string) => expect(rsvrName).to.equal(resolverName),
				'resolved-name': (resolvedName: string) =>
					expect(resolvedName).to.equal(dockerfileName),
			},
			true,
			true,
		);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			listeners,
			'test/Dockerfile.armv7hf',
		);

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			dockerfileName,
		);
		outputStream.resume();
		await resolvePromise;

		expect(tarContent.trim()).to.equal('correct');
		expect(content.trim()).to.equal('correct');
	});

	it('should allow a Dockerfile to be specified in a different location', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedRandomFile/archive.tar'),
		);

		let content: string;
		const resolverName = 'Standard Dockerfile';
		const dockerfileName = 'random';

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', 'armv7hf', hook);
		const [resolvePromise, listeners] = getPromiseForEvents(
			{
				resolver: (rsvrName: string) => expect(rsvrName).to.equal(resolverName),
				'resolved-name': (resolvedName: string) =>
					expect(resolvedName).to.equal(dockerfileName),
			},
			true,
			true,
		);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			listeners,
			dockerfileName,
		);

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			dockerfileName,
		);
		outputStream.resume();
		await resolvePromise;

		expect(tarContent.trim()).to.equal('correct');
		expect(content.trim()).to.equal('correct');
	});

	it('should allow a Dockerfile to be specified in a different location', () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedRandomFile/archive.tar'),
		);
		const dockerfileName = 'random';

		return new Promise(async (resolve, reject) => {
			let resolveCount = 0;
			const countedResolve = () => {
				++resolveCount;
				if (resolveCount === 2) {
					resolve();
				}
			};

			const hook = hookContent => {
				try {
					expect(hookContent.trim()).to.equal('correct');
					countedResolve();
				} catch (e) {
					reject(e);
				}
			};

			const bundle = new Resolve.Bundle(stream, '', '', hook);
			const listeners: Resolve.ResolveListeners = {
				resolver: [
					r => {
						try {
							expect(r).to.equal('Standard Dockerfile');
						} catch (e) {
							reject(e);
						}
					},
				],
				'resolved-name': [
					r => {
						try {
							expect(r).to.equal(dockerfileName);
						} catch (e) {
							reject(e);
						}
					},
				],
			};
			const outputStream = Resolve.resolveInput(
				bundle,
				defaultResolvers(),
				listeners,
				dockerfileName,
			);

			const content = await getDockerfileFromTarStream(
				outputStream,
				dockerfileName,
			);

			expect(content.trim()).to.equal('correct');
			countedResolve();
		});
	});

	it('should detect the right Dockerfile when there are many', async () => {
		const stream = fs.createReadStream(
			require.resolve(
				'./test-files/SpecifiedDockerfile/correct-dockerfile.tar',
			),
		);

		await new Promise((resolve, reject) => {
			const bundle = new Resolve.Bundle(stream, '', '', content => {
				try {
					expect(content.trim()).to.equal('correct');
					resolve();
				} catch (e) {
					reject(e);
				}
			});

			const listeners: Resolve.ResolveListeners = {
				resolver: [
					r => {
						try {
							expect(r).to.equal('Standard Dockerfile');
						} catch (e) {
							reject(e);
						}
					},
				],
				'resolved-name': [
					r => {
						try {
							expect(r).to.equal('Dockerfile');
						} catch (e) {
							reject(e);
						}
					},
				],
			};

			const outputStream = Resolve.resolveInput(
				bundle,
				defaultResolvers(),
				listeners,
			);
		});
	});
});
