declare module 'mic-recorder-to-mp3' {
  export default class MicRecorder {
    constructor(options?: any);
    start(): Promise<void>;
    stop(): {
      getMp3(): Promise<any>;
    };
    getMp3(): Promise<any>;
  }
}
