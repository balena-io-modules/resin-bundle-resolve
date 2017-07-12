import * as Promise from 'bluebird';
import * as path from 'path';

/**
 * normalizeTarEntry: Depending on how the tar archive was created,
 * filenames can be presented in several different forms, and this function
 * aims to make them all similar, for example;
 *  * ./Dockerfile -> Dockerfile
 *  * /Dockerfile -> Dockerfile
 *  * Dockerfile -> Dockerfile
 *  * ./a/b/Dockerfile -> a/b/Dockerfile
 */
export function normalizeTarEntry(name: string): string {
	const normalized = path.normalize(name);
	if (path.isAbsolute(normalized)) {
		return normalized.substr(normalized.indexOf(path.sep) + 1);
	}
	return normalized;
}

/**
 * streamToBuffer: Given a stream, read it into a buffer
 * @param stream
 * @param size
 */
export function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		let buffer: Buffer = new Buffer('');
		stream.on('data', (data: Buffer) => (buffer = Buffer.concat([buffer, data])));
		stream.on('end', () => resolve(buffer));
		stream.on('error', reject);
	});
}
