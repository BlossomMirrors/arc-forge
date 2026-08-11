import {
	S3Client,
	PutObjectCommand,
	CreateMultipartUploadCommand,
	UploadPartCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

const BUCKET = 'blossom-cdn';
export const REMOTE_PREFIX = 'forgeassets/';
export const CDN_BASE = 'https://cdn.blossomos.org/forgeassets/';

function client(): S3Client {
	return new S3Client({
		region: 'auto',
		// EU jurisdiction bucket - jurisdiction-scoped endpoint, not the default r2.cloudflarestorage.com
		endpoint: `https://${env.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
			secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? ''
		}
	});
}

async function upload(body: Buffer, filename: string): Promise<string> {
	await client().send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: `${REMOTE_PREFIX}${filename}`,
			Body: body
		})
	);
	return `${CDN_BASE}${filename}`;
}

export async function uploadFile(data: ArrayBuffer, filename: string): Promise<string> {
	return upload(Buffer.from(data), filename);
}

export async function uploadText(content: string, ext: string): Promise<string> {
	const filename = `${crypto.randomUUID()}.${ext}`;
	return upload(Buffer.from(content, 'utf-8'), filename);
}

// Multipart upload, for files too large to comfortably buffer and PUT in one
// shot (e.g. Flatpak bundles). Each part is uploaded independently by the
// client, so a large file never needs to sit fully in memory on either side.
export async function createMultipartUpload(
	filename: string
): Promise<{ uploadId: string; key: string }> {
	const key = `${REMOTE_PREFIX}${filename}`;
	const res = await client().send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key }));
	if (!res.UploadId) throw new Error('R2 did not return an upload ID');
	return { uploadId: res.UploadId, key };
}

export async function uploadPart(
	key: string,
	uploadId: string,
	partNumber: number,
	body: Buffer
): Promise<string> {
	const res = await client().send(
		new UploadPartCommand({
			Bucket: BUCKET,
			Key: key,
			UploadId: uploadId,
			PartNumber: partNumber,
			Body: body
		})
	);
	if (!res.ETag) throw new Error('R2 did not return an ETag for the uploaded part');
	return res.ETag;
}

export async function completeMultipartUpload(
	key: string,
	uploadId: string,
	parts: { etag: string; partNumber: number }[]
): Promise<string> {
	await client().send(
		new CompleteMultipartUploadCommand({
			Bucket: BUCKET,
			Key: key,
			UploadId: uploadId,
			MultipartUpload: {
				Parts: parts
					.sort((a, b) => a.partNumber - b.partNumber)
					.map((p) => ({ ETag: p.etag, PartNumber: p.partNumber }))
			}
		})
	);
	return `${CDN_BASE}${key.slice(REMOTE_PREFIX.length)}`;
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
	await client().send(
		new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId })
	);
}
