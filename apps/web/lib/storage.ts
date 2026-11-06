import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
export const r2 = () => new S3Client({
  region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "" },
});
export async function checkStorage() { return r2().send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET_NAME })); }
