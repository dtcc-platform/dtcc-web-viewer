// Copyright (C) 2022 Andreas Rudenå
// Licensed under the MIT License

import { Deck, MapViewState, MapView } from '@deck.gl/core';
import { LayerSpecification, Map, MapOptions } from 'maplibre-gl';
import { makeObservable, observable, action } from 'mobx';
import { ViewerProps } from '../Viewer';
import { LayerStore } from './LayerStore';
import { ViewStore } from './ViewStore';
import MaplibreWrapper from '../utils/MaplibreWrapper';
class UiStore {
  viewStore: ViewStore;
  constructor(store) {
    this.viewStore = store.viewStore;
  }
}

const maplibreStyle = {
  id: 'digitaltwincityviewer',
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': 'rgba(255, 255, 255, 1)',
      },
    },
  ],
  sources: {},
  version: 8,
};

const maplibreOptions = {
  container: 'canvas',
  accessToken: 'wtf',
  renderWorldCopies: false,
  antialias: true,
  style: maplibreStyle,
  center: [0, 0],
  zoom: 14, // starting zoom
  minZoom: 10,
  pitch: 60,
  attributionControl: false,
} as MapOptions;

// internalProps = not to be set from parent component
const internalProps = {
  debug: false,
  viewState: null,
  container: null,
  glOptions: {
    antialias: true,
    depth: false,
  },
  layers: [],
  onWebGLInitialized: (): void => null,
  onViewStateChange: ({ viewState }) => viewState,
};

// There is a performance problem for extruded polygons that does not appear in the maplibre rendering settings
// While figuring this out, maplibre is used to control the gl context and interaction
const useMaplibre = true;

export class RootStore {
  gl: WebGL2RenderingContext;
  deck: Deck;
  uiStore: UiStore;
  viewStore: ViewStore;
  layerStore: LayerStore;
  maplibreMap?: Map;
  constructor(props: ViewerProps = {}) {
    this.viewStore = new ViewStore(this);
    this.uiStore = new UiStore(this);
    this.layerStore = new LayerStore(this);

    const resolvedProps = Object.assign({}, internalProps, props);

    if (useMaplibre) {
      this.maplibre(resolvedProps);
    } else {
      resolvedProps.onWebGLInitialized = this.onWebGLInitialized.bind(this);
      resolvedProps.onViewStateChange = this.onViewStateChange.bind(this);
      resolvedProps.viewState = this.viewStore.getViewState();
      this.deck = new Deck(resolvedProps);
    }
    this.viewStore.setViewState(props);
  }

  get zoom() {
    return this.viewStore.zoom;
  }

  set zoom(zoom) {
    this.viewStore.setViewState({ zoom });
    this.render();
  }

  onWebGLInitialized(gl) {
    this.gl = gl;
    this.layerStore.renderLayers();
  }

  onViewStateChange({ viewState }) {
    console.log(viewState);
    this.viewStore.setViewState(viewState);
    this.render();
  }

  getProps() {
    if (useMaplibre) {
      return {
        layers: this.layerStore.getLayersInstances(),
      };
    }
    return {
      layers: this.layerStore.getLayersInstances(),
      views: this.viewStore.getView(),
    };
  }

  setSelectedObject(object) {
    console.log(object);
  }

  render() {
    const props = this.getProps();
    this.deck.setProps(props);
  }

  maplibre(props) {
    if (props.container) {
      maplibreOptions.container = props.container;
    } else {
      const container = document.createElement('div');
      container.setAttribute('id', 'canvas');
      container.style.width = '100%'; //window.innerWidth;
      container.style.height = '100%'; //window.innerHeight;
      container.style.position = 'absolute';
      container.style.top = '0px';
      container.style.left = '0px';
      container.style.background = '#100';
      document.body.appendChild(container);
      props.container = container;
    }

    this.maplibreMap = new Map(maplibreOptions);

    this.maplibreMap.on('load', () => {
      const gl = this.maplibreMap.painter.context.gl;
      this.deck = new Deck(
        Object.assign(props, {
          gl,
        })
      );

      this.maplibreMap.addLayer(
        new MaplibreWrapper({
          id: 'viewer',
          deck: this.deck,
        }) as LayerSpecification
      );

      this.maplibreMap.on('move', () => {
        const { lng, lat } = this.maplibreMap.getCenter();
        // this.deck.setProps({
        //   viewState: {
        //     longitude: lng,
        //     latitude: lat,
        //     zoom: this.maplibreMap.getZoom(),
        //     bearing: this.maplibreMap.getBearing(),
        //     pitch: this.maplibreMap.getPitch(),
        //   },
        // });
        this.viewStore.setViewState({
          longitude: lng,
          latitude: lat,
          zoom: this.maplibreMap.getZoom(),
          // bearing: this.maplibreMap.getBearing(),
          // pitch: this.maplibreMap.getPitch(),
        });
        // Prevent deck from redrawing - repaint is driven by maplibre's render loop
        this.deck.needsRedraw({ clearRedrawFlags: true });
      });

      this.render();
    });
  }
}
