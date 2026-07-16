/**
 * Domain separation shared by the Floodgate v7 label finalizer and the future
 * production plan minter. This module owns no key material and performs no I/O.
 */

export const FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO =
  "shogi-floodgate-v7-training-label-result-key-v1\0" as const;
export const FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO =
  "shogi-floodgate-v7-training-label-manifest-key-v1\0" as const;

export const FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN =
  "shogi-floodgate-v7-training-label-result-mac-v1\0" as const;
export const FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN =
  "shogi-floodgate-v7-training-label-manifest-mac-v1\0" as const;
