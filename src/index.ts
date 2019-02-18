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
import * as _ from 'lodash';
import { Readable } from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';

import Bundle from './bundle';
import { FileInfo } from './fileInfo';
import { Resolver } from './resolver';

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

export interface ResolveListeners {
	close?: Array<() => void>;
	data?: Array<(chunk: Buffer | string) => void>;
	end?: Array<() => void>;
	error?: Array<(e: Error) => void>;
	readable?: Array<() => void>;
	'resolved-name'?: Array<(dockerfilePath: string) => void>;
	resolver?: Array<(resolverName: string) => void>;
}

/**
 * Reads bundle.tarStream (typically a reference to BuildTask.buildStream) and
 * resolves it to a Docker-compatible tar stream (i.e. selects a specified
 * Dockerfile, translates Dockerfile.template vars and the like).
 * @param bundle Bundle including the input tar stream
 * @param resolvers Bundle resolvers
 * @param resolveListeners Event listeners for tar stream resolution.
 * Note that although you can add listeners to the returned Pack stream,
 * the stream is piped to before it is returned and events may be missed
 * unless the listeners are installed through the resolveListeners argument.
 * You should always add at least an 'error' handler, or uncaught errors
 * may crash the app.
 * @param dockerfile User-selected Dockerfile path (docker-compose `dockerfile:`)
 */
export function resolveInput(
	bundle: Bundle,
	resolvers: Resolver[],
	resolveListeners: ResolveListeners,
	dockerfile?: string,
): tar.Pack {
	const extract = tar.extract();
	const pack = tar.pack();
	for (const event of Object.keys(resolveListeners) as Array<
		keyof ResolveListeners
	>) {
		for (const listener of resolveListeners[event] || []) {
			pack.on(event, listener);
		}
	}
	let specifiedFileResolver: null | Resolver = null;
	if (dockerfile != null) {
		// Ensure that this will match the entry in the tar archive
		dockerfile = TarUtils.normalizeTarEntry(dockerfile);
	}

	extract.on('error', (error: Error) => pack.emit('error', error));
	extract.on(
		'entry',
		async (header: tar.Headers, stream: Readable, next: () => void) => {
			try {
				specifiedFileResolver =
					(await resolveTarStreamOnEntry(
						header,
						stream,
						bundle,
						resolvers,
						pack,
						specifiedFileResolver,
						dockerfile,
					)) || specifiedFileResolver;
				next();
			} catch (error) {
				pack.emit('error', error);
			}
		},
	);

	extract.once('finish', async () => {
		try {
			await resolveTarStreamOnFinish(
				bundle,
				resolvers,
				pack,
				specifiedFileResolver,
				dockerfile,
			);
		} catch (error) {
			pack.emit('error', error);
		} finally {
			pack.finalize();
		}
	});

	bundle.tarStream.pipe(extract);
	return pack;
}

async function resolveTarStreamOnEntry(
	header: tar.Headers,
	stream: Readable,
	bundle: Bundle,
	resolvers: Resolver[],
	pack: tar.Pack,
	specifiedFileResolver: null | Resolver = null,
	dockerfile?: string,
): Promise<Resolver | undefined> {
	const name = TarUtils.normalizeTarEntry(header.name);

	if (!name) {
		await TarUtils.drainStream(stream);
		return;
	}

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
			return specifiedFileResolver;
		}
	} else {
		const potentials = resolvers.filter(r => r.needsEntry(name));
		if (potentials.length > 0) {
			const fileInfo = await streamToFileInfo(stream, header);
			for (const resolver of potentials) {
				resolver.entry(fileInfo);
			}
			// Also add it to the stream
			pack.entry(header, fileInfo.contents);
			return;
		}
	}
	// Note: a tar-stream limitation requires a single pack.entry stream
	// pipe operation to take place at a time, so we await for it:
	// https://github.com/mafintosh/tar-stream/issues/24#issuecomment-54120650
	await TarUtils.pipePromise(stream, pack.entry(header));
}

async function resolveTarStreamOnFinish(
	bundle: Bundle,
	resolvers: Resolver[],
	pack: tar.Pack,
	specifiedFileResolver: null | Resolver = null,
	dockerfile?: string,
): Promise<void> {
	// Ensure that at least one resolver is satisfied, otherwise emit an error
	let resolver: Resolver;

	// Firstly, check that if the user specified a dockerfile, and that dockerfile has
	// been found and processed
	if (dockerfile != null) {
		if (specifiedFileResolver == null) {
			pack.emit(
				'error',
				new Error(`Specified dockerfile could not be resolved: ${dockerfile}`),
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
		await addResolverOutput(bundle, resolver, pack);
	}

	// At this point, emit the resolver name, and the path of the resolved file
	pack.emit('resolver', resolver.name);
	if (dockerfile != null) {
		const dockerfileLocation = resolver.getCanonicalName(dockerfile);
		pack.emit('resolved-name', dockerfileLocation);
	}
	await bundle.callDockerfileHook(resolver.dockerfileContents);
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
		name: TarUtils.normalizeTarEntry(header.name),
		size: header.size || 0,
		contents: await TarUtils.streamToBuffer(stream),
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
