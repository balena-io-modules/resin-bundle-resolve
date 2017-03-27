import * as Promise from 'bluebird'
import * as _ from 'lodash'
import * as tar from 'tar-stream'

import Bundle from './bundle'
import { FileInfo } from './fileInfo'
import { Resolver } from './resolver'
import * as Utils from './utils'

// Import some default resolvers
import DockerfileResolver from './resolvers/dockerfile'
import DockerfileTemplateResolver from './resolvers/dockerfileTemplate'
import ArchDockerfileResolver from './resolvers/archDockerfile'
import NodeResolver from './resolvers/nodeResolver'

// re-export
export { ArchDockerfileResolver,
         Bundle,
         DockerfileResolver,
         DockerfileTemplateResolver,
         FileInfo,
         Resolver }

export interface ResolvedBundle {
	projectType: string,
	tarStream: tar.Pack
}

export function resolveBundle(bundle: Bundle, resolvers: Resolver[]): Promise<ResolvedBundle> {
	return new Promise<ResolvedBundle>((resolve: (resolved: ResolvedBundle) => void,
	                                    reject: (err: Error) => void) => {
		const extract = tar.extract()
		const pack = tar.pack()

		extract.on('entry', (header: tar.TarHeader, stream: NodeJS.ReadableStream, next: () => void) => {
			// Read the contents into a buffer
			Utils.streamToBuffer(stream)
			.then((buffer: Buffer) => {
				// send the file along to the next tar stream regardless
				pack.entry(header, buffer)

				// create a FileInfo from the header
				const info: FileInfo = {
					name: Utils.normalizeTarEntry(header.name),
					size: header.size,
					contents: buffer
				}

				// Now provide the resolvers with the information and file
				resolvers.map((resolver) => {
					resolver.entry(info)
				})
				next()
			})
		})

		extract.on('finish', () => {

			let maybeResolver = _(resolvers)
				.orderBy((val: Resolver) => val.priority, ['desc'])
				.find((resolver: Resolver) => resolver.isSatisfied(bundle))

			// if no resolver was happy this is an error
			if (maybeResolver === undefined) {
				reject(new Error('No project type resolution could be performed'))
				return
			}

			const resolver: Resolver = maybeResolver

			// Now that we have a resolver, add the new files needed to the stream
			resolver.resolve(bundle)
			.then((additionalItems) => {
				additionalItems.map((file: FileInfo) => {
					pack.entry({ name: file.name, size: file.size }, file.contents)
				})

				// all of the extra files have now been added to the stream, resolve
				// the promise with it
				pack.finalize()

				resolve({
					projectType: resolver.name,
					tarStream: pack
				})

			})
			.catch((error: Error) => {
				reject(error)
			})

		})

		// Send the bundle away to be parsed
		bundle.tarStream.pipe(extract)

	})
}

export function getDefaultResolvers(): Resolver[] {
	return [
		new DockerfileResolver(),
		new DockerfileTemplateResolver(),
		new ArchDockerfileResolver(),
		new NodeResolver()
	]
}
