declare module 'mic-recorder-to-mp3' {
  export default class MicRecorder {
    constructor(options?: Record<string, unknown>);
    start(): Promise<void>;
    stop(): {
      getMp3(): Promise<[BlobPart[], Blob]>;
    };
    getMp3(): Promise<[BlobPart[], Blob]>;
  }
}
