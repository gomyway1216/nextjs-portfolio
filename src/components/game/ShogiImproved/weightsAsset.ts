/**
 * Where the AI worker gets the production NNUE weights from.
 *
 * The file is in the repository (public/shogi-halfkp81-production-weights.bin), and in development, tests and CI the
 * worker reads it from the site's own origin as it always has. Vercel keeps a full copy of every deployment, though,
 * and this one 94.7MB file made up most of each copy: in October 2026 it filled the free plan's 10 GB of deployment
 * storage. So .vercelignore leaves it out of deployments, and a build made on Vercel reads the same bytes from a public
 * bucket instead (`NEXT_PUBLIC_SHOGI_WEIGHTS_REMOTE`, set in next.config.ts).
 *
 * The bucket path is named for the file's SHA-256, so new weights get a new path and the copy there can be cached for
 * a year. New weights therefore need three things together:
 * 1. this constant, which a unit test checks against the file in public/;
 * 2. the upload, to the path the constant names:
 *    gcloud storage cp public/shogi-halfkp81-production-weights.bin \
 *      gs://yudai-portfolio-assets/shogi/<first 12 of the SHA-256>/shogi-halfkp81-production-weights.bin \
 *      --cache-control="public, max-age=31536000, immutable" --content-type=application/octet-stream
 * 3. the deploy that carries both.
 */

export const NNUE_WEIGHTS_FILE = 'shogi-halfkp81-production-weights.bin';

/** SHA-256 of public/shogi-halfkp81-production-weights.bin. */
export const NNUE_WEIGHTS_SHA256 = 'f47717860a1d0959567ad57365d473cd0a51d73ec3f791a7f25b6a8692966aa5';

/**
 * The same bytes in the public bucket (gs://yudai-portfolio-assets, project yudai-portfolio). The bucket answers
 * any origin's GET with `Access-Control-Allow-Origin: *`, which is what a cross-origin-isolated page's worker needs
 * (the shogi page is served with COEP require-corp), and serves the file as `public, max-age=31536000, immutable`.
 */
export const NNUE_WEIGHTS_REMOTE_URL = `https://storage.googleapis.com/yudai-portfolio-assets/shogi/${NNUE_WEIGHTS_SHA256.slice(0, 12)}/${NNUE_WEIGHTS_FILE}`;
