// R2 has no spending cap (Cloudflare bills past the free 10 GB-month; budget alerts only
// email), so the Worker keeps the bucket under STORAGE_CAP itself. 2 GB of margin covers
// the covers pickup writes without this check (each <= 10 MB, deleted after publish).

export const STORAGE_CAP = 8 * 1024 ** 3;

/** Bytes in the bucket now: one Class A list per 1000 objects. */
export async function bucketBytes(bucket: R2Bucket): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ limit: 1000, cursor });
    for (const o of page.objects) total += o.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

/** True when `bytes` more still fits under the cap. */
export async function roomFor(bucket: R2Bucket, bytes: number): Promise<boolean> {
  return (await bucketBytes(bucket)) + bytes <= STORAGE_CAP;
}
