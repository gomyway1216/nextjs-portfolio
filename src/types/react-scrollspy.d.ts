declare module 'react-scrollspy' {
  import { Component } from 'react';

  export interface ScrollspyProps {
    items: string[];
    currentClassName?: string;
    scrolledPastClassName?: string;
    style?: React.CSSProperties;
    className?: string;
    componentTag?: string;
    offset?: number;
    rootEl?: string;
    onUpdate?: (el: HTMLElement) => void;
    children?: React.ReactNode;
  }

  export default class Scrollspy extends Component<ScrollspyProps> {}
}
