/*global google, Image */

// IMPORTANT: Replace this key with your own.
// https://developers.google.com/maps/documentation/distance-matrix/get-api-key
// Then scroll to bottom and replace key in async defer script load
var API_KEY = "AIzaSyA9x3G3xULG4S_fWrYd6qcBMeyIzlwYXnQ";
//var API_KEY =   "AIzaSyCNTYx3-TqDQXAsvRByPyY48zKIikFmgtc";



// calculates some Google Map fu

var calculatorCount = 1;
// Google Maps API magic numbers
var MERCATOR_RANGE = 256; // Google Maps API magic number
var HALF_MERCATOR_RANGE = MERCATOR_RANGE / 2;

var pixelsPerLonDegree = MERCATOR_RANGE / 360;
var pixelsPerLonRadian = MERCATOR_RANGE / (2 * Math.PI);
var destinationLimit = 25;


class Calculator {
  constructor( data ) {
    this.id = calculatorCount++;   // so old responses can be ignored
    this.data = data;

    this.calcMapBounds();
    this.findAccessibleTravelPoints( this.data.map, this.data.staticMap );
  }

  get foo() {
    // demo
  }


  getStaticMapCorners( lat, lng, zoom, mapWidth, mapHeight ) {
    var scale = Math.pow( 2, zoom);
    var centerPixel = this.latLngToPoint(lat, lng);

    var NWPoint = {
      x: (centerPixel.x - (mapWidth/2)/ scale),
      y: (centerPixel.y - (mapHeight/2)/ scale)
    };
    var NWLatLng = this.pointToLatLng(NWPoint);

    var SEPoint = {
      x: (centerPixel.x + (mapWidth/2)/ scale),
      y: (centerPixel.y + (mapHeight/2)/ scale)
    };
    var SELatLng = this.pointToLatLng(SEPoint);

    return { northwest: NWLatLng, southeast: SELatLng };
  }

  staticMapPixel( lat, lng, corners, mapWidth, mapHeight ) {
    // linear interpolation (which is wrong but we'll start with it)
    var width = corners.southeast.lng - corners.northwest.lng;
    var height = corners.northwest.lat - corners.southeast.lat;
    var x = (lng - corners.northwest.lng) / width;
    var y = (lat - corners.southeast.lat) / height;

    x = x * mapWidth;
    y = (1-y) * mapHeight;

    return { x:Math.floor(x), y:Math.floor(y) };
  }


  calcMapBounds() {
    // hexagon width
    this.gridInradius = Math.sqrt(3)/2 * this.gridRadius;

  // var departFrom = getType() === 'departFrom';
  // var leaveBy = getTimeType() === 'leaveBy';
  // var isDriving = getTravelMode() === 'DRIVING';
  // var isTransit = getTravelMode() === 'TRANSIT';
  // var advancedSearch = advancedSearchCheck.checked;
    var queryTimeUTC = 0;
    var queryTimeDate;


    this.searchBounds = new google.maps.LatLngBounds( this.data.targetLocation,
                                                      this.data.targetLocation );

    var path = this.data.drawPolyline.getPath();

    if (path.getLength() > 0) {
      for (var i = 0; i < path.getLength(); ++i) {
        this.searchBounds.extend(path.getAt(i));
      }
    } else {
      this.searchBounds.extend(
        this.computeOffset( this.data.targetLocation, 0, this.searchRadius));
      this.searchBounds.extend(
        this.computeOffset( this.data.targetLocation, 90, this.searchRadius));
      this.searchBounds.extend(
        this.computeOffset( this.data.targetLocation, 180, this.searchRadius));
      this.searchBounds.extend(
        this.computeOffset( this.data.targetLocation, 270, this.searchRadius));
    }

    this.data.map.fitBounds( this.searchBounds );
  }




  // FIXME - create or access staticMap here.
  findAccessibleTravelPoints( inMap, inStaticMap ) {
    // FIXME can all this be its own object?

    // Build a static map URL for detecting water/highways, color them green
    var mapCenter = {
      lat: inMap.getCenter().lat(),
      lng: inMap.getCenter().lng()
    };

    var locationStr = "\"" + mapCenter.lat + "," + mapCenter.lng + "\"";
    var imageZoom = inMap.getZoom() - 1;
    var imagePath ="http://maps.googleapis.com/maps/api/staticmap?scale=2&center=" + locationStr
          + "&zoom=" + imageZoom
          + "&size=" + inStaticMap.width + "x" + inStaticMap.height
          + "&sensor=false&visual_refresh=true"
          + "&style=feature:water|color:0x00FF00"
          + "&style=element:labels|visibility:off"
          + "&style=feature:transit|visibility:off"
          + "&style=feature:poi|visibility:off"
          + "&style=feature:administrative|visibility:off"
          + "&style=feature:transit|visibility:off"
          + "&style=feature:road.highway|color:0x00FF00";

    // Example imagePath:
    // http://maps.googleapis.com/maps/api/staticmap?scale=2&center="47.60620999999991,-122.33207357423623"&zoom=14&size=640x640&sensor=false&visual_refresh=true&style=feature:water|color:0x00FF00&style=element:labels|visibility:off&style=feature:transit|visibility:off&style=feature:poi|visibility:off&style=feature:administrative|visibility:off&style=feature:transit|visibility:off&style=feature:road.highway|color:0x00FF00

    var mapMask = new Image();
    mapMask.crossOrigin = 'http://maps.googleapis.com/crossdomain.xml';
    mapMask.src = imagePath;
    var mapMaskCorners = this.getStaticMapCorners(
      mapCenter.lat, mapCenter.lng, imageZoom,
      this.data.staticMap.width, this.data.staticMap.height );

    // Commented out markers and debug spew. Useful when mask test isn't working properly.
    // markersArray.push( new google.maps.Marker({ map: map, icon: destinationIcon, position:searchBounds.getNorthEast() }));
    // markersArray.push( new google.maps.Marker({ map: map, icon: destinationIcon, position:searchBounds.getSouthWest() }));
    // console.log( imagePath );


    // Callback when static map loaded (google returns data)
    mapMask.onload = () => {

      // Draw image (hidden) for sampling
      this.staticMapCanvas.drawImage( mapMask, 0, 0, 640, 640 );

      // var next = advancedSearch ? getTimeZoneOffset : calculateTargets;
      setTimeout( this.calculateTargetsForTZ, 100);
    };
  }


  calculateTargetsForTZ() {
    var utcSeconds = this.travelTime.getTime() / 1000;

    var request = new XMLHttpRequest();
    var url = "https://maps.googleapis.com/maps/api/timezone/json?location=" +
          this.data.targetLocation.lat + "," + this.data.targetLocation.lng +
          "&timestamp=" + utcSeconds + "&key=" + API_KEY;

    request.onload = () => {
      var response = JSON.parse( request.responseText );
      var timeOffsetDst = Number( response.dstOffset );
      var timeOffsetRaw = Number( response.rawOffset );

      // ???  FIXME
      queryTimeUTC = utcSeconds - (timeOffsetDst + timeOffsetRaw);
      queryTimeDate = new Date(0);
      queryTimeDate.setUTCSeconds( queryTimeUTC );

      this.calculateTargets();
    };

    request.onerror = () => {
      this.calculateTargets();
    };

    request.open("GET", url, true);
    request.send();
  }



  calculateTargets() {

    // Build targets for new queryTimeout
    var row = 0;
    var col = 0;
    var targets = [];

    var southwest = this.searchBounds.getSouthWest();
    southwest = { lat:southwest.lat(), lng:southwest.lng() };

    var northeast = this.searchBounds.getNorthEast();
    northeast = { lat:northeast.lat(), lng:northeast.lng() };

    // Row loop
    for (;;) {

      // Calculate center of first hexagon for this row
      var rowBegin = this.computeOffset(southwest, 0, gridInradius * row);
      if ((row % 2) == 1)
        rowBegin = this.computeOffset(rowBegin, 90, gridRadius * 1.5);

      if (rowBegin.lat > northeast.lat)
        break;

      if (targets.length > targetLimit) {
        console.log("ERROR: Exceeded target limit of [" + targetLimit + "]");
        break;
      }

      // Column loop
      for (;;) {
        var polyCenter = this.computeOffset(rowBegin, 90, gridRadius * 3 * col);
        if (polyCenter.lng > northeast.lng || targets.length > targetLimit)
          break;

        // Test point against mask
        var dest = polyCenter;
        var inaccessible = this.isInaccessible( mapMask, dest.lat, dest.lng, mapMaskCorners, staticMapWidth, staticMapHeight);

        if (masked) {
          // If center is masked try a few points near the center
          for (var i = 0; i < 4 && masked; ++i) {
            dest = computeOffset(polyCenter, 45 + 90*i, gridRadius * .5);
            masked = isMasked(mapMask, dest.lat, dest.lng, mapMaskCorners, staticMapWidth, staticMapHeight);
          }
        }

        var path = drawPolyline.getPath();
        if (!masked && path.getLength() > 0) {
          if (!pointInPolygon(dest, path.getArray()))
            masked = true;
        }

        if (!masked && path.getLength() == 0) {
          var dist = computeDistance(polyCenter, targetLocation);
          if (dist > searchRadius)
            masked = true;
        }

        if (!masked) {
          targets.push({dest:dest, polyCenter:polyCenter});
          searchBounds.extend(polyCenter);
        }

        col += 1;
      }

      row += 1;
      col = 0;
    }
    map.fitBounds(searchBounds);

    // Setup queryOrigins and queryDestinations based on query type (departFrom vs arriveAt)
    var mappedTargets = targets.map(e=>e.dest);
    queryOrigins = departFrom ? [targetLocation] : targets.map(e=>e.dest);
    queryDestinations = departFrom ? targets.map(e=>e.dest) : [targetLocation];

    // Build initial set of indices
    queryIndices = [];
    for (var i = 0; i < targets.length; i += destinationLimit)
      queryIndices.push(i);

    // Begin query
    stepQuery();
  }





  /**
   * Intersect ray going out from point against all polygon edges.
   * Even number of intersections means outside, odd means inside
   *
   * @return true if inside
   */
  isPointInPolygon( pointLatLng, polygonPoints ) {

    function diff(a, b) { return [a[0]-b[0], a[1]-b[1]]; };
    function dot(a, b) { return a[0]*b[0] + a[1]*b[1]; };
    function cross(a,b) { return a[0]*b[1] - a[1]*b[0]; };

    var point = [pointLatLng.lat, pointLatLng.lng];

    var count = 0;
    for (var i = 0; i < polygonPoints.length; ++i) {
      var j = i+1 < polygonPoints.length ? i+1 : 0;

      var polyA = polygonPoints[i];
      var polyB = polygonPoints[j];

      polyA = [polyA.lat(), polyA.lng()];
      polyB = [polyB.lat(), polyB.lng()];

      var v1 = diff(point, polyA);
      var v2 = diff(polyB, polyA);
      var v3 = [0, 1];

      var d = dot(v2, v3);
      if (Math.abs(d) < .00001)
        continue;

      var t1 = cross(v2,v1) / d;
      var t2 = dot(v1,v3) / d;

      if (t1 >= 0 && t2 >= 0 && t2 <= 1)
        ++count;
    }

    return count % 2 == 1;
  }


  /** @return plain obj from google obj */
  latLngToObj( latlng ) {
    return {
      lat: latlng.lat(),
      lng: latlng.lng()
    };
  }

  // StaticMap mask utilities
  latLngToPoint( lat, lng ) {
    var x = HALF_MERCATOR_RANGE + lng * pixelsPerLonDegree;
    var siny = Math.sin( this.toRadians( lat ));
    var y = HALF_MERCATOR_RANGE + 0.5 * Math.log((1 + siny) / (1 - siny)) * -pixelsPerLonRadian;
    return { x:x, y:y };
  }

  pointToLatLng( point ) {
    var latRadians = (point.y - HALF_MERCATOR_RANGE) / -pixelsPerLonRadian;
    var lat = this.toDegrees( 2 * Math.atan(Math.exp(latRadians)) - Math.PI / 2);
    var lng = (point.x - HALF_MERCATOR_RANGE) / pixelsPerLonDegree;
    return { lat:lat, lng:lng };
  }

  /**
   * Green pixels wil be inaccessible (water, highways)
   * @return true if pixel is green (i.e., not accessible for travel)
   */
  isInaccessible( mapMask, lat, lng, corners, mapWidth, mapHeight) {

    var pixel = this.staticMapPixel( lat, lng, corners, mapWidth, mapHeight );
    if (pixel.x < 0 || pixel.x >= mapWidth ||
        pixel.y < 0 || pixel.y >= mapHeight) {
      return false;
    }

    var pixel_data =
          this.data.staticMapCanvas.getImageData( pixel.x, pixel.y, 1, 1 );
    pixel_data = pixel_data.data;
    var is_green = (pixel_data[0] == 0 &&
                    pixel_data[1] >= 254 &&
                    pixel_data[2] == 0);
    return is_green;
  }


  // Math
  toRadians( degrees ) { return degrees / 180 * Math.PI; };
  toDegrees( radians ) { return radians / Math.PI * 180; };

  /** @return navigational vector from location */
  computeOffset( location, bearing, distance ) {
    var point = new google.maps.LatLng( location.lat, location.lng );

    var dest = google.maps.geometry.spherical.computeOffset(
      point, distance, bearing );

    return this.latLngToObj( dest );
  };


}
