import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./config.js";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const Bucket = env.R2_BUCKET_NAME;

/** Key layout (spec §2): scans/<scanId>/pin_<r>_<c>/<artifact> */
export const artifactKey = (scanId: string, row: number, col: number, name: string) =>
  `scans/${scanId}/pin_${row}_${col}/${name}`;

/**
 * Presigned PUT for the phone's `curl -T`. Content-Type is deliberately NOT part of
 * the signature so curl's default header cannot break the signature.
 */
export async function presignPut(Key: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(r2, new PutObjectCommand({ Bucket, Key }), { expiresIn });
}

export async function exists(Key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch {
    return false;
  }
}

export async function getBuffer(Key: string): Promise<Buffer> {
  const res = await r2.send(new GetObjectCommand({ Bucket, Key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function putBuffer(Key: string, Body: Buffer | string, ContentType: string): Promise<void> {
  await r2.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
}
