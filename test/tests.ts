import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import * as tar from 'tar-stream';

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

async function waitForEvent<T>(stream: Readable, event: string): Promise<T> {
	return await new Promise<T>((resolve, reject) => {
		stream.on('error', reject);
		stream.on(event, resolve);
	});
}

describe('Resolvers', () => {
	it('should return resolve a standard Dockerfile project', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/Dockerfile/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, '', '');
		const resolvers = defaultResolvers();
		const outStream = Resolve.resolveInput(bundle, resolvers);

		expect(await waitForEvent(outStream, 'resolver')).to.equal(
			resolvers[dockerfileResolverIdx].name,
		);
		outStream.resume();
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
		const outStream = Resolve.resolveInput(bundle, resolvers);

		let resolver: string;

		outStream.on('resolver', r => (resolver = r));

		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(resolver).to.equal(name);

		const lines = dockerfile.split(/\r?\n/);
		expect(lines[0]).to.equal(`FROM resin/${deviceType}-node:slim`);
		expect(lines[1]).to.equal(`RUN echo ${arch}`);
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
		const outStream = Resolve.resolveInput(bundle, resolvers);

		let resolver: string;

		outStream.on('resolver', r => (resolver = r));

		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(resolver).to.equal(name);
		const lines = dockerfile.split(/\r?\n/);
		expect(lines[0]).to.equal(`FROM resin/${deviceType}-node:slim`);
		expect(lines[1]).to.equal(`RUN echo ${arch}`);
	});

	it('should resolve an architecture specific dockerfile', async () => {
		const arch = 'i386';
		const resolvers = defaultResolvers();
		const name = resolvers[archDockerfileResolverIdx].name;
		const stream = fs.createReadStream(
			require.resolve('./test-files/ArchitectureDockerfile/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, '', arch);
		const outStream = Resolve.resolveInput(bundle, resolvers);

		let resolver: string;

		outStream.on('resolver', r => (resolver = r));

		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(dockerfile.trim()).to.equal('correct');
		expect(resolver).to.equal(name);
	});

	it('should prioritise architecture dockerfiles over dockerfile templates', async () => {
		const arch = 'i386';
		const resolvers = defaultResolvers();
		const name = resolvers[archDockerfileResolverIdx].name;
		const stream = fs.createReadStream(
			'./test/test-files/ArchTemplatePriority/archive.tar',
		);

		const bundle = new Resolve.Bundle(stream, '', arch);
		const outStream = Resolve.resolveInput(bundle, resolvers);

		let resolver: string;

		outStream.on('resolver', r => (resolver = r));

		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(dockerfile.trim()).to.equal(arch);
		expect(resolver).to.equal(name);
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
		const outStream = Resolve.resolveInput(bundle, resolvers);

		let resolver: string;

		outStream.on('resolver', r => (resolver = r));

		const dockerfile = await getDockerfileFromTarStream(outStream);
		expect(dockerfile.trim()).to.equal('correct');
		expect(resolver).to.equal(name);
	});

	it('should handle incorrect template variables', () => {
		const resolvers = defaultResolvers();
		const stream = fs.createReadStream(
			require.resolve('./test-files/IncorrectTemplateMacros/archive.tar'),
		);

		const bundle = new Resolve.Bundle(stream, '', '');
		const outStream = Resolve.resolveInput(bundle, resolvers);

		return new Promise((resolve, reject) => {
			outStream.on('error', () => resolve());
			outStream.on('end', () => {
				reject(new Error('No error thrown for incorrect template variables'));
			});
			outStream.resume();
		});
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
		const outStream = Resolve.resolveInput(bundle, resolvers);

		return new Promise(async (resolve, reject) => {
			outStream.on('error', reject);
			outStream.on('resolver', r => {
				try {
					expect(r).to.equal(name);
				} catch (e) {
					reject(e);
				}
			});

			const content = await getDockerfileFromTarStream(outStream);
			expect(content.trim().split(/\r?\n/)[0]).to.equal(
				`FROM resin/${deviceType}-node:0.10.22-onbuild`,
			);
		});
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
		const outputStream = Resolve.resolveInput(bundle, resolvers);
		outputStream.resume();
		await waitForEvent(outputStream, 'end');
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
		const outputStream = Resolve.resolveInput(bundle, resolvers);

		outputStream.resume();
		await waitForEvent(outputStream, 'end');
		expect(content.trim()).to.equal('This is the dockerfile contents');
	});
});

describe('Utils', () => {
	it('should correctly normalize tar entries', () => {
		const fn = Utils.normalizeTarEntry;
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
		let resolver: string;
		let resolvedName: string;

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', '', hook);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			'test/Dockerfile',
		);

		outputStream.on('resolver', r => (resolver = r));
		outputStream.on('resolved-name', r => (resolvedName = r));

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			'test/Dockerfile',
		);
		await waitForEvent(outputStream, 'end');

		expect(tarContent.trim()).to.equal('correct');
		expect(resolver).to.equal('Standard Dockerfile');
		expect(resolvedName).to.equal('test/Dockerfile');
		expect(content.trim()).to.equal('correct');
	});

	it('should allow a Dockerfile.template to be specified in a different location', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedDockerfileTemplate/archive.tar'),
		);

		let content: string;
		let resolver: string;
		let resolvedName: string;

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', '', hook);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			'test/Dockerfile.template',
		);

		outputStream.on('resolver', r => (resolver = r));
		outputStream.on('resolved-name', r => (resolvedName = r));

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			'test/Dockerfile',
		);
		outputStream.resume();
		await waitForEvent(outputStream, 'end');

		expect(tarContent.trim()).to.equal('correct');
		expect(resolver).to.equal('Dockerfile.template');
		expect(resolvedName).to.equal('test/Dockerfile');
		expect(content.trim()).to.equal('correct');
	});

	it('should allow an arch specific dockerfile to be specified', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedArchDockerfile/archive.tar'),
		);

		let content: string;
		let resolver: string;
		let resolvedName: string;

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', 'armv7hf', hook);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			'test/Dockerfile.armv7hf',
		);

		outputStream.on('resolver', r => (resolver = r));
		outputStream.on('resolved-name', r => (resolvedName = r));

		const tarContent = await getDockerfileFromTarStream(
			outputStream,
			'test/Dockerfile',
		);
		outputStream.resume();
		await waitForEvent(outputStream, 'end');

		expect(tarContent.trim()).to.equal('correct');
		expect(content.trim()).to.equal('correct');
		expect(resolvedName).to.equal('test/Dockerfile');
		expect(resolver).to.equal('Architecture-specific Dockerfile');
	});

	it('should allow a Dockerfile to be specified in a different location', async () => {
		const stream = fs.createReadStream(
			require.resolve('./test-files/SpecifiedRandomFile/archive.tar'),
		);

		let content: string;
		let resolver: string;
		let resolvedName: string;

		const hook = hookContent => {
			content = hookContent;
		};

		const bundle = new Resolve.Bundle(stream, '', 'armv7hf', hook);
		const outputStream = Resolve.resolveInput(
			bundle,
			defaultResolvers(),
			'random',
		);

		outputStream.on('resolver', r => (resolver = r));
		outputStream.on('resolved-name', r => (resolvedName = r));

		const tarContent = await getDockerfileFromTarStream(outputStream, 'random');
		outputStream.resume();
		await waitForEvent(outputStream, 'end');

		expect(tarContent.trim()).to.equal('correct');
		expect(content.trim()).to.equal('correct');
		expect(resolvedName).to.equal('random');
		expect(resolver).to.equal('Standard Dockerfile');
	});
});
