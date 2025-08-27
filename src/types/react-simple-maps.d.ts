declare module 'react-simple-maps' {
  import * as React from 'react';

  export interface ComposableMapProps extends React.SVGProps<SVGSVGElement> {
    projection?: any;
    projectionConfig?: any;
    width?: number;
    height?: number;
    style?: React.CSSProperties | any;
  }
  export const ComposableMap: React.FC<ComposableMapProps>;

  export interface GeographiesRenderProps {
    geographies: any[];
    projection: any;
    path: any;
  }
  export interface GeographiesProps {
    geography: string | object;
    children?: (props: GeographiesRenderProps) => React.ReactNode;
  }
  export const Geographies: React.FC<GeographiesProps>;

  export interface GeographyProps {
    geography: any;
    style?: any;
    fill?: string;
    stroke?: string;
    [key: string]: any;
  }
  export const Geography: React.FC<GeographyProps>;

  export interface MarkerProps {
    coordinates: [number, number];
    style?: any;
    [key: string]: any;
  }
  export const Marker: React.FC<MarkerProps>;
}
