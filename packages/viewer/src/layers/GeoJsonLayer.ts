// Copyright (C) 2022 Andreas Rudenå
// Licensed under the MIT License

import { Model } from '@luma.gl/engine';
import { Buffer } from '@luma.gl/webgl';
import { Matrix4 } from '@math.gl/core';
import GL from '@luma.gl/constants';
import { FeatureCollection, Position } from 'geojson';
import { Transform } from '../luma/Transform';
import { Point } from '../lib/Point';
import { Viewer } from '../luma/Viewer';
import { triangulate, Polygon, MultiPolygon } from '../utils/polygon';

export type GeoJsonLayerProps = {
  id: string;
  type: 'geojson';
  data: FeatureCollection;
  showPoints?: boolean;
  showLines?: boolean;
  showPolygons?: boolean;
};

type LayerAttributeData = {
  vertices: number[];
  indices: number[];
};

const vs = `
attribute vec2 positions;
attribute vec3 nextPositions;
attribute vec2 vertexPositions;
attribute float vertexValid;

uniform mat4 modelMatrix;
uniform mat4 viewProjectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec4 projectionOffset;

void main() {
  vec4 pos = vec4(positions, 0., 1.0);
  //vec3 pos = project_to_clipspace(pos) * modelMatrix;
  gl_Position = viewProjectionMatrix * modelMatrix * pos;// + projectionOffset;
}
`;

const fs = `
void main() {
  gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
}
`;

// ! note that this class is a play-around class for geojson data. The point is to create layers that are specialised on city objects, not the format itself
export class GeoJsonLayer {
  id: string;
  gl: WebGLRenderingContext;
  transform: Transform;
  props: GeoJsonLayerProps;
  models: Model[];
  model: Model;
  constructor(viewer: Viewer, layerProps: GeoJsonLayerProps) {
    this.id = layerProps.id;
    this.gl = viewer.context.gl;
    this.transform = viewer.transform;
    this.update(layerProps);
  }

  // todo: move polygon functionality into polygon utils, but there are already some existing libs (math.gl, mapshaper, etc)
  getMultiPolygonData(multiPolygon: Position[][][], data) {
    for (const polygon of multiPolygon) {
      this.getPolygonData(polygon, data);
    }
  }

  // note: a polygon is multipolygon due to holes
  getPolygonData(polygon: Polygon | MultiPolygon | Position[][], data) {
    const [centerX, centerY] = this.transform.pointToPixelPoint(
      Point.fromLngLat(...this.transform.cityLngLat)
    );
    const multiPolygon =
      Array.isArray(polygon[0]) && Number.isFinite(polygon[0][0])
        ? [polygon]
        : polygon;
    const triangulateInput = [];
    for (const poly of multiPolygon) {
      const points = [];
      for (const point of poly) {
        const [x, y] = this.transform.pointToPixelPoint(
          Point.fromLngLat(point[0], point[1])
        );
        points.push([x - centerX, y - centerY]);
      }
      triangulateInput.push(points);
    }
    const { vertices, indices } = triangulate(triangulateInput as MultiPolygon);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = indices[i] + data.indexCount;
    }
    data.indexCount += vertices.length / 2;
    data.indices = data.indices.concat(indices);
    data.vertices = data.vertices.concat(vertices);
  }

  generateAttributeData(
    layerProps: GeoJsonLayerProps
  ): LayerAttributeData | null {
    const { showPoints, showLines, showPolygons, data } = layerProps;
    console.log(data);
    if (!showPoints && !showLines && !showPolygons) {
      return null;
    }

    const attributeData = {
      vertices: [],
      indices: [],
      indexCount: 0,
      starts: [],
    };
    for (const feature of data.features) {
      if (feature.geometry.type === 'Polygon') {
        this.getPolygonData(feature.geometry.coordinates, attributeData);
      } else if (feature.geometry.type === 'MultiPolygon') {
        this.getMultiPolygonData(feature.geometry.coordinates, attributeData);
      }
    }
    console.log(attributeData);

    return attributeData;
  }

  update(layerProps: GeoJsonLayerProps) {
    const data = this.generateAttributeData(layerProps);
    if (data) {
      this.model = this.createModel(data);
    }
  }

  createModel({ vertices, indices }) {
    const gl = this.gl;

    const model = new Model(gl, {
      id: 'geojson',
      vs,
      fs,
      attributes: {
        positions: [new Buffer(gl, new Float32Array(vertices)), { size: 2 }],
        indices: [
          new Buffer(gl, {
            data: new Uint32Array(indices),
            target: GL.ELEMENT_ARRAY_BUFFER,
          }),
          {
            size: 1,
            isIndexed: true,
          },
        ],
      },
      vertexCount: indices.length,
    });
    console.log(model);
    return model;
  }

  render() {
    if (this.model) {
      const modelMatrix = new Matrix4();
      //modelMatrix.rotateZ(Math.random());
      //modelMatrix.scale(1);
      this.model
        .setUniforms(this.transform.getUniforms())
        .setUniforms({
          modelMatrix,
        })
        .draw();
    }
  }
}
