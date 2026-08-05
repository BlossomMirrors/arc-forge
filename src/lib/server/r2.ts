import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

const BUCKET = 'blossom-cdn';
const REMOTE_PREFIX = 'forgeassets/';
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
