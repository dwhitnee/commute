/*global Vue, google, TravelTimeCalculator */

/**
 * This is the VueJS application object. It contains the data (model) that shows up
 * in the web page whenever it's changed.
 */

var SEATTLE = { lat:47.60621, lng:-122.332071 };

//----------------------------------------------------------------------
// Create the vueJS app data that controls all the rendering.
//----------------------------------------------------------------------
new Vue({
  el: '#commuteVisualizerApp',

  //----------------------------------------
  // The data model. When these values change the page gets re-rendered
  // update these values, rather than update the DOM directly
  //----------------------------------------
  data: {
    travelTimeHour: "5:00 PM",
    travelTimeDay:   Date.today().getDay(),
    travelTimeMonth: Date.today().toString("MMM"),
    travelTimeYear:  Date.today().toString("yyyy"),
    travelMode:   google.maps.TravelMode.DRIVING,
    trafficModel: google.maps.TrafficModel.PESSIMISTIC,
    travelDirection: "departFrom",  // departFrom, arriveAt,
    transitTimeType: "leaveAt", // leaveAt, arriveBy (bus only)

    gridRadius: 250,            // hexagon radius in meters
    targetLocation: SEATTLE,    // LatLng of "primary" target location

    trafficModels: [
      google.maps.TrafficModel.BEST_GUESS,
      google.maps.TrafficModel.OPTIMISTIC,
      google.maps.TrafficModel.PESSIMISTIC
    ],
    travelModes: [
      google.maps.TravelMode.WALKING,
      google.maps.TravelMode.BICYCLING,
      google.maps.TravelMode.TRANSIT,
      google.maps.TravelMode.DRIVING
    ],
    transitModes: [
      google.maps.TransitMode.BUS,
      google.maps.TransitMode.RAIL
    ],
    transitTimeTypes: ["leaveAt", "arriveBy"],

    showStyleOptions: false,

    map: undefined,  // the google Map object (what does it do?)
    drawPolyline: undefined,
    targetLocationMarker: undefined, // MapMarker for targetLocation

    polyFillOpacity: 0.5,
    polyStrokeOpacity: 0.8,
    polyColors: ['#388C04', '#F0DE1B', '#FF7215', '#E00300',
                 /*'#CB55E3', '#3B74ED',*/ '#D3D3D3'],

    polyArray: [],                // search result polygons

    // hidden
    showMarker: true,
    showMapControls: true,

    inDrawMode: false,   // flags for bounds drawings
    drawing: false,

    markersArray: [],
    foo: "deleteme"
  },

  //----------------------------------------
  // Formatters for the web page
  // Ex: {{ travelTime | date }}
  //----------------------------------------
  filters: {
    date: function( date ) {
      if (date) {
        return date.toString(" h:mm tt MMMM dd, yyyy");
      } else {
        return "";
      }
    }
  },

  //----------------------------------------
  // fired when the named data elements change
  //----------------------------------------
  watch: {
    travelMode: function() {
      if (this.travelMode === "DRIVING") {
        this.transitTimeType = "leaveAt";  // can't use arriveBy for driving
      }
    },

    // this should be done v=on:change="refreshMarker"?
    showMarker: function() {
      this.refreshMarker();
    }
  },

  //----------------------------------------
  // run when the web page asks for these named values
  //----------------------------------------
  computed: {
    showAdvancedSearch: function() {
      return this.travelMode === "TRANSIT" || this.travelMode === "DRIVING";
    },

    searchRadius: function() {
      return this.gridRadius * 10;
    },

    // time of departure or arival (not duration)
    travelTime: function() {
      return new Date("" + this.travelTimeYear +
                      " " + this.travelTimeMonth +
                      " " + this.travelTimeDay +
                      " " + this.travelTimeHour );
    },

    // @return array of current years (including last year)
    years: function() {
      var year = (new Date()).getFullYear();
      return [year-1,year, year+1];
    },

    months: function() {
      var date = new Date("1-1-2000 12:00");
      var months = [];
      for (var m=0; m < 12; m++) {
        months.push( date.toString("MMMM"));
        date.addMonths( 1 );
      }
      return months;
    },

    daysInMonth: function() {
      return Date.getDaysInMonth(
        this.travelTimeYear,
        Date.getMonthNumberFromName( this.travelTimeMonth ));
    },


    // @return array of time strings from 12:00 am to 11:45 pm
    minutesOfTheDay: function() {
      var times = [];
      var date = new Date("1-1-2000 12:00 AM");

      for (var h=0; h < 24; h++) {
        for (var m = 0; m < 60; m += 15) {
          times.push( date.toString("h:mm tt"));
          date.addMinutes( 15 );
        }
      }

      return times;
    }

  },


  //----------------------------------------
  // sort of like onReady
  //----------------------------------------
  mounted: function() {
    this.initGoogleMaps();
    this.initDrawing();

    this.parseURL();
  },


  //----------------------------------------
  // event handlers accessible from the web page
  //----------------------------------------
  methods: {

    /**
     * create map polygon, add tooltip with travel time.
     */
    addHexagonToMap( center, vertices, colorIndex, travelTime ) {
      var color = this.polyColors[colorIndex];

      var minutes = (Math.round((travelTime/60) * 100) / 100).toFixed(1);

      var poly = new google.maps.Polygon({
        paths: vertices,
        strokeColor: color,
        strokeOpacity: this.polyStrokeOpacity,
        strokeWeight: 1,
        fillColor: color,
        fillOpacity: colorIndex < this.polyColors.length - 1 ? this.polyFillOpacity : .35,
        zIndex: -colorIndex,

        // user data
        travelTime: travelTime,
        center: center,
        isInfoOpen: false,
        infoWindow: new google.maps.InfoWindow({
          content: `${minutes} minutes`,
          position: center
        })
      });

      this.polyArray.push( poly );

      // new hexagon entered, move tooltip to this hexagon and display travel time.
      var handleMouseOver = function( ev ) {
        console.log( this.isInfoOpen );
        if (!this.isInfoOpen) {
          this.infoWindow.open( this.map );
          this.isInfoOpen = true;  // really google?
        };
      };

      // hide tooltip if displayed (this flickers if the infoWindow in
      // the poly gets hovered over because it triggers mouseout of polygon) Grrrr...
      var handleMouseOut = function( ev ) {
        // "this" is the polygon
        if (this.isInfoOpen) {
          this.infoWindow.close();
          this.isInfoOpen = false;
        };
      };

      google.maps.event.addListener( poly, 'mouseover', handleMouseOver );
      google.maps.event.addListener( poly, 'mouseout', handleMouseOut );
      poly.setMap( this.map );

    },

    // hide Google Map buttons and such. Cosmetic only
    // this only works once, then mapControlDiv gets lost somehow...
    toggleMapControls: function() {

      this.showMapControls = !this.showMapControls;

      this.map.setOptions({ disableDefaultUI: !this.showMapControls });

      this.showMarker = this.showMapControls;
      this.refreshMarker();

    },

    refreshMarker: function() {
      if (this.targetLocationMarker) {
        this.targetLocationMarker.setMap( null );
      }

      if (this.showMarker) {
        this.targetLocationMarker = new google.maps.Marker({
          map: this.map,
          position: this.targetLocation,
          clickable: false
        });
      }
    },

    setTargetLocation: function( targetLocation ) {
      this.targetLocation = targetLocation;
      this.refreshMarker();
    },

    // Create Google Maps API objects
    initGoogleMaps: function() {

      var bounds = new google.maps.LatLngBounds();
      this.map = new google.maps.Map(
        document.getElementById('map'),
        {
          center: this.targetLocation,
          zoom: 11,
          clickableIcons: false
        });

      this.setTargetLocation( this.targetLocation );
      this.map.setCenter( this.targetLocation );


      // Create search bar
      var inputEl = document.getElementById('map-searchbox');
      var searchBox = new google.maps.places.SearchBox( inputEl );

      // commented out here to better set positioning controls via CSS
      // map.controls[google.maps.ControlPosition.TOP_CENTER].push(input);

      this.map.addListener('bounds_changed', () => {
        searchBox.setBounds( this.map.getBounds() );
      });

      searchBox.addListener('places_changed', () => {
        var places = searchBox.getPlaces();
        if (places.length == 0)
          return;

        // delete old markers
        for (var i = 0; i < this.markersArray.length; i++)
          this.markersArray[i].setMap(null);
        this.markersArray = [];

        // For each place, get the icon, name and location.
        bounds = new google.maps.LatLngBounds;
        places.forEach( (place) => {
          if (!place.geometry)
            return;

          var icon = {
            url: place.icon,
            size: new google.maps.Size( 71, 71 ),
            origin: new google.maps.Point( 0, 0 ),
            anchor: new google.maps.Point( 17, 34 ),
            scaledSize: new google.maps.Size( 25, 25 )
          };

          this.showMarker = true;
          this.setTargetLocation({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng() });

          // Create a marker for each place.
          this.markersArray.push( new google.maps.Marker({
            map: this.map,
            icon: icon,
            title: place.name,
            position: place.geometry.location
          }));

          if (place.geometry.viewport)
            bounds.union( place.geometry.viewport );
          else
            bounds.extend( place.geometry.location );
        });
        this.map.fitBounds( bounds );
      });
    },


    // set up freeform lasso drawing, defines the polygon search area
    // triggered by the button at mapControlDiv
    initDrawing: function() {
      var controlDiv = document.getElementById('mapControlDiv');

      controlDiv.index = 1;
      this.map.controls[ google.maps.ControlPosition.BOTTOM_RIGHT ].push(
        controlDiv );

      this.drawPolyline = new google.maps.Polyline({
        map: this.map,
        clickable: false,
        strokeColor: "#FF0000",
        strokeOpacity: .5,
        strokeWeight: 1 });

      // Event listeners on map to support drawing
      // use arrow functions so "this" is bound to app object, not window
      google.maps.event.addListener( this.map, 'mousedown', (e) => {
        if (this.drawing) {
          this.drawPolyline.getPath().push( e.latLng );
        }
      });

      google.maps.event.addListener( this.map, 'mousemove', (e) => {
        if (this.drawing && this.drawPolyline.getPath().getLength() > 0) {
          var latLng = e.latLng;
          var path = this.drawPolyline.getPath();
          var last = path.getAt(path.getLength() - 1);
          var dist = google.maps.geometry.spherical.computeDistanceBetween( last, latLng );
         if (dist > 100)
            path.push( latLng );
        }
      });

      var drawEnding = false; // timer BS due to 'click' event BS
      var endDraw = (e) => {
        if (this.drawing) {
          var path = this.drawPolyline.getPath();
          path.push( e.latLng );
          path.push( path.getAt(0) );
          this.map.setOptions({ draggable:true, draggableCursor: null });
          this.drawing = false;
          drawEnding = true;
          setTimeout(function() { drawEnding = false; }, 100);
        }
      };

      google.maps.event.addListener( this.map, 'mouseup', endDraw);
      google.maps.event.addListener( this.map, 'mouseout', endDraw);

      // Disable page scrolling on mobile when drawing
      document.body.addEventListener('touchmove', (e) => {
        if (this.drawing)
          e.preventDefault();
      });

      // Target Location handling
      google.maps.event.addListener( this.map, 'click', (e) => {
        if (!this.drawing && !drawEnding) {
          this.showMarker = true;
          this.setTargetLocation( { lat:e.latLng.lat(), lng: e.latLng.lng() });
        }
      });
    },

    toggleDrawMode: function() {

      this.clear();
      this.drawPolyline.getPath().clear();
      this.inDrawMode = !this.inDrawMode;

      if (this.inDrawMode) {
        this.drawing = true;
        this.map.setOptions({ draggable:false, draggableCursor: 'crosshair' });
      } else {
        this.map.setOptions({ draggable:true, draggableCursor: null });
        // ??? document.body.classList.remove('blockScroll');
      }
    },


    // update style of hexagons based on UI
    refreshPolyStyle: function() {
      for (var i = 0; i < this.polyArray.length; ++i) {
        var p = this.polyArray[i];
        var color = this.polyColors[ Math.abs( p.zIndex )];

        p.setOptions( {
          fillColor: color,
          fillOpacity: this.polyFillOpacity,
          strokeColor: color,
          strokeOpacity: this.polyStrokeOpacity
        } );
      }
    },

    // wipe map clean of hexagons and lasso'ed search area
    clear: function() {
      window.location.hash = "";

      // FIXME
      // queryIndices = [];
      // if (queryTimeout !== null) {
      //   clearTimeout(queryTimeout);
      //   queryTimeout = null;
      // }

      for (var i = 0; i < this.markersArray.length; i++)
        this.markersArray[i].setMap(null);
      this.markersArray = [];

      for (var i = 0; i < this.polyArray.length; i++)
        this.polyArray[i].setMap(null);
      this.polyArray = [];
    },


    // calculate and color hexagons by travel time
    calculate: function() {

      this.clear();
      this.updateURL();

      // probably should pass in more specific data (map, target,
      // gridRadius, searchRadius, polyLine
      var calculator = new TravelTimeCalculator( this );

      // processes the data, then it will call back to
      // addHexagonToMap() as the data arrives.  Really should pass that in as a param...
      calculator.calculate();

    },

    // Update page URL when new options are selected
    updateURL: function() {

      var data = {
        travelDirection: this.travelDirection,
        travelMode: this.travelMode,
        gridRadius: this.gridRadius,
        targetLocation: this.targetLocation.lat + "," + this.targetLocation.lng
      };

      data.hour  = this.travelTimeHour;
      data.month = this.travelTimeMonth;
      data.day   = this.travelTimeDay;

      // Traffic Model (driving only)
      if (this.travelMode === 'DRIVING') {
        data.trafficModel= this.trafficModel;
      }

      // TransitMode (transit only)
      if (this.travelMode === 'TRANSIT') {
          data.transitTimeType= this.transitTimeType;
        data.transitModes = this.transitModes;
      }

      window.location.hash = JSON.stringify( data );
    },


    /** Use the json after the "#" in the URL as our starting data */
    parseURL: function() {

      // This might be an attack vector, but that's Google's problem
      var hashArgs = window.location.hash.substring(1);

      if (!hashArgs) {
        return;
      }

      var data;
      try {
        data = JSON.parse( hashArgs );
      }
      catch (ex) {
        // doh, bad URL
        console.log( hashArgs );
        return;
      }

      console.log( data );

      this.travelDirection= data.travelDirection || this.travelDirection;
      this.travelMode =     data.travelMode || this.travelMode;
      this.gridRadius =     data.gridRadius || this.gridRadius;
      this.targetLocation = data.targetLocation || this.targetLocation;
      this.travelTimeHour = data.hour  || this.travelTimeHour;
      this.travelTimeMonth= data.month || this.travelTimeMonth;
      this.travelTimeDay =  data.day   || this.travelTimeDay;
      this.trafficModel =   data.trafficModel || this.trafficModel;
      this.transitTimeType= data.transitTimeType || this.transitTimeType;
      this.transitModes =   data.transitModes || this.transitModes;
    }

  }

});
