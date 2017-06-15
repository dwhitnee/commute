/*global google, AccessMap, API_KEY */

// IMPORTANT: API_KEY must be defined globally (see index.html)

var destinationLimit = 25;

/**
 * Calculate all the travel hexagons and travel times from each hex to
 * the destiation.
 */

class Calculator {
  constructor( data ) {
    this.batchId = 0;   // so old responses can be ignored
    this.data = data;

    this.location = data.targetLocation;
    this.map = data.map;
    this.polyColors = data.polyColors;
    this.gridRadius = data.gridRadius;

    this.rateLimitCounter = 0;
    this.searchBounds = this.calcSearchBounds( data.searchRadius, data.drawPolyline );
    this.map.fitBounds( this.searchBounds );

    this.queryTimeout = undefined;

    this.accessMap = new AccessMap();

    this.service = new google.maps.DistanceMatrixService();
  }

  get foo() {
    // demo
  }

  calculate() {
    this.batchId++;
    this.accessMap.fetchAccessibilityData( this.map )
      .then( () => {
        // getTimeZone().then(...);  // if leaveAt or arriveBy is specified.  FIXME
        this.calculateTargets();
      });
  }


  /** @return vertices of a polygon */
  getHexagonCoords( center, size ) {
      var coords = [
        this.computeOffset( center, 30, size),
        this.computeOffset( center, 90, size),
        this.computeOffset( center, 150, size),
        this.computeOffset( center, 210, size),
        this.computeOffset( center, 270, size),
        this.computeOffset( center, 330, size),
      ];

    return coords;
  };


  /** @return magnitude of travel time (to color polygons) */
  getTravelTimeMagnitudeIndex( travelTimeSeconds ) {
    var travelTimeThresholds = [ 15, 30, 45, 60, /*75, 90,*/ Infinity ];

    for (var i = 0; i < travelTimeThresholds.length; ++i)
      if (travelTimeSeconds < travelTimeThresholds[i] * 60)
        return i;

    return travelTimeThresholds.length - 1;     // should never get here
  }


  // exponential backoff
  getQueryDelay() {
    var requestInterval = 1100;  // ms between requests

    return Math.min( Math.pow( 1.5, 1 + this.rateLimitCounter) * requestInterval, 15000);
  }

  // one query to API?
  stepQuery( delay ) {
    var leaveAt = this.data.transitTimeType === 'leaveAt';
    var departFrom = this.data.travelDirection === 'departFrom';
    var isDriving = this.data.travelMode === google.maps.TravelMode.DRIVING;
    var isTransit = this.data.travelMode === google.maps.TravelMode.TRANSIT;

    var queryTimeUTC = 0;
    var queryTimeDate;

    // Setup queryOrigins and queryDestinations based on query type (departFrom vs arriveAt)
    var mappedTargets = this.targets.map(e => e.dest);
    var queryOrigins = departFrom ? [this.location] : this.targets.map(e => e.dest);
    var queryDestinations = departFrom ? this.targets.map(e=>e.dest) : [this.location];


    var i = this.queryIndices.pop();
    var count = Math.min( this.targets.length - i, destinationLimit);

    var stepOrigins =      departFrom ? queryOrigins : queryOrigins.slice(i, i + count);
    var stepDestinations = departFrom ? queryDestinations.slice(i, i + count) : queryDestinations;

    var query = {
      origins: stepOrigins,
      destinations: stepDestinations,
      travelMode: this.data.travelMode,
      transitOptions: { modes: this.data.transitModes },
      unitSystem: google.maps.UnitSystem.METRIC,
      avoidHighways: false,
      avoidTolls: false
    };


    // FIXME, queryTime would be set if timezone offset calculated
    if (queryTimeUTC != 0) {
      if (isDriving) {
        query['drivingOptions'] = {
          'departureTime': queryTimeDate,
          'trafficModel': this.data.trafficModel
        };
      } else if (isTransit) {
        var transitTimeType = (leaveAt ? 'departureTime' : 'arrivalTime');
        query.transitOptions[transitTimeType] = queryTimeDate;
      }
    }

    // make the call then wait a bit before doing the next one
    this.service.getDistanceMatrix(query, this.queryResponseClosure(i));

    // fire a query every second or so
    if (this.queryIndices.length > 0) {
      this.queryTimeout = setTimeout(
        () => { this.stepQuery(); },
        this.getQueryDelay() );
    } else {
      this.queryTimeout = null;
    }
  }


  // Callback closure for GoogleMapsAPI.distanceMatrix
  queryResponseClosure( index ) {

    var idx = index;
    var batchId = this.batchId;

    return (response, status) => {

      if (this.batchId != batchId)      // Ignore response if it's to an old query
        return;

      if (status !== 'OK') {

        // Re-request if rate limiter hit
        if (status === 'OVER_QUERY_LIMIT') {
          this.rateLimitCounter++;
          console.log("Unexpected error: [" + status + "] Index: [" + idx +
                      "]  DelayCount: [" + this.rateLimitCounter + "]");
          this.queryIndices.push(idx);

          // try again in a bit
          if (!this.queryTimeout) {
            this.queryTimeout = setTimeout(
              () => { this.stepQuery(); },
              this.getQueryDelay() );
          }
        }  else {
          console.log("Unexpected error: [" + status + "]");
        }

        return;
      }

      // good response
      this.rateLimitCounter = 0;

      // Process results
      for (var i = 0; i < response.rows.length; i++) {
        var results = response.rows[i].elements;

        for (var j = 0; j < results.length; j++) {

          var result = results[j];
          if (result.status !== 'OK') // No route found?
            continue;

          var travelTime = result.duration_in_traffic ? result.duration_in_traffic.value : result.duration.value;

          var departFrom = this.data.travelDirection === 'departFrom';

          var targetIdx = idx + (departFrom ? j : i);
          var center = this.targets[targetIdx].polyCenter;

          // FIXME: this seems weird to call out to app
          var poly = this.data.addHexagonToMap(
            center, this.getHexagonCoords( center, this.gridRadius ),
            this.getTravelTimeMagnitudeIndex( travelTime ), travelTime );
        }
      }
    };
  }





  // find bounding box of drawn outline boundary or square of search radius
  calcSearchBounds( searchRadius, drawnPolyline) {
    var searchBounds = new google.maps.LatLngBounds( this.location, this.location );

    var path = drawnPolyline.getPath();

    if (path.getLength() > 0) {
      for (var i = 0; i < path.getLength(); ++i) {
        searchBounds.extend( path.getAt(i) );
      }
    } else {
      searchBounds.extend( this.computeOffset( this.location, 0, searchRadius));
      searchBounds.extend( this.computeOffset( this.location, 90, searchRadius));
      searchBounds.extend( this.computeOffset( this.location, 180, searchRadius));
      searchBounds.extend( this.computeOffset( this.location, 270, searchRadius));
    }
    return searchBounds;
  }



  /**
   * @return promise that will be called with the local time for the given Longitude
   */
  fetchTimeZoneOffset() {
    var utcSeconds = this.travelTime.getTime() / 1000;

    var url = "https://maps.googleapis.com/maps/api/timezone/json?location=" +
          this.location.lat + "," + this.location.lng +
          "&timestamp=" + utcSeconds + "&key=" + API_KEY;

    return new Promise( ( resolve, reject ) => {

      window.fetch( url )
        .then( ( response ) => {
          debugger  // is response json text or JSON obj? or responseText?
          // var response = JSON.parse( request.responseText );

          var timeOffsetDst = Number( response.dstOffset );
          var timeOffsetRaw = Number( response.rawOffset );

          // ???  FIXME
          var queryTimeUTC = utcSeconds - (timeOffsetDst + timeOffsetRaw);
          var queryTimeDate = new Date(0);
          queryTimeDate.setUTCSeconds( queryTimeUTC );

          resolve( queryTimeDate );
        })
        .catch( (error) => {
          console.error( error );
          this.calculateTargets();
        });
    });
  }


  // build grid of hexagons and a point that can be travelled to in each one
  calculateTargets() {

    // Build targets to query the commute for
    var row = 0;
    var col = 0;
    var targetLimit = 10000;

    this.targets = [];

    // hexagon circular width
    var gridInRadius = Math.sqrt(3)/2 * this.gridRadius;

    var southwest = this.searchBounds.getSouthWest();
    southwest = { lat:southwest.lat(), lng:southwest.lng() };

    var northeast = this.searchBounds.getNorthEast();
    northeast = { lat:northeast.lat(), lng:northeast.lng() };

    // Row loop
    for (;;) {

      // Calculate center of first hexagon for this row
      var rowBegin = this.computeOffset(southwest, 0, gridInRadius * row);
      if ((row % 2) == 1)
        rowBegin = this.computeOffset(rowBegin, 90, this.gridRadius * 1.5);

      if (rowBegin.lat > northeast.lat)
        break;

      if (this.targets.length > targetLimit) {
        console.log("ERROR: Exceeded target limit of [" + targetLimit + "]");
        break;
      }

      // Column loop
      for (;;) {
        var polyCenter = this.computeOffset(rowBegin, 90, this.gridRadius * 3 * col);
        if (polyCenter.lng > northeast.lng || this.targets.length > targetLimit)
          break;

        // Test point against mask
        var dest = polyCenter;
        var inaccessible = this.accessMap.isInaccessible( dest.lat, dest.lng );

        // If center of hexagon is water or highway, try a few points near the center
        if (inaccessible) {
          for (var i = 0; i < 4 && inaccessible; ++i) {
            dest = this.computeOffset(polyCenter, 45 + 90*i, this.gridRadius * .5);
            inaccessible = this.accessMap.isInaccessible( dest.lat, dest.lng );
          }
        }

        var path = this.data.drawPolyline.getPath();
        if (!inaccessible && path.getLength() > 0) {
          if (!this.isPointInPolygon( dest, path.getArray()))
            inaccessible = true;
        }

        if (!inaccessible && path.getLength() == 0) {
          var dist = this.computeDistance(polyCenter, this.location);
          if (dist > this.data.searchRadius)
            inaccessible = true;
        }

        if (!inaccessible) {
          this.targets.push({ dest:dest, polyCenter:polyCenter });
          this.searchBounds.extend(polyCenter);
        }

        col += 1;
      }

      row += 1;
      col = 0;
    }

    this.map.fitBounds( this.searchBounds );

    // Build initial set of indices
    this.queryIndices = [];
    for (var i = 0; i < this.targets.length; i += destinationLimit)
      this.queryIndices.push(i);

    // Begin queries
    this.stepQuery();
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

  computeDistance( a, b ) {
    return google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng( a.lat, a.lng ),
      new google.maps.LatLng( b.lat, b.lng ));
  }

  /** @return new location if we travel bearing a distance from startLocation */
  computeOffset( startLocation, bearing, distance ) {
    var point = new google.maps.LatLng( startLocation.lat, startLocation.lng );

    var dest = google.maps.geometry.spherical.computeOffset(
      point, distance, bearing );

    return this.latLngToObj( dest );
  };


}
