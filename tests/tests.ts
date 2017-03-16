import * as Promise from 'bluebird'
import { assert, expect } from 'chai'
import * as fs from 'fs'
import * as mocha from 'mocha'
import * as tar from 'tar-stream'
import * as path from 'path'

import * as Resolve from '../src/index'
import * as Utils from '../src/utils'

// The following indices are mapped to the order of resolvers returned
// by Resolve.getDefaultResolvers()
// If the order that they are returned changes, then so should these indices
// but that will be obvious because the tests will fail
const dockerfileResolverIdx = 0
const dockerfileTemplateResolverIdx = 1
const archDockerfileResolverIdx = 2
const nodeResolverIdx = 3
const defaultResolvers : () => Resolve.Resolver[] = () => Resolve.getDefaultResolvers()


function getDockerfileFromTarStream(stream: NodeJS.ReadableStream): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const extract = tar.extract()
		let foundDockerfile = false

		extract.on('entry', (header: tar.TarHeader, stream: NodeJS.ReadableStream, next: () => void) => {
			if (path.normalize(header.name) === 'Dockerfile') {
				let contents = ''
				stream.on('data', (data: string) => {
					contents += data
				})
				stream.on('end', () => {
					foundDockerfile = true
					resolve(contents)
				})
			}
			next()
		})

		extract.on('finish', () => {
			if (!foundDockerfile) {
				reject('Could not find a dockerfile in returned archive')
			}
		})
		stream.pipe(extract)
	})
}

describe('Resolvers', () => {
	it('should return resolve a standard Dockerfile project', () => {
		const stream = fs.createReadStream('./tests/test-files/Dockerfile/archive.tar')

		const bundle = new Resolve.Bundle(stream, '', '')
		const resolvers = defaultResolvers()
		return Resolve.resolveBundle(bundle, resolvers)
			.then((resolved) => {
				assert(
					resolved.projectType === resolvers[dockerfileResolverIdx].name,
					'Dockerfile resolver not used for Dockerfile project'
				)
			})
	})

	it('should resolve a Dockerfile.template correctly', () => {
		const deviceType = 'device-type-test'
		const arch = 'architecture-test'
		const stream = fs.createReadStream('./tests/test-files/DockerfileTemplate/archive.tar')
		const resolvers = defaultResolvers()
		const name = resolvers[dockerfileTemplateResolverIdx].name

		const bundle = new Resolve.Bundle(stream, deviceType, arch)
		return Resolve.resolveBundle(bundle, resolvers)
			.then((resolved) => {
				assert(
					resolved.projectType === name,
					'Dockerfile.template resolver not used for Dockerfile.template'
				)

				// Parse the lines of the dockerfile
				return getDockerfileFromTarStream(resolved.tarStream)
					.then((contents) => {
						const lines = contents.split(/\r?\n/)
						assert(
							lines[0] === `FROM resin/${deviceType}-node:slim`,
							'%%RESIN_MACHINE_NAME%% not resolved correctly'
						)
						assert(
							lines[1] === `RUN echo ${arch}`,
							'%%RESIN_ARCH%% not resolved correctly'
						)
					})
			})
	})

	it('should resolve an architecture specific dockerfile', () => {
		const arch = 'i386'
		const resolvers = defaultResolvers()
		const name = resolvers[archDockerfileResolverIdx].name
		const stream = fs.createReadStream('./tests/test-files/ArchitectureDockerfile/archive.tar')

		const bundle = new Resolve.Bundle(stream, '', arch)
		return Resolve.resolveBundle(bundle, resolvers)
			.then((resolved) => {
				assert(
					resolved.projectType === name,
					'Architecutre specific dockerfile resolver not used'
				)

				return getDockerfileFromTarStream(resolved.tarStream)
					.then((contents) => {
						assert(
							contents.trim() === 'correct',
							'Incorrect architecture chosen for project resolve'
						)
					})
			})
	})

	it('should prioritise device type over architecture dockerfiles', () => {
		const arch = 'armv7hf'
		const deviceType = 'raspberry-pi2'
		const resolvers = defaultResolvers()
		const name = resolvers[archDockerfileResolverIdx].name
		const stream = fs.createReadStream('./tests/test-files/ArchPriority/archive.tar')

		const bundle = new Resolve.Bundle(stream, deviceType, arch)
		return Resolve.resolveBundle(bundle, resolvers)
		.then((resolved) => {
			assert(resolved.projectType === name, 'Architecture specific dockerfile resolver not used')

			return getDockerfileFromTarStream(resolved.tarStream)
				.then((contents) => {
					assert(
						contents.trim() === 'correct',
						'Device type dockerfile not priorities over arch'
					)
				})

		})
	})

	it('should handle incorrect template variables', () => {
		const resolvers = defaultResolvers()
		const name = resolvers[dockerfileTemplateResolverIdx].name
		const stream = fs.createReadStream('./tests/test-files/IncorrectTemplateMacros/archive.tar')

		const bundle = new Resolve.Bundle(stream, '', '')
		return Resolve.resolveBundle(bundle, resolvers)
			.then((resolved) => {
				assert(false, 'Incorrect template variables not throwing error')
			})
			.catch(() => { /* Precisely what we want */ })
	})

	it('should resolve a nodeJS project', () => {
		const resolvers = defaultResolvers()
		const arch = ''
		const deviceType = 'raspberrypi3'
		const name = resolvers[nodeResolverIdx].name
		const stream = fs.createReadStream('./tests/test-files/NodeProject/archive.tar')

		const bundle = new Resolve.Bundle(stream, deviceType, arch)
		return Resolve.resolveBundle(bundle, resolvers)
			.then((resolved) => {
				assert(resolved.projectType === name, 'Node resolver not used on node project')

				return getDockerfileFromTarStream(resolved.tarStream)
					.then((contents) => {
						assert(
							contents.trim().split(/\r?\n/)[0] === `FROM resin/${deviceType}-node`,
							'Node base image not used'
						)
					})
			})
	})
})

describe('Utils', () => {
	it('should correctly normalize tar entries', (done) => {
		const fn = Utils.normalizeTarEntry
		expect(fn('Dockerfile')).to.equal('Dockerfile')
		expect(fn('./Dockerfile')).to.equal('Dockerfile')
		expect(fn('../Dockerfile')).to.equal('../Dockerfile')
		expect(fn('/Dockerfile')).to.equal('Dockerfile')
		expect(fn('./a/b/Dockerfile')).to.equal('a/b/Dockerfile')
		done()
	})
})
