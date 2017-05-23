/*global google, Image, API_KEY */

// var API_KEY;  must be defined globally

// Google Maps API magic numbers
var MERCATOR_RANGE = 256; // Google Maps API magic number
var HALF_MERCATOR_RANGE = MERCATOR_RANGE / 2;
var pixelsPerLonDegree = MERCATOR_RANGE / 360;
var pixelsPerLonRadian = MERCATOR_RANGE / (2 * Math.PI);


/**
 *  Create an Image of a map where water and highways are colored green.
 *  Then points in this map can be queried to see if they are inaccessible to travel.
 *  Must call fetch() to load new map data, then query it with isInaccessible()
 */
class AccessMap {
  /**
   * one time init of canvas we can draw maps images on
   */
  constructor() {
    this.width = 640;  // do these need to be params?
    this.height = 640;
    this.initCanvas();  // canvas will be green (masked) where angels fear to tread
  }

  // Initialize canvas for static map used for masking water/highways
  initCanvas() {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('width', this.width );
    canvas.setAttribute('height', this.height );
    this.canvas = canvas.getContext('2d');
  }

  /**
   * Call Maps API to see where inaccessible places are and color them green
   * @return promise when map loaded?  Or provide callback to fire onLoad  FIXME
   */
  fetchAccessibilityData( inMap ) {

    var mapCenter = {
      lat: inMap.getCenter().lat(),
      lng: inMap.getCenter().lng()
    };

    var locationStr = "\"" + mapCenter.lat + "," + mapCenter.lng + "\"";
    var imageZoom = inMap.getZoom() - 1;

    // find x,y image coords
    this.corners = this.getCornersFromLatLong(
      mapCenter.lat, mapCenter.lng, imageZoom, this.width, this.height );

    var promise = new Promise( (resolve, reject) => {

      var mapMask = new Image();
      mapMask.crossOrigin = 'http://maps.googleapis.com/crossdomain.xml';
      mapMask.src =
        "http://maps.googleapis.com/maps/api/staticmap?scale=2&center=" + locationStr
        + "&zoom=" + imageZoom
        + "&size=" + this.width + "x" + this.height
        + "&sensor=false&visual_refresh=true"
        + "&style=feature:water|color:0x00FF00"    // green water
        + "&style=element:labels|visibility:off"
        + "&style=feature:transit|visibility:off"
        + "&style=feature:poi|visibility:off"
        + "&style=feature:administrative|visibility:off"
        + "&style=feature:transit|visibility:off"
        + "&style=feature:road.highway|color:0x00FF00"  // green highways
        + "&key=" + API_KEY;

      // Example imagePath:
      // http://maps.googleapis.com/maps/api/staticmap?scale=2&center="47.60620999999991,-122.33207357423623"&zoom=14&size=640x640&sensor=false&visual_refresh=true&style=feature:water|color:0x00FF00&style=element:labels|visibility:off&style=feature:transit|visibility:off&style=feature:poi|visibility:off&style=feature:administrative|visibility:off&style=feature:transit|visibility:off&style=feature:road.highway|color:0x00FF00

      // Commented out markers and debug spew. Useful when mask test isn't working properly.
      // markersArray.push( new google.maps.Marker({ map: map, icon: destinationIcon, position:searchBounds.getNorthEast() }));
      // markersArray.push( new google.maps.Marker({ map: map, icon: destinationIcon, position:searchBounds.getSouthWest() }));
      // console.log( imagePath );

      // Callback when static map loaded (google returns data)
      mapMask.onload = () => {

        // Draw hidden image for pixel sampling
        this.canvas.drawImage( mapMask, 0, 0, this.width, this.height );

        // return control to caller
        resolve();

        // var next = advancedSearch ? getTimeZoneOffset : calculateTargets;
        // setTimeout( this.calculateTargetsForTZ, 100);
      };
    });

    return promise;
  }

  /**
   * Green pixels wil be inaccessible (water, highways)
   * @return true if pixel is green (i.e., not accessible for travel)
   */
  isInaccessible( lat, lng ) {

    var pixel = this.getPixelLocationByLatLong( lat, lng );

    // is pixel in our map?
    if (pixel.x < 0 || pixel.x >= this.width ||
        pixel.y < 0 || pixel.y >= this.height) {
      return false;
    }

    // is pixel green?
    var pixel_data = this.canvas.getImageData( pixel.x, pixel.y, 1, 1 );
    pixel_data = pixel_data.data;
    var is_green = (pixel_data[0] == 0 &&
                    pixel_data[1] >= 254 &&
                    pixel_data[2] == 0);
    return is_green;
  }

  /**
   * @return x,y coords of corners from lat long at center of map
   */
  getCornersFromLatLong( lat, lng, zoom ) {
    var scale = Math.pow( 2, zoom);
    var centerPixel = this.latLngToPoint(lat, lng);

    var NWPoint = {
      x: (centerPixel.x - (this.width/ 2)/ scale),
      y: (centerPixel.y - (this.height/2)/ scale)
    };
    var NWLatLng = this.pointToLatLng( NWPoint );

    var SEPoint = {
      x: (centerPixel.x + (this.width/ 2)/ scale),
      y: (centerPixel.y + (this.height/2)/ scale)
    };
    var SELatLng = this.pointToLatLng( SEPoint );

    return { northwest: NWLatLng, southeast: SELatLng };
  }

  /**
   * @return
   */
  getPixelLocationByLatLong( lat, lng ) {
    // linear interpolation (which is wrong but we'll start with it)

    var corners = this.corners;

    var width  = corners.southeast.lng - corners.northwest.lng;
    var height = corners.northwest.lat - corners.southeast.lat;
    var x = (lng - corners.northwest.lng) / width;
    var y = (lat - corners.southeast.lat) / height;

    x = x * this.width;
    y = (1-y) * this.height;

    return { x:Math.floor(x), y:Math.floor(y) };
  }


  latLngToPoint( lat, lng ) {
    var x = HALF_MERCATOR_RANGE + lng * pixelsPerLonDegree;
    var siny = Math.sin( this.toRadians( lat ));
    var y = HALF_MERCATOR_RANGE + 0.5 * Math.log((1 + siny) / (1 - siny)) * -pixelsPerLonRadian;
    return { x:x, y:y };
  }

  // Math
  toDegrees( radians ) { return radians / Math.PI * 180; };
  toRadians( degrees ) { return degrees / 180 * Math.PI; };

  pointToLatLng( point ) {
    var latRadians = (point.y - HALF_MERCATOR_RANGE) / -pixelsPerLonRadian;
    var lat = this.toDegrees( 2 * Math.atan( Math.exp( latRadians )) - Math.PI / 2);
    var lng = (point.x - HALF_MERCATOR_RANGE) / pixelsPerLonDegree;
    return { lat:lat, lng:lng };
  }

}
