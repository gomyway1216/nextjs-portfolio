declare module 'react-countup' {
  import { ComponentType } from 'react';

  export interface CountUpProps {
    start?: number;
    end: number;
    duration?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    separator?: string;
    decimal?: string;
    onEnd?: () => void;
    onStart?: () => void;
    redraw?: boolean;
    preserveValue?: boolean;
    formattingFn?: (value: number) => string;
    useEasing?: boolean;
    easingFn?: (t: number, b: number, c: number, d: number) => number;
    delay?: number;
  }

  const CountUp: ComponentType<CountUpProps>;
  export default CountUp;
}
