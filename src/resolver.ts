import * as Promise from 'bluebird';

import Bundle from './bundle';
import { FileInfo } from './fileInfo';

// Make the external types available to implementers
export { Bundle, FileInfo };
/**
 * Resolver: Base interface for any project type resolver.
 */
export interface Resolver {
	/**
	 * priority: The priority that this resolver should take, when trying to resolve
	 * a resin-bundle, e.g. a resolver with a higher priority will attempt to make
	 * sense of the given bundle before one with a lower priority
	 */
	priority: number;

	/**
	 * name: The friendly name of the project that this resolver resolves
	 */
	name: string;

	/**
	 * allowSpecifiedDockerfile: Can this resolver accept a specific
	 * file to be used as the Dockerfile. This makes sense for normal
	 * Dockerfile and .template projects, but not package.json projects
	 */
	allowSpecifiedDockerfile: boolean;

	/**
	 * dockerfileContent: The content of the resolved dockerfile
	 */
	dockerfileContents: string;

	/**
	 * entry: Provide this resolver with a entry into a tar archive (the transport type
	 * of a resin-bundle) and the resolver should save the contents if it is applicable
	 * to this type of resolver. For example a Dockerfile.template resolver should save
	 * the contents of a Dockerfile.template.
	 *
	 * @param file
	 *  The contents and information about the file found.
	 */
	entry(file: FileInfo): void;

	/**
	 * needsEntry: Should this resolve get the content of this file
	 * @param filename The name of the file in the tar archive
	 * @return
	 *  True if the entry function should be called with this file
	 */
	needsEntry(filename: string): boolean;

	/**
	 * isSatisfied: Once all of the entries in the tar stream have been provided to
	 * the resolvers, the isSatisfied function will be called in order of priority.
	 * If a resolver returns true, that resolver will then be used to populate the
	 * resin-bundle with the necessary files to pass to a docker build - generally
	 * just a Dockerfile, but not limited to.
	 *
	 * @return
	 *  True if this resolver has enough information to produce a docker-compatible
	 *  build artifact (normally Dockerfile)
	 */
	isSatisfied(bundle: Bundle): boolean;

	/**
	 * resolve: Once a resolver has reported itself as being satisfied with the input,
	 * resolve will be called, which will return a promise of a list of files to be added
	 * to the bundle, which will allow Docker to build the bundle.
	 *
	 * @param bundle
	 * 	The resin-bundle which will be resolved
	 * @return
	 *  A promise of a list of files which when added to the bundle allow docker
	 *  to build the bundle
	 */
	resolve(bundle: Bundle, specifiedPath?: string): Promise<FileInfo[]>;

	/**
	 * getCanonicalName: If this resolver supports specifying a path as the main
	 * file to resolve from, this function will return the canonical path of the
	 * resolved dockerfile, for example:
	 * getCanonicalName('./build/Dockerfile.template') => './build/Dockerfile'
	 */
	getCanonicalName(specifiedPath: string): string;
}
