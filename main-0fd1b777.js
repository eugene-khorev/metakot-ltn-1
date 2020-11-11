(function (L$1) {
    'use strict';

    /*
     * L.Control.BoxZoom
     * A visible, clickable control for doing a box zoom.
     * https://github.com/gregallensworth/L.Control.BoxZoom
     */
    L.Control.BoxZoom = L.Control.extend({
        options: {
            position: 'topright',
            title: 'Click here then draw a square on the map, to zoom in to an area',
            aspectRatio: null,
            divClasses: '',
            enableShiftDrag: false,
            iconClasses: '',
            keepOn: false,
        },
        initialize: function (options) {
            L.setOptions(this, options);
            this.map = null;
            this.active = false;
        },
        onAdd: function (map) {
            // add a linkage to the map, since we'll be managing map layers
            this.map = map;
            this.active = false;

            // create our button: uses FontAwesome cuz that font is... awesome
            // assign this here control as a property of the visible DIV, so we can be more terse when writing click-handlers on that visible DIV
            this.controlDiv = L.DomUtil.create('div', 'leaflet-control-boxzoom');

            // if we're not using an icon, add the background image class
            if (!this.options.iconClasses) {
                L.DomUtil.addClass(this.controlDiv, 'with-background-image');
            }
            if (this.options.divClasses) {
                L.DomUtil.addClass(this.controlDiv, this.options.divClasses);
            }
            this.controlDiv.control = this;
            this.controlDiv.title = this.options.title;
            this.controlDiv.innerHTML = ' ';
            L.DomEvent
                .addListener(this.controlDiv, 'mousedown', L.DomEvent.stopPropagation)
                .addListener(this.controlDiv, 'click', L.DomEvent.stopPropagation)
                .addListener(this.controlDiv, 'click', L.DomEvent.preventDefault)
                .addListener(this.controlDiv, 'click', function () {
                    this.control.toggleState();
                });

            // start by toggling our state to off; this disables the boxZoom hooks on the map, in favor of this one
            this.setStateOff();

            if (this.options.iconClasses) {
                var iconElement = L.DomUtil.create('i', this.options.iconClasses, this.controlDiv);
                if (iconElement) {
                    iconElement.style.color = this.options.iconColor || 'black';
                    iconElement.style.textAlign = 'center';
                    iconElement.style.verticalAlign = 'middle';
                } else {
                    console.log('Unable to create element for icon');
                }
            }

            // if we're enforcing an aspect ratio, then monkey-patch the map's real BoxZoom control to support that
            // after all, this control is just a wrapper over the map's own BoxZoom behavior
            if (this.options.aspectRatio) {
                this.map.boxZoom.aspectRatio = this.options.aspectRatio;
                this.map.boxZoom._onMouseMove = this._boxZoomControlOverride_onMouseMove;
                this.map.boxZoom._onMouseUp = this._boxZoomControlOverride_onMouseUp;
            }

            // done!
            return this.controlDiv;
        },

        onRemove: function (map) {
            // on remove: if we had to monkey-patch the aspect-ratio stuff, undo that now
            if (this.options.aspectRatio) {
                delete this.map.boxZoom.aspectRatio;
                this.map.boxZoom._onMouseMove = L.Map.BoxZoom.prototype._onMouseMove;
                this.map.boxZoom._onMouseUp = L.Map.BoxZoom.prototype._onMouseUp;
            }
        },

        toggleState: function () {
            this.active ? this.setStateOff() : this.setStateOn();
        },
        setStateOn: function () {
            L.DomUtil.addClass(this.controlDiv, 'leaflet-control-boxzoom-active');
            this.active = true;
            this.map.dragging.disable();
            if (!this.options.enableShiftDrag) {
                this.map.boxZoom.addHooks();
            }

            this.map.on('mousedown', this.handleMouseDown, this);
            if (!this.options.keepOn) {
                this.map.on('boxzoomend', this.setStateOff, this);
            }

            L.DomUtil.addClass(this.map._container, 'leaflet-control-boxzoom-active');
        },
        setStateOff: function () {
            L.DomUtil.removeClass(this.controlDiv, 'leaflet-control-boxzoom-active');
            this.active = false;
            this.map.off('mousedown', this.handleMouseDown, this);
            this.map.dragging.enable();
            if (!this.options.enableShiftDrag) {
                this.map.boxZoom.removeHooks();
            }

            L.DomUtil.removeClass(this.map._container, 'leaflet-control-boxzoom-active');
        },

        handleMouseDown: function (event) {
            this.map.boxZoom._onMouseDown.call(this.map.boxZoom, { clientX: event.originalEvent.clientX, clientY: event.originalEvent.clientY, which: 1, shiftKey: true });
        },

        // monkey-patched applied to L.Map.BoxZoom to handle aspectRatio and to zoom to the drawn box instead of the mouseEvent point
        // in these methods,  "this" is not the control, but the map's boxZoom instance
        _boxZoomControlOverride_onMouseMove: function (e) {
            if (!this._moved) {
                this._box = L.DomUtil.create('div', 'leaflet-zoom-box', this._pane);
                L.DomUtil.setPosition(this._box, this._startLayerPoint);

                //TODO refactor: move cursor to styles
                this._container.style.cursor = 'crosshair';
                this._map.fire('boxzoomstart');
            }

            var startPoint = this._startLayerPoint,
                box = this._box,

                layerPoint = this._map.mouseEventToLayerPoint(e),
                offset = layerPoint.subtract(startPoint),

                newPos = new L.Point(
                    Math.min(layerPoint.x, startPoint.x),
                    Math.min(layerPoint.y, startPoint.y));

            L.DomUtil.setPosition(box, newPos);

            this._moved = true;

            var width = (Math.max(0, Math.abs(offset.x) - 4));  // from L.Map.BoxZoom, TODO refactor: remove hardcoded 4 pixels
            var height = (Math.max(0, Math.abs(offset.y) - 4));  // from L.Map.BoxZoom, TODO refactor: remove hardcoded 4 pixels

            if (this.aspectRatio) {
                height = width / this.aspectRatio;
            }

            box.style.width = width + 'px';
            box.style.height = height + 'px';
        },
        _boxZoomControlOverride_onMouseUp: function (e) {
            // the stock behavior is to generate a bbox based on the _startLayerPoint and the mouseUp event point
            // we don't want that; we specifically want to use the drawn box with the fixed aspect ratio

            // fetch the box and convert to a map bbox, before we clear it
            var ul = this._box._leaflet_pos;
            var lr = new L.Point(this._box._leaflet_pos.x + this._box.offsetWidth, this._box._leaflet_pos.y + this._box.offsetHeight);
            var nw = this._map.layerPointToLatLng(ul);
            var se = this._map.layerPointToLatLng(lr);
            if (nw.equals(se)) { return; }

            this._finish();

            var bounds = new L.LatLngBounds(nw, se);
            this._map.fitBounds(bounds);

            this._map.fire('boxzoomend', {
                boxZoomBounds: bounds
            });
        },
    });
    L.Control.boxzoom = function (options) {
        return new L.Control.BoxZoom(options);
    };

    (function (factory) {
    	// Packaging/modules magic dance
    	var L;
    	if (typeof define === 'function' && define.amd) {
    		// AMD
    		define(['leaflet'], factory);
    	} else if (typeof module !== 'undefined') {
    		// Node/CommonJS
    		L = require('leaflet');
    		module.exports = factory(L);
    	} else {
    		// Browser globals
    		if (typeof window.L === 'undefined') {
    			throw new Error('Leaflet must be loaded first');
    		}
    		factory(window.L);
    	}
    }(function (L) {

    	L.Control.Zoomslider = (function () {

    		var Knob = L.Draggable.extend({
    			initialize: function (element, stepHeight, knobHeight) {
    				L.Draggable.prototype.initialize.call(this, element, element);
    				this._element = element;

    				this._stepHeight = stepHeight;
    				this._knobHeight = knobHeight;

    				this.on('predrag', function () {
    					this._newPos.x = 0;
    					this._newPos.y = this._adjust(this._newPos.y);
    				}, this);
    			},

    			_adjust: function (y) {
    				// palatin: removed rounding for more granluarity.
    				var value = this._toValue(y);
    				value = Math.max(0, Math.min(this._maxValue, value));
    				return this._toY(value);
    			},

    			// y = k*v + m
    			_toY: function (value) {
    				return this._k * value + this._m;
    			},
    			// v = (y - m) / k
    			_toValue: function (y) {
    				return (y - this._m) / this._k;
    			},

    			setSteps: function (steps) {
    				var sliderHeight = steps * this._stepHeight;
    				this._maxValue = steps - 1;

    				// conversion parameters
    				// the conversion is just a common linear function.
    				this._k = -this._stepHeight;
    				this._m = sliderHeight - (this._stepHeight + this._knobHeight) / 2;
    			},

    			setPosition: function (y) {
    				L.DomUtil.setPosition(this._element,
    					L.point(0, this._adjust(y)));
    			},

    			setValue: function (v) {
    				this.setPosition(this._toY(v));
    			},

    			getValue: function () {
    				return this._toValue(L.DomUtil.getPosition(this._element).y);
    			}
    		});

    		var Zoomslider = L.Control.extend({
    			options: {
    				position: 'topleft',
    				// Height of zoom-slider.png in px
    				stepHeight: 8,
    				// Height of the knob div in px (including border)
    				knobHeight: 6,
    				styleNS: 'leaflet-control-zoomslider'
    			},

    			onAdd: function (map) {
    				this._map = map;
    				this._ui = this._createUI();
    				this._knob = new Knob(this._ui.knob,
    					this.options.stepHeight,
    					this.options.knobHeight);

    				map.whenReady(this._initKnob, this)
    					.whenReady(this._initEvents, this)
    					.whenReady(this._updateSize, this)
    					.whenReady(this._updateKnobValue, this)
    					.whenReady(this._updateDisabled, this);
    				return this._ui.bar;
    			},

    			onRemove: function (map) {
    				map.off('zoomlevelschange', this._updateSize, this)
    					.off('zoomend zoomlevelschange', this._updateKnobValue, this)
    					.off('zoomend zoomlevelschange', this._updateDisabled, this);
    			},

    			_createUI: function () {
    				var ui = {},
    					ns = this.options.styleNS;

    				ui.bar = L.DomUtil.create('div', ns + ' leaflet-bar');
    				ui.zoomIn = this._createZoomBtn('in', 'top', ui.bar);
    				ui.wrap = L.DomUtil.create('div', ns + '-wrap leaflet-bar-part', ui.bar);
    				ui.zoomOut = this._createZoomBtn('out', 'bottom', ui.bar);
    				ui.body = L.DomUtil.create('div', ns + '-body', ui.wrap);
    				ui.knob = L.DomUtil.create('div', ns + '-knob');

    				L.DomEvent.disableClickPropagation(ui.bar);
    				L.DomEvent.disableClickPropagation(ui.knob);

    				return ui;
    			},
    			_createZoomBtn: function (zoomDir, end, container) {
    				var classDef = this.options.styleNS + '-' + zoomDir +
    					' leaflet-bar-part' +
    					' leaflet-bar-part-' + end,
    					link = L.DomUtil.create('a', classDef, container);

    				link.href = '#';
    				link.title = 'Zoom ' + zoomDir;

    				L.DomEvent.on(link, 'click', L.DomEvent.preventDefault);

    				return link;
    			},

    			_initKnob: function () {
    				this._knob.enable();
    				this._ui.body.appendChild(this._ui.knob);
    			},
    			_initEvents: function () {
    				this._map
    					.on('zoomlevelschange', this._updateSize, this)
    					.on('zoomend zoomlevelschange', this._updateKnobValue, this)
    					.on('zoomend zoomlevelschange', this._updateDisabled, this);

    				L.DomEvent.on(this._ui.body, 'click', this._onSliderClick, this);
    				L.DomEvent.on(this._ui.zoomIn, 'click', this._zoomIn, this);
    				L.DomEvent.on(this._ui.zoomOut, 'click', this._zoomOut, this);

    				this._knob.on('dragend', this._updateMapZoom, this);
    			},

    			_onSliderClick: function (e) {
    				var first = (e.touches && e.touches.length === 1 ? e.touches[0] : e),
    					y = L.DomEvent.getMousePosition(first, this._ui.body).y;

    				this._knob.setPosition(y);
    				this._updateMapZoom();
    			},

    			_zoomIn: function (e) {
    				// palatin: use zoom delta
    				this._map.zoomIn(e.shiftKey ? 2 : this._map.options.zoomDelta);
    			},
    			_zoomOut: function (e) {
    				// palatin: use zoom delta
    				this._map.zoomOut(e.shiftKey ? 2 : this._map.options.zoomDelta);
    			},

    			_zoomLevels: function () {
    				var zoomLevels = this._map.getMaxZoom() - this._map.getMinZoom() + 1;
    				return zoomLevels < Infinity ? zoomLevels : 0;
    			},
    			_toZoomLevel: function (value) {
    				return value + this._map.getMinZoom();
    			},
    			_toValue: function (zoomLevel) {
    				return zoomLevel - this._map.getMinZoom();
    			},

    			_updateSize: function () {
    				var steps = this._zoomLevels();

    				this._ui.body.style.height = this.options.stepHeight * steps + 'px';
    				this._knob.setSteps(steps);
    			},
    			_updateMapZoom: function () {
    				this._map.setZoom(this._toZoomLevel(this._knob.getValue()));
    			},
    			_updateKnobValue: function () {
    				this._knob.setValue(this._toValue(this._map.getZoom()));
    			},
    			_updateDisabled: function () {
    				var zoomLevel = this._map.getZoom(),
    					className = this.options.styleNS + '-disabled';

    				L.DomUtil.removeClass(this._ui.zoomIn, className);
    				L.DomUtil.removeClass(this._ui.zoomOut, className);

    				if (zoomLevel === this._map.getMinZoom()) {
    					L.DomUtil.addClass(this._ui.zoomOut, className);
    				}
    				if (zoomLevel === this._map.getMaxZoom()) {
    					L.DomUtil.addClass(this._ui.zoomIn, className);
    				}
    			}
    		});

    		return Zoomslider;
    	})();

    	L.Map.addInitHook(function () {
    		if (this.options.zoomsliderControl) {
    			this.zoomsliderControl = new L.Control.Zoomslider();
    			this.addControl(this.zoomsliderControl);
    		}
    	});

    	L.control.zoomslider = function (options) {
    		return new L.Control.Zoomslider(options);
    	};
    }));

    var boxzoom_svg = "leaflet-control-boxzoom-4be5d249281d260e.svg";

    function styleInject(css, ref) {
      if ( ref === void 0 ) ref = {};
      var insertAt = ref.insertAt;

      if (!css || typeof document === 'undefined') { return; }

      var head = document.head || document.getElementsByTagName('head')[0];
      var style = document.createElement('style');
      style.type = 'text/css';

      if (insertAt === 'top') {
        if (head.firstChild) {
          head.insertBefore(style, head.firstChild);
        } else {
          head.appendChild(style);
        }
      } else {
        head.appendChild(style);
      }

      if (style.styleSheet) {
        style.styleSheet.cssText = css;
      } else {
        style.appendChild(document.createTextNode(css));
      }
    }

    var css_248z = ".leaflet-control-boxzoom{background-color:#fff;border-radius:4px;border:1px solid #ccc;width:25px;height:25px;line-height:25px;box-shadow:0 1px 2px rgba(0,0,0,.65);cursor:pointer!important}.with-background-image{background-image:url(leaflet-control-boxzoom.svg);background-repeat:no-repeat;background-size:21px 21px;background-position:2px 2px}.leaflet-control-boxzoom.leaflet-control-boxzoom-active{background-color:#aaa}.leaflet-container.leaflet-control-boxzoom-active,.leaflet-container.leaflet-control-boxzoom-active path.leaflet-interactive{cursor:crosshair!important}.leaflet-control-boxzoom i{display:block}.leaflet-control-boxzoom i.icon{font-size:17px;margin-left:1px;margin-top:3px}.leaflet-control-boxzoom i.fa{margin-top:6px}.leaflet-control-boxzoom i.glyphicon{margin-top:5px}";
    styleInject(css_248z);

    var css_248z$1 = ".leaflet-control-zoomslider-wrap{padding-top:5px;padding-bottom:5px;background-color:#fff;border-bottom:1px solid #ccc}.leaflet-control-zoomslider-body{width:2px;border:solid #fff;border-width:0 9px;background-color:#000;margin:0 auto}.leaflet-control-zoomslider-knob{position:relative;width:12px;height:4px;background-color:#efefef;-webkit-border-radius:2px;border-radius:2px;border:1px solid #000;margin-left:-6px}.leaflet-control-zoomslider-body:hover{cursor:pointer}.leaflet-control-zoomslider-knob:hover{cursor:default;cursor:-webkit-grab;cursor:-moz-grab}.leaflet-dragging .leaflet-control-zoomslider,.leaflet-dragging .leaflet-control-zoomslider-body,.leaflet-dragging .leaflet-control-zoomslider-knob:hover,.leaflet-dragging .leaflet-control-zoomslider-wrap,.leaflet-dragging .leaflet-control-zoomslider a,.leaflet-dragging .leaflet-control-zoomslider a.leaflet-control-zoomslider-disabled{cursor:move;cursor:-webkit-grabbing;cursor:-moz-grabbing}.leaflet-container .leaflet-control-zoomslider{margin-left:10px;margin-top:10px}.leaflet-control-zoomslider a{width:26px;height:26px;text-align:center;text-decoration:none;color:#000;display:block}.leaflet-control-zoomslider a:hover{background-color:#f4f4f4}.leaflet-control-zoomslider-in{font:700 18px Lucida Console,Monaco,monospace}.leaflet-control-zoomslider-in:after{content:\"\\002B\"}.leaflet-control-zoomslider-out{font:700 22px Lucida Console,Monaco,monospace}.leaflet-control-zoomslider-out:after{content:\"\\2212\"}.leaflet-control-zoomslider a.leaflet-control-zoomslider-disabled{cursor:default;color:#bbb}.leaflet-touch .leaflet-control-zoomslider-body{background-position:10px 0}.leaflet-touch .leaflet-control-zoomslider-knob{width:16px;margin-left:-7px}.leaflet-touch .leaflet-control-zoomslider a,.leaflet-touch .leaflet-control-zoomslider a:hover{width:30px;line-height:30px}.leaflet-touch .leaflet-control-zoomslider-in{font-size:24px;line-height:29px}.leaflet-touch .leaflet-control-zoomslider-out{font-size:28px;line-height:30px}.leaflet-touch .leaflet-control-zoomslider{box-shadow:none;border:4px solid rgba(0,0,0,.3)}.leaflet-oldie .leaflet-control-zoomslider-wrap{width:26px}.leaflet-oldie .leaflet-control-zoomslider{border:1px solid #999}.leaflet-oldie .leaflet-control-zoomslider-in{*zoom:expression(this.runtimeStyle[\"zoom\"] = \"1\",this.innerHTML = \"\\u002B\")}.leaflet-oldie .leaflet-control-zoomslider-out{*zoom:expression(this.runtimeStyle[\"zoom\"] = \"1\",this.innerHTML = \"\\u2212\")}";
    styleInject(css_248z$1);

    var _a, _b;
    const main_css = `
    html,body {
        margin: 0;
    }
    .with-background-image {
        background-image:url(${boxzoom_svg});
        background-size:22px 22px;
        background-position:4px 4px;
    }
    .leaflet-touch .leaflet-control-zoomslider {
        border: none;
    }
    .leaflet-control-boxzoom {
        border:none;
        width:30px;
        height:30px;
    }
`;
    var style = document.createElement('style');
    style.innerHTML = main_css;
    document.head.appendChild(style);
    function parseNumber(v, defvalue) {
        const c = Number(v);
        return isNaN(c) ? defvalue : c;
    }
    const params = new URLSearchParams(window.location.search);
    let path = (_b = (_a = params.get("path")) !== null && _a !== void 0 ? _a : MAPSHOT_CONFIG.path) !== null && _b !== void 0 ? _b : "";
    if (!!path && path[path.length - 1] != "/") {
        path = path + "/";
    }
    console.log("Path", path);
    fetch(path + 'mapshot.json')
        .then(resp => resp.json())
        .then((info) => {
        console.log("Map info", info);
        const isIterable = function (obj) {
            // falsy value is javascript includes empty string, which is iterable,
            // so we cannot just check if the value is truthy.
            if (obj === null || obj === undefined) {
                return false;
            }
            return typeof obj[Symbol.iterator] === "function";
        };
        const worldToLatLng = function (x, y) {
            const ratio = info.render_size / info.tile_size;
            return L$1.latLng(-y * ratio, x * ratio);
        };
        const latLngToWorld = function (l) {
            const ratio = info.tile_size / info.render_size;
            return {
                x: l.lng * ratio,
                y: -l.lat * ratio,
            };
        };
        const midPointToLatLng = function (bbox) {
            return worldToLatLng((bbox.left_top.x + bbox.right_bottom.x) / 2, (bbox.left_top.y + bbox.right_bottom.y) / 2);
        };
        const baseLayer = L$1.tileLayer(path + "zoom_{z}/tile_{x}_{y}.jpg", {
            tileSize: info.render_size,
            bounds: L$1.latLngBounds(worldToLatLng(info.world_min.x, info.world_min.y), worldToLatLng(info.world_max.x, info.world_max.y)),
            noWrap: true,
            maxNativeZoom: info.zoom_max,
            minNativeZoom: info.zoom_min,
            minZoom: info.zoom_min - 4,
            maxZoom: info.zoom_max + 4,
        });
        const mymap = L$1.map('map', {
            crs: L$1.CRS.Simple,
            layers: [baseLayer],
            zoomSnap: 0.1,
            zoomsliderControl: true,
            zoomControl: false,
            zoomDelta: 1.0,
        });
        const layerControl = L$1.control.layers().addTo(mymap);
        const layerKeys = new Map();
        const registerLayer = function (key, name, layer) {
            layerControl.addOverlay(layer, name);
            layerKeys.set(layer, key);
        };
        // Layer: train stations
        let stationsLayers = [];
        if (isIterable(info.stations)) {
            for (const station of info.stations) {
                stationsLayers.push(L$1.marker(midPointToLatLng(station.bounding_box), { title: station.backer_name }).bindTooltip(station.backer_name, { permanent: true }));
            }
        }
        registerLayer("lt", "Train stations", L$1.layerGroup(stationsLayers));
        // Layer: tags
        let tagsLayers = [];
        if (isIterable(info.tags)) {
            for (const tag of info.tags) {
                tagsLayers.push(L$1.marker(worldToLatLng(tag.position.x, tag.position.y), { title: `${tag.force_name}: ${tag.text}` }).bindTooltip(tag.text, { permanent: true }));
            }
        }
        registerLayer("lg", "Tags", L$1.layerGroup(tagsLayers));
        // Layer: debug
        const debugLayers = [
            L$1.marker([0, 0], { title: "Start" }).bindPopup("Starting point"),
        ];
        if (info.player) {
            debugLayers.push(L$1.marker(worldToLatLng(info.player.x, info.player.y), { title: "Player" }).bindPopup("Player"));
        }
        debugLayers.push(L$1.marker(worldToLatLng(info.world_min.x, info.world_min.y), { title: `${info.world_min.x}, ${info.world_min.y}` }), L$1.marker(worldToLatLng(info.world_min.x, info.world_max.y), { title: `${info.world_min.x}, ${info.world_max.y}` }), L$1.marker(worldToLatLng(info.world_max.x, info.world_min.y), { title: `${info.world_max.x}, ${info.world_min.y}` }), L$1.marker(worldToLatLng(info.world_max.x, info.world_max.y), { title: `${info.world_max.x}, ${info.world_max.y}` }));
        registerLayer("ld", "Debug", L$1.layerGroup(debugLayers));
        // Add a control to zoom to a region.
        L$1.Control.boxzoom({
            position: 'topleft',
        }).addTo(mymap);
        // Set original view (position/zoom/layers).
        const queryParams = new URLSearchParams(window.location.search);
        let x = parseNumber(queryParams.get("x"), 0);
        let y = parseNumber(queryParams.get("y"), 0);
        let z = parseNumber(queryParams.get("z"), 0);
        mymap.setView(worldToLatLng(x, y), z);
        layerKeys.forEach((key, layer) => {
            const p = queryParams.get(key);
            if (p == "0") {
                mymap.removeLayer(layer);
            }
            if (p == "1") {
                mymap.addLayer(layer);
            }
        });
        // Update URL when position/view changes.
        const onViewChange = (e) => {
            const z = mymap.getZoom();
            const { x, y } = latLngToWorld(mymap.getCenter());
            const queryParams = new URLSearchParams(window.location.search);
            queryParams.set("x", x.toFixed(1));
            queryParams.set("y", y.toFixed(1));
            queryParams.set("z", z.toFixed(1));
            history.replaceState(null, "", "?" + queryParams.toString());
        };
        mymap.on('zoomend', onViewChange);
        mymap.on('moveend', onViewChange);
        mymap.on('resize', onViewChange);
        // Update URL when overlays are added/removed.
        const onLayerChange = (e) => {
            const key = layerKeys.get(e.layer);
            if (!key) {
                console.log("unknown layer", e.name);
                return;
            }
            const queryParams = new URLSearchParams(window.location.search);
            queryParams.set(key, e.type == "overlayadd" ? "1" : "0");
            history.replaceState(null, "", "?" + queryParams.toString());
        };
        mymap.on('overlayadd', onLayerChange);
        mymap.on('overlayremove', onLayerChange);
    });

}(L));
//# sourceMappingURL=main-0fd1b777.js.map
