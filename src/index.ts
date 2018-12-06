import * as _ from 'lodash';
import { Readable } from 'stream';
import * as tar from 'tar-stream';

import Bundle from './bundle';
import { FileInfo } from './fileInfo';
import { Resolver } from './resolver';
import * as Utils from './utils';

// Import some default resolvers
import ArchDockerfileResolver from './resolvers/archDockerfile';
import DockerfileResolver from './resolvers/dockerfile';
import DockerfileTemplateResolver from './resolvers/dockerfileTemplate';
import NodeResolver from './resolvers/nodeResolver';

// re-export
export {
	ArchDockerfileResolver,
	Bundle,
	DockerfileResolver,
	DockerfileTemplateResolver,
	FileInfo,
	Resolver,
};

export function resolveInput(
	bundle: Bundle,
	resolvers: Resolver[],
	dockerfile?: string,
): Readable {
	const extract = tar.extract();
	const pack = tar.pack();
	let specifiedFileResolver: null | Resolver = null;
	if (dockerfile != null) {
		// Ensure that this will match the entry in the tar archive
		dockerfile = Utils.normalizeTarEntry(dockerfile);
	}

	extract.on(
		'entry',
		async (header: tar.Headers, stream: Readable, next: () => void) => {
			const name = Utils.normalizeTarEntry(header.name);

			// Handle the case where the dockerfile is specified
			if (dockerfile != null) {
				if (specifiedFileResolver == null && name === dockerfile) {
					specifiedFileResolver = await resolveSpecifiedFile(
						resolvers,
						bundle,
						name,
						header,
						stream,
						pack,
					);
					next();
					return;
				}
			} else {
				const potentials = resolvers.filter(r => r.needsEntry(name));
				if (potentials.length > 0) {
					const entry = await streamToFileInfo(stream, header);
					for (const resolver of potentials) {
						resolver.entry(entry);
					}
					// Also add it to the stream
					pack.entry(header, entry.contents);
					next();
					return;
				}
			}
			stream.pipe(pack.entry(header));
			stream.on('end', next);
		},
	);

	extract.on('finish', async () => {
		// Ensure that at least one resolver is satisfied, otherwise emit an error

		// Firstly, check that if the user specified a dockerfile, and that dockerfile has
		// been found and processed
		let resolver: Resolver;

		if (dockerfile != null) {
			if (specifiedFileResolver == null) {
				pack.emit(
					'error',
					new Error(
						`Specified dockerfile could not be resolved: ${dockerfile}`,
					),
				);
				return;
			}
			resolver = specifiedFileResolver;
		} else {
			// Detect if any of the resolvers have been satisfied
			const satisfied = _(resolvers)
				.filter(r => r.isSatisfied(bundle))
				.orderBy('priority', 'desc')
				.value();

			if (satisfied.length === 0) {
				pack.emit('error', new Error('Resolution could not be performed'));
				return;
			}

			resolver = satisfied[0];
			try {
				await addResolverOutput(bundle, resolver, pack);
			} catch (e) {
				pack.emit('error', e);
				return;
			}
		}

		// At this point, emit the resolver name, and the path of the resolved file
		pack.emit('resolver', resolver.name);
		if (dockerfile != null) {
			const dockerfileLocation = resolver.getCanonicalName(dockerfile);
			pack.emit('resolved-name', dockerfileLocation);
		}
		await bundle.callDockerfileHook(resolver.dockerfileContents);

		pack.finalize();
	});

	bundle.tarStream.pipe(extract);
	return pack;
}

async function resolveSpecifiedFile(
	resolvers: Resolver[],
	bundle: Bundle,
	filename: string,
	header: tar.Headers,
	stream: Readable,
	pack: tar.Pack,
): Promise<Resolver> {
	// Find the resolver which will be able to resolve this file
	let potentials = _(resolvers)
		.filter(r => r.allowSpecifiedDockerfile && r.needsEntry(filename))
		.orderBy(r => r.priority, 'desc')
		.value();

	if (potentials.length === 0) {
		// Assume that this is a plain Dockerfile

		// Create a new dockerfile resolver, rather than assuming
		// it's part of the resolver list
		potentials = [new DockerfileResolver()];
	}

	// Take the resolver with the highest priority that can act upon this file
	const resolver = potentials[0];

	// Read the file into a FileInfo structure
	const fileInfo = await streamToFileInfo(stream, header);

	resolver.entry(fileInfo);

	await addResolverOutput(bundle, resolver, pack, filename);

	// Add it to the stream too
	pack.entry({ name: fileInfo.name, size: fileInfo.size }, fileInfo.contents);

	return resolver;
}

async function addResolverOutput(
	bundle: Bundle,
	resolver: Resolver,
	pack: tar.Pack,
	filename?: string,
): Promise<void> {
	// Now read the file, allow the resolver to process it, and return it
	const extraFiles = await resolver.resolve(bundle, filename);

	for (const file of extraFiles) {
		pack.entry({ name: file.name, size: file.size }, file.contents);
	}
}

async function streamToFileInfo(
	stream: Readable,
	header: tar.Headers,
): Promise<FileInfo> {
	return {
		name: Utils.normalizeTarEntry(header.name),
		size: header.size || 0,
		contents: await Utils.streamToBuffer(stream),
	};
}

export function getDefaultResolvers(): Resolver[] {
	return [
		new DockerfileResolver(),
		new DockerfileTemplateResolver(),
		new ArchDockerfileResolver(),
		new NodeResolver(),
	];
}
