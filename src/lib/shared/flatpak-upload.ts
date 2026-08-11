// Shared between the client (chunking the file) and the server (bounding part
// counts) so the two can't drift out of sync the way a duplicated constant would.
export const CHUNK_BYTES = 10 * 1024 * 1024;
