// Local wrapper for react-simple-maps that provides our own typings for ZoomableGroup
// without modifying the vendor .d.ts directly.

import React, { CSSProperties, ReactNode } from 'react';
import {
  ComposableMap as BaseComposableMap,
  Geographies as BaseGeographies,
  Geography as BaseGeography,
  Marker as BaseMarker,
  // @ts-ignore - depending on installed types, ZoomableGroup may be untyped
  ZoomableGroup as BaseZoomableGroup,
} from 'react-simple-maps';

// Re-export props types for convenience (narrow versions sufficient for our usage)
export interface ComposableMapProps extends React.SVGProps<SVGSVGElement> {
  projection?: any;
  projectionConfig?: any;
  width?: number;
  height?: number;
  style?: CSSProperties | any;
}
export const ComposableMap = BaseComposableMap as React.FC<ComposableMapProps>;

export interface GeographiesRenderProps {
  geographies: any[];
  projection: any;
  path: any;
}
export interface GeographiesProps {
  geography: string | object;
  children?: (props: GeographiesRenderProps) => ReactNode;
}
export const Geographies = BaseGeographies as React.FC<GeographiesProps>;

export interface GeographyProps {
  geography: any;
  style?: any;
  fill?: string;
  stroke?: string;
  [key: string]: any;
}
export const Geography = BaseGeography as React.FC<GeographyProps>;

export interface MarkerProps {
  coordinates: [number, number];
  style?: any;
  [key: string]: any;
}
export const Marker = BaseMarker as React.FC<MarkerProps>;

// Our local ZoomableGroup typing matching current usage in ClickhouseRuntime
export interface ZoomableGroupProps {
  center?: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  translateExtent?: [[number, number], [number, number]];
  onMoveEnd?: (position: { coordinates: [number, number]; zoom: number }) => void;
  children?: ReactNode;
}
export const ZoomableGroup = BaseZoomableGroup as unknown as React.FC<ZoomableGroupProps>;
