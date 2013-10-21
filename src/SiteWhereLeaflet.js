/*
 * SiteWhere extensions for Leaflet maps.
 */
L.Map.SiteWhere = L.Map.extend({
	
	statics: {
		MAP_TYPE_MAPQUEST: "mapquest",
		MAP_TYPE_GEOSERVER: "geoserver",
	},

	options: {
		siteWhereApi: 'http://localhost:8080/sitewhere/api/',
		siteToken: null,
		showZones: true,
		onZonesLoaded: null,
	},
	
	/** Initialize components */
	initialize: function(id, options) {
		L.setOptions(this, options);
		L.Map.prototype.initialize.call(this, id, options);
        
		// Error if no site token specified.
		if (!this.options.siteToken) {
			this._handleNoSiteToken();
		} else {
			this.refresh();
		}
	},
	
	/** Refresh site information */
	refresh: function() {
		var self = this;
		var url = this.options.siteWhereApi + 'sites/' + this.options.siteToken;
		L.SiteWhere.Util.getJSON(url, 
				function(site, status, jqXHR) { self._onSiteLoaded(site); }, 
				function(jqXHR, textStatus, errorThrown) { self._onSiteFailed(jqXHR, textStatus, errorThrown); }
		);
	},
	
	/** Called when site data has been loaded successfully */
	_onSiteLoaded: function(site) {
		var mapInfo = this._metadataAsLookup(site.mapMetadata.metadata);
		var latitude = (mapInfo.centerLatitude ? mapInfo.centerLatitude : 39.9853);
		var longitude = (mapInfo.centerLongitude ? mapInfo.centerLongitude : -104.6688);
		var zoomLevel = (mapInfo.zoomLevel ? mapInfo.zoomLevel : 10);
		L.Map.prototype.setView.call(this, [latitude, longitude], zoomLevel);
		this._loadMapTileLayer(site, mapInfo);
		if (this.options.showZones) {
			var zones = L.FeatureGroup.SiteWhere.zones({
				siteWhereApi: this.options.siteWhereApi,
				siteToken: this.options.siteToken,
				onZonesLoaded: this.options.onZonesLoaded,
			});
			this.addLayer(zones);
		}
	},
	
	/** Loads a TileLayer based on map type and metadata associated with site */
	_loadMapTileLayer: function(site, mapInfo) {
		if (site.mapType == L.Map.SiteWhere.MAP_TYPE_MAPQUEST) {
			var mapquestUrl = 'http://{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png';
			var subDomains = ['otile1','otile2','otile3','otile4'];
			var mapquestAttrib = 'MapQuest data';
			var mapquest = new L.TileLayer(mapquestUrl, {maxZoom: 18, attribution: mapquestAttrib, subdomains: subDomains});		
			mapquest.addTo(this);
		} else if (site.mapType == L.Map.SiteWhere.MAP_TYPE_GEOSERVER) {
			var gsBaseUrl = (mapInfo.geoserverBaseUrl ? mapInfo.geoserverBaseUrl : "http://localhost:8080/geoserver/");
			var gsRelativeUrl = "geoserver/gwc/service/gmaps?layers=";
			var gsLayerName = (mapInfo.geoserverLayerName ? mapInfo.geoserverLayerName : "tiger:tiger_roads");
			var gsParams = "&zoom={z}&x={x}&y={y}&format=image/png";
			var gsUrl = gsBaseUrl + gsRelativeUrl + gsLayerName + gsParams;
			var geoserver = new L.TileLayer(gsUrl, {maxZoom: 18});		
			geoserver.addTo(this);
		}
	},
	
	/** Called when site data load fails */
	_onSiteFailed: function(jqXHR, textStatus, errorThrown) {
		alert('Site load failed! ' + errorThrown);
	},
	
	/** Handle error condition if no site token was specified */
	_handleNoSiteToken: function() {
		alert('No site token.');
	},
	
	/** Converts SiteWhere entity metadata to a lookup */
	_metadataAsLookup: function(metadata) {
		var lookup = {};
		for (var i = 0, len = metadata.length; i < len; i++) {
		    lookup[metadata[i].name] = metadata[i].value;
		}
		return lookup;
	},
});

L.Map.siteWhere = function (id, options) {
    return new L.Map.SiteWhere(id, options);
};

/*
 * Container for SiteWhere feature groups.
 */
L.FeatureGroup.SiteWhere = {};

/*
 * Feature group for SiteWhere zones.
 */
L.FeatureGroup.SiteWhere.Zones = L.FeatureGroup.extend({

	options: {
		siteWhereApi: 'http://localhost:8080/sitewhere/api/',
		siteToken: null,
		onZonesLoaded: null,
		zoneTokenToSkip: null,
	},
	
	initialize: function(options) {
        L.setOptions(this, options);
        L.FeatureGroup.prototype.initialize.call(this);
        
        // Error if no site token specified.
        if (!this.options.siteToken) {
        	this._handleNoSiteToken();
        } else {
        	this.refresh();
        }
	},
	
	/** Refresh zones information */
	refresh: function() {
		var self = this;
		var url = this.options.siteWhereApi + 'sites/' + this.options.siteToken + "/zones";
		L.SiteWhere.Util.getJSON(url, 
				function(zones, status, jqXHR) { self._onZonesLoaded(zones); }, 
				function(jqXHR, textStatus, errorThrown) { self._onZonesFailed(jqXHR, textStatus, errorThrown); }
		);
	},
	
	/** Called when zones data has been loaded successfully */
	_onZonesLoaded: function(zones) {
		var zone, results = zones.results;
		var polygon;
		
		// Add newest last.
		results.reverse();
		
		// Add a polygon layer for each zone.
		for (var zoneIndex = 0; zoneIndex < results.length; zoneIndex++) {
			zone = results[zoneIndex];
			if (zone.token != this.options.zoneTokenToSkip) {
				polygon = this._createPolygonForZone(zone);
				this.addLayer(polygon);
			}
		}
		
		// Callback for actions taken after zones are loaded.
		if (this.options.onZonesLoaded != null) {
			this.options.onZonesLoaded();
		}
	},
	
	/** Create a polygon layer based on zone information */
	_createPolygonForZone: function(zone) {
		var coords = zone.coordinates;
		var latLngs = [];
		for (var coordIndex = 0; coordIndex < coords.length; coordIndex++) {
			coordinate = coords[coordIndex];
			latLngs.push(new L.LatLng(coordinate.latitude, coordinate.longitude));
		}
		var polygon = new L.Polygon(latLngs, {
			"color": zone.borderColor, "opacity": 1, weight: 3,
			"fillColor": zone.fillColor, "fillOpacity": zone.opacity,
			"clickable": false});
		return polygon;
	},
	
	/** Called when zones data load fails */
	_onZonesFailed: function(jqXHR, textStatus, errorThrown) {
		alert('Zones load failed! ' + errorThrown);
	},
	
	/** Handle error condition if no site token was specified */
	_handleNoSiteToken: function() {
		alert('No site token.');
	},
});

L.FeatureGroup.SiteWhere.zones = function (options) {
	return new L.FeatureGroup.SiteWhere.Zones(options);
};

/*
 * Container for SiteWhere classes.
 */
L.SiteWhere = {};

/*
 * SiteWhere utility functions.
 */
L.SiteWhere.Util = L.Class.extend({
	
	statics: {
		
		/** Make a JSONP GET request */
		getJSON: function(url, onSuccess, onFail) {
			return jQuery.ajax({
				'type' : 'GET',
				'dataType': 'jsonp',
				'url' : url,
				'contentType' : 'application/json',
				'success' : onSuccess,
				'error' : onFail
			});
		},
	},
})