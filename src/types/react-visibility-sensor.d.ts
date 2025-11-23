declare module 'react-visibility-sensor' {
  import { ComponentType, ReactNode } from 'react';

  export interface VisibilitySensorProps {
    onChange?: (isVisible: boolean) => void;
    active?: boolean;
    partialVisibility?: boolean | 'top' | 'right' | 'bottom' | 'left';
    offset?: {
      top?: number;
      left?: number;
      bottom?: number;
      right?: number;
    };
    minTopValue?: number;
    intervalCheck?: boolean;
    intervalDelay?: number;
    scrollCheck?: boolean;
    scrollDelay?: number;
    scrollThrottle?: number;
    resizeCheck?: boolean;
    resizeDelay?: number;
    resizeThrottle?: number;
    containment?: any;
    delayedCall?: boolean;
    children?: ReactNode | ((args: { isVisible: boolean }) => ReactNode);
  }

  const VisibilitySensor: ComponentType<VisibilitySensorProps>;
  export default VisibilitySensor;
}
