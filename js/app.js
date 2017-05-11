/*global Vue,google */

// IMPORTANT: Replace this key with your own.
// https://developers.google.com/maps/documentation/distance-matrix/get-api-key
// Then scroll to bottom and replace key in async defer script load
var API_KEY = "AIzaSyA9x3G3xULG4S_fWrYd6qcBMeyIzlwYXnQ";
//var API_KEY =   "AIzaSyCNTYx3-TqDQXAsvRByPyY48zKIikFmgtc";

var SEATTLE = { lat:47.60621, lng:-122.332071 };

new Vue({
  el: '#commuteVisualizerApp',

  // update these values, rather than update the DOM directly
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
    targetLocation: SEATTLE,

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

    foo: "deleteme"
  },

  watch: {
    travelMode: function() {
      if (this.travelMode === "DRIVING") {
        this.transitTimeType = "leaveAt";  // can't use arriveBy for driving
      }

      this.updateURL();    // seems silly to update URL on any change,
                           // should only be on visualize
    }
  },

  computed: {
    showAdvancedSearch: function() {
      return this.travelMode === "TRANSIT" || this.travelMode === "DRIVING";
    },

    searchRadius: function() {
      return this.gridRadius * 10;
    },

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


  // sort of like onReady
  mounted: function() {
    this.parseURL();
  },


  // event handlers accessible from the web page
  methods: {
    // wipe map clean of hexagons
    // should reset data to defaults too FIXME
    clear: function() {
      window.location.hash = "";

      // queryIndices = [];
      // if (queryTimeout !== null) {
      //   clearTimeout(queryTimeout);
      //   queryTimeout = null;
      // }

      // for (var i = 0; i < markersArray.length; i++)
      //   markersArray[i].setMap(null);
      // markersArray = [];

      // for (var i = 0; i < polyArray.length; i++)
      //   polyArray[i].setMap(null);
      // polyArray = [];

      // polyInfoWindow.close();
      // polyInfoWindowSource = -1;
    },

    // calculate and color hexagons by travel time
    calculate: function() {

      this.clear();
      this.updateURL();
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


    parseURL: function() {
      // This might be an attack vector, but that's Google's problem
      var hashArgs = window.location.hash.substring(1);
      var data;

      try {
        data = JSON.parse( hashArgs );
      }
      catch (ex) {
        // doh, bad URL
        console.error( ex );
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


Vue.filter('dateFormat', function( date ) {
  if (date) {
    return date.toString(" h:mm tt MMMM dd, yyyy");
  } else {
    return "";
  }
});
