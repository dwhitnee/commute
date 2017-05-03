// IMPORTANT: Replace this key with your own.
// Then scroll to bottom and replace key in async defer script load
var API_KEY = "AIzaSyCNTYx3-TqDQXAsvRByPyY48zKIikFmgtc";

// Constants
var targetLimit = 10000;
var requestInterval = 1100;
var seattle = { lat:47.60621, lng:-122.332071 };

// Global variables
var map;                    // google.maps.Map object
var bounds;                 // LatLng bounds for map
var service;                // distanceMatrixService for queries
var markersArray = [];      // display markers
var polyArray = [];         // search result polygons

var targetLocation;         // LatLng of "primary" target location
var targetLocationMarker;   // MapMarker for targetLocation

var polyInfoWindow;         // popup when hovering over result polygon
var polyInfoWindowSource = -1;  // popup source index
var staticMapWidth = 640;   // dimensions of static map used for masking water/highways
var staticMapHeight = 640;
var staticMapCanvas;        // context object for "drawing" static map so it can be sampled
var queryTimeout = null;    // JavaScript timeout object for stepping queries over time
var gridRadius;             // size of grid element. hexagon edge size and circumscribed circle radius
var gridInradius;           // radius of circle inscribed in a hexagon
var queryIndices = [];      // indices used for query. query repeated if rate limiter hit
var rateLimitCounter = 0;   // counter rate limit errors so query delay can be dynamically adjusted
var calculateCounter = 0;   // counter so old responses can be ignored
var drawing = false;        // flag for bounds drawings
var polyFillOpacity = .5;
var polyStrokeOpacity = .8;
var drawPolyline;

// green, yellow, orange, red, purple, blue, grey
var polyColors = [ '#388C04', '#F0DE1B', '#FF7215', '#E00300',  /*'#CB55E3', '#3B74ED',*/ '#D3D3D3'];
var travelTimeThresholds = [ 15, 30, 45, 60, /*75, 90,*/ Infinity ];


var targets = [];           // array of {polyCenter:LatLng, dest:LatLng} for hexagon grid
var queryOrigins = [];      // if departFrom then [targetLocation] else targets
var queryDestinations = []; // if departFrom then targets else [targetLocation]

// HTML Objects
var gridSizeField;
var searchRadiusField;
var typeRadios;
var travelModeRadios;
var trafficModelRadios;
var transitModeChecks;
var travelThresholdFields;
var advancedSearchCheck;
var travelTimeDaySelect;
var travelTimeYearSelect;
var timeTypeRadios;
var showMarkerCheck;
var controlDiv;

// Marker icons
var destinationIcon = 'https://chart.googleapis.com/chart?chst=d_map_pin_letter&chld=D|FF0000|000000';
var originIcon = 'https://chart.googleapis.com/chart?chst=d_map_pin_letter&chld=O|FFFF00|000000';

// Google Maps API magic numbers
var MERCATOR_RANGE = 256; // Google Maps API magic number
var HALF_MERCATOR_RANGE = MERCATOR_RANGE / 2;
var pixelsPerLonDegree = MERCATOR_RANGE / 360;
var pixelsPerLonRadian = MERCATOR_RANGE / (2 * Math.PI);
var destinationLimit = 25;


// Form accesors
function getType() {
  for (var i = 0; i < typeRadios.length; i++)
    if (typeRadios[i].checked)
      return typeRadios[i].value;
}

function getTravelMode() {
  for (var i = 0; i < travelModeRadios.length; i++)
    if (travelModeRadios[i].checked)
      return travelModeRadios[i].value;
}

function getTimeType() {
  for (var i = 0; i < timeTypeRadios.length; i++)
    if (timeTypeRadios[i].checked)
      return timeTypeRadios[i].value;
}

function getTrafficModel() {
  for (var i = 0; i < trafficModelRadios.length; i++) {
    if (trafficModelRadios[i].checked) {
      var value = trafficModelRadios[i].value;
      if (value == 'bestguess')       return google.maps.TrafficModel.BEST_GUESS;
      if (value == 'optimistic')      return google.maps.TrafficModel.OPTIMISTIC;
      if (value == 'pessimistic')     return google.maps.TrafficModel.PESSIMISTIC;
    }
  }
}

function getTransitModes() {
  var result = [];
  for (var i = 0; i < transitModeChecks.length; i++)
    if (transitModeChecks[i].checked)
      result.push(transitModeChecks[i].value);
  return result;
}

function getGridRadius() {
  return Number(gridSizeField.value);
}

function getSearchRadius() {
  return getGridRadius() * 10;
}

function getTravelTimeThresholdIndex(travelTimeSeconds) {
  for (var i = 0; i < travelTimeThresholds.length; ++i)
    if (travelTimeSeconds < travelTimeThresholds[i] * 60)
      return i;
}

function setTargetLocation(newTarget) {
  targetLocation = newTarget;

  refreshMarker();
  refreshURL();
}


// UI callbacks
function onTravelTimeMonthChanged() {
  var limits = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var limit = limits[travelTimeMonthSelect.selectedIndex];

  if (travelTimeDaySelect.selectedIndex > limit - 1)
    travelTimeDaySelect.selectedIndex = limit - 1;

  for (var i = 0; i < 31; ++i)
    travelTimeDaySelect.options[i].disabled = i >= limit;
}

// $$$ FOR LIZ
function refreshDivs() {

  var isDriving = getTravelMode() === 'DRIVING';
  var isTransit = getTravelMode() === 'TRANSIT';

  if (!isDriving && !isTransit) {
    advancedSearchCheck.checked = false;
  }

  var advancedSearch = advancedSearchCheck.checked;

  if (!isDriving && !isTransit){
    document.getElementById("advOptionCheck").classList.remove('advOpt_Open');
    document.getElementById("advOptionCheck").classList.remove('advOpt_enabled');
    document.getElementById("advOptionCheck").classList.add('advOpt_disabled');

    // for making box not visible
    document.getElementById("advSearchOptions").classList.remove('block_advSearch-visible');
    document.getElementById("advSearchOptions").classList.add('block_advSearch-hidden');
  }
  else {
    document.getElementById("advOptionCheck").classList.remove('advOpt_disabled');
    document.getElementById("advOptionCheck").classList.add('advOpt_enabled');
    if (advancedSearch){
      document.getElementById("advOptionCheck").classList.remove('advOpt_enabled');
      document.getElementById("advOptionCheck").classList.add('advOpt_Open');

      // for making box visible
      document.getElementById("advSearchOptions").classList.remove('block_advSearch-hidden');
      document.getElementById("advSearchOptions").classList.add('block_advSearch-visible');
    }
    else{
      document.getElementById("advOptionCheck").classList.remove('advOpt_Open');
      document.getElementById("advOptionCheck").classList.add('advOpt_enabled');

      // for making box not visible
      document.getElementById("advSearchOptions").classList.remove('block_advSearch-visible');
      document.getElementById("advSearchOptions").classList.add('block_advSearch-hidden');
    }
  }



  if (isDriving && advancedSearch) {

    timeTypeRadios[0].checked = true;
    // for liz
    // arriveby for cars has to be disabled here, it's forced, this needs styling
    timeTypeRadios[1].disabled = true;
    document.getElementById("arriveByLabel").classList.add('option_disabled');

  }
  else if (isTransit && advancedSearch) {
    timeTypeRadios[1].disabled = false;
    document.getElementById("arriveByLabel").classList.remove('option_disabled');
  }

  document.getElementById('trafficModelDiv').style.display = isDriving && advancedSearch ? 'block' : 'none';
  document.getElementById('transitModesDiv').style.display = isTransit ? 'block' : 'none';
  document.getElementById('travelTimeDiv').style.display = advancedSearch ? 'block' : 'none';

  refreshURL();
}

function refreshURL() {
  var str = '';

  // Search Type
  str += 'type=' + getType();

  // Travel Mode
  var _travelMode = getTravelMode();
  str += "&travelMode=" + _travelMode;
  str += "&gridSize=" + getGridRadius();
  str += "&targetLocation=" + targetLocation.lat + "," + targetLocation.lng;

  var advancedSearch = specifyTavelTime.checked;
  if (advancedSearch) {
    str += "&travelTime=" + travelTimeHoursSelect.selectedIndex;
    str += "&travelMonth=" + travelTimeMonthSelect.selectedIndex;
    str += "&travelDay=" + travelTimeDaySelect.selectedIndex;

    // Traffic Model (options)
    if (_travelMode === 'DRIVING') {
      str += "&trafficModel=" + getTrafficModel();
    }

    // TransitMode (optional)
    if (_travelMode === 'TRANSIT') {
      str += "&timeType=" + getTimeType();
      str += "&transitMode=";
      var modes = getTransitModes();
      for (var i = 0; i < modes.length; ++i) {
        str = str + modes[i];
        if (i != modes.length - 1)
          str = str + ","
      }
    }
  }

  window.location.hash = str;
}

function refreshPolyStyle() {

  polyColors[0] = document.getElementById("polyColorField0").value;
  polyColors[1] = document.getElementById("polyColorField1").value;
  polyColors[2] = document.getElementById("polyColorField2").value;
  polyColors[3] = document.getElementById("polyColorField3").value;

  polyFillOpacity = Number(document.getElementById("polyFillOpacity").value);
  polyStrokeOpacity = Number(document.getElementById("polyStrokeOpacity").value);

  for (var i = 0; i < polyArray.length; ++i) {
    var p = polyArray[i];
    var c = polyColors[Math.abs(p.zIndex)];
    p.setOptions( {
      fillColor:c,
      fillOpacity:polyFillOpacity,
      strokeColor:c,
      strokeOpacity:polyStrokeOpacity,
    } );
  }
}

function refreshMarker() {

  if (showMarkerCheck.checked) {
    if (targetLocationMarker)
      targetLocationMarker.setMap(null);
    targetLocationMarker = new google.maps.Marker({
      map: map,
      position: targetLocation,
      clickable: false
    });
  }
  else {
    if (targetLocationMarker)
      targetLocationMarker.setMap(null);
  }
}

function toggleMapUI() {
  var disabled = !map.disableDefaultUI;
  map.setOptions({ disableDefaultUI: disabled });

  document.getElementById('pac-input').style.display = disabled ? 'none' : 'block';
  controlDiv.style.display = disabled ? 'none' : 'block';

  showMarkerCheck.checked = !disabled;
  refreshMarker();
}


// Math Utilities
function toRadians(degrees) { return degrees / 180 * Math.PI; };
function toDegrees(radians) { return radians / Math.PI * 180; };

function computeOffset(location, bearing, distance) {
  var point = new google.maps.LatLng(location.lat, location.lng);
  var dest = google.maps.geometry.spherical.computeOffset(point, distance, bearing);
  return latLngToLiteral(dest);
};

function computeDistance(latLngA, latLngB) {
  var a = new google.maps.LatLng(latLngA.lat, latLngA.lng);
  var b = new google.maps.LatLng(latLngB.lat, latLngB.lng);
  return google.maps.geometry.spherical.computeDistanceBetween(a, b);
}

function latLngToLiteral(latlng) {
  return { lat:latlng.lat(), lng:latlng.lng() };
}

function pointInPolygon(pointLatLng, polygonPoints) {
  // Intersect ray going out from point against all polygon edges.
  // Even number of intersections means outside, odd means inside

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




// Called after Google Maps API script is asynchronously loaded
function initialize() {
  targetLocation = seattle;

  // Get document elements
  gridSizeField = document.getElementById('gridSizeField');
  typeRadios = document.getElementById('typeForm').elements;
  advancedSearchCheck = document.getElementById('specifyTavelTime');
  travelTimeDaySelect = document.getElementById('travelTimeDaySelect');
  travelTimeMonthSelect = document.getElementById('travelTimeMonthSelect');
  travelTimeYearSelect = document.getElementById('travelTimeYearSelect');
  travelModeRadios = document.getElementById('travelModeForm').elements;
  trafficModelRadios = document.getElementById('trafficModelForm').elements;
  transitModeChecks = document.getElementById('transitModeForm').elements;
  timeTypeRadios = document.getElementById('timeTypeForm').elements;
  showMarkerCheck = document.getElementById('showMarkerCheck');
  travelThresholdFields = [
    document.getElementById('travelThreshold0'),
    document.getElementById('travelThreshold1'),
    document.getElementById('travelThreshold2'),
    document.getElementById('travelThreshold3'),
  ];


  // Initialize canvas
  var canvas = document.createElement('canvas');
  canvas.setAttribute('width', staticMapWidth);
  canvas.setAttribute('height', staticMapHeight);
  staticMapCanvas = canvas.getContext('2d');

  // Initialize UI date/time
  var currentDate = new Date();
  var tomorrow = new Date(currentDate.getTime() + 86400000);
  travelTimeDaySelect.selectedIndex = tomorrow.getDate() - 1;
  travelTimeMonthSelect.selectedIndex = tomorrow.getMonth();


  // UI callbacks
  for (var i = 0; i < typeRadios.length; ++i)
    typeRadios[i].onclick = refreshURL;

  for (var i = 0; i < travelModeRadios.length; ++i)
    travelModeRadios[i].onclick = refreshURL;

  for (var i = 0; i < transitModeChecks.length; ++i)
    transitModeChecks[i].onclick = refreshURL;

  for (var i = 0; i < timeTypeRadios.length; ++i)
    timeTypeRadios[i].onclick = refreshURL;

  document.getElementById('gridSizeField').onchange = refreshURL;


  // Special 'travelMode' UI callback
  var transitModesDiv = document.getElementById('transitModesDiv')
  var onTravelModeChanged = function() {
    for (var i = 0; i < travelModeRadios.length; ++i) {
      var radio = travelModeRadios[i];
      if (radio.value === 'TRANSIT')
        transitModesDiv.style.display = radio.checked ? 'block' : 'none';
    }
    refreshURL();
  }
  for (var i = 0; i < travelModeRadios.length; ++i)
    travelModeRadios[i].onclick = onTravelModeChanged;


  // Read params off URL hash
  var params = window.location.hash.substring(1);
  params = params.split('&');
  params = params.map(p=>p.split('='));
  params = params.filter(e=>Array.isArray(e) && e.length == 2);

  for (var i = 0; i < params.length; ++i) {
    var key = params[i][0];
    var value = params[i][1];

    if (key == 'type') {
      document.forms['typeForm'][value].checked = true;
    }
    else if (key == 'travelMode') {
      document.forms['travelModeForm'][value].checked = true;
    }
    else if (key == 'transitMode') {
      // Clear all checks
      for (var j = 0; j < transitModeChecks.length; j++)
        transitModeChecks[j].checked = false;

      // Set any check found in value
      var modes = value.split(',');
      for (var j = 0; j < modes.length; ++j)
        document.forms['transitModeForm'][modes[j]].checked = true;
    }
    else if (key == 'gridSize') {
      gridSizeField.value = Number(value);
      document.getElementById('gridSizeField').value = value;
    }
    else if (key == 'targetLocation') {
      var latlng = value.split(',');
      targetLocation = { lat: Number(latlng[0]), lng: Number(latlng[1]) };
    }
    else if (key == 'travelTime') {
      travelTimeHoursSelect.selectedIndex = Number(value);
      advancedSearchCheck.checked = true;
    }
    else if (key == 'travelMonth') {
      travelTimeMonthSelect.selectedIndex = Number(value);
    }
    else if (key == 'travelDay') {
      advancedSearchCheck.checked = true;
      travelTimeDaySelect.selectedIndex = Number(value);
    }
    else if (key == 'trafficModel') {
      for (var j = 0; j < trafficModelRadios.length; j++)
        trafficModelRadios[j].checked = false;

      trafficModelRadios[value].checked = true;
    }
    else if (key == 'timeType') {
      for (var j = 0; j < timeTypeRadios.length; j++)
        timeTypeRadios[j].checked = false;

      timeTypeRadios[value].checked = true;
    }
  }
  refreshDivs();


  // Create Google Maps API objects
  bounds = new google.maps.LatLngBounds;
  map = new google.maps.Map(document.getElementById('map'), { center: targetLocation, zoom: 11, clickableIcons: false });
  service = new google.maps.DistanceMatrixService;
  polyInfoWindow = new google.maps.InfoWindow({content: "hello" });

  setTargetLocation(targetLocation);
  map.setCenter(targetLocation);


  // Create search bar
  var input = document.getElementById('pac-input');
  var searchBox = new google.maps.places.SearchBox(input);

  // commented out here to better set positioning controls via CSS
  // map.controls[google.maps.ControlPosition.TOP_CENTER].push(input);

  map.addListener('bounds_changed', function() {
    searchBox.setBounds(map.getBounds());
  });

  searchBox.addListener('places_changed', function() {
    var places = searchBox.getPlaces();
    if (places.length == 0)
      return;

    // delete old markers
    for (var i = 0; i < markersArray.length; i++)
      markersArray[i].setMap(null);
    markersArray = [];

    // For each place, get the icon, name and location.
    bounds = new google.maps.LatLngBounds;
    places.forEach(function(place) {
      if (!place.geometry)
        return;

      var icon = {
        url: place.icon,
        size: new google.maps.Size(71, 71),
        origin: new google.maps.Point(0, 0),
        anchor: new google.maps.Point(17, 34),
        scaledSize: new google.maps.Size(25, 25)
      };

      showMarkerCheck.checked = true;
      setTargetLocation({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });

      // Create a marker for each place.
      markersArray.push(new google.maps.Marker({
        map: map,
        icon: icon,
        title: place.name,
        position: place.geometry.location
      }));

      if (place.geometry.viewport)
        bounds.union(place.geometry.viewport);
      else
        bounds.extend(place.geometry.location);
    });
    map.fitBounds(bounds);
  });

  // Create 'draw' button
  controlDiv = document.createElement('div');

  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#00B582';
  controlUI.style.border = '1px solid #028269';
  controlUI.style.borderRadius = '0.15rem';
  controlUI.style.boxShadow = 'inset 0 1px 0 0 #58C8A8;';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginBottom = '1.5rem';
  controlUI.style.padding = '0rem 1.3rem';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Click to draw bounds';
  controlDiv.appendChild(controlUI);

  var drawText = document.createElement('div');
  drawText.style.color = '#fff';
  drawText.style.fontSize = '13px';
  drawText.style.textTransform = 'uppercase';
  drawText.style.letterSpacing = '0.05em';
  drawText.style.lineHeight = '2rem';
  drawText.innerHTML = 'Draw';
  controlUI.appendChild(drawText);


  controlUI.addEventListener('click', function() {
    if (drawText.innerHTML === 'Clear') {
      Clear();
      drawPolyline.getPath().clear();
      drawText.innerHTML = 'Draw';
      map.setOptions({draggable:true, draggableCursor: null});
      drawing = false;
      document.body.classList.remove('blockScroll');
    }
    else if (!drawing && drawText.innerHTML === 'Draw') {
      Clear();
      drawPolyline.getPath().clear();
      map.setOptions({draggable:false, draggableCursor: 'crosshair'});
      drawing = true;
      drawText.innerHTML = 'Clear';
    }
  });


  controlDiv.index = 1;
  map.controls[google.maps.ControlPosition.BOTTOM_RIGHT].push(controlDiv);


  // Event listeners on map to support drawing
  drawPolyline = new google.maps.Polyline({ map: map, clickable:false, strokeColor:`#FF0000`, strokeOpacity:.5, strokeWeight:1 });

  google.maps.event.addListener(map, 'mousedown', function(e) {
    if (drawing)
      drawPolyline.getPath().push(e.latLng);
  });

  google.maps.event.addListener(map, 'mousemove', function(e) {
    if (drawing && drawPolyline.getPath().getLength() > 0) {
      var latLng = e.latLng;
      var path = drawPolyline.getPath();
      var last = path.getAt(path.getLength() - 1);
      var dist = google.maps.geometry.spherical.computeDistanceBetween(last, latLng);
      if (dist > 100)
        path.push(latLng);
    }
  });

  var drawEnding = false; // timer BS due to 'click' event BS
  var endDraw = function(e) {
    if (drawing) {
      var path = drawPolyline.getPath();
      path.push(e.latLng);
      path.push(path.getAt(0));
      map.setOptions({draggable:true, draggableCursor: null});
      drawing = false;
      drawEnding = true;
      setTimeout(function() { drawEnding = false; }, 100);
    }
  };
  google.maps.event.addListener(map, 'mouseup', endDraw);
  google.maps.event.addListener(map, 'mouseout', endDraw);

  // Disable page scrolling on mobile when drawing
  document.body.addEventListener('touchmove', function(e) {
    if (drawing)
      e.preventDefault();
  });

  // Target Location handling
  google.maps.event.addListener(map, 'click', function(e) {
    if (!drawing && !drawEnding) {
      showMarkerCheck.checked = true;
      setTargetLocation( { lat:e.latLng.lat(), lng: e.latLng.lng() });
    }
  });
}

function Clear() {
  queryIndices = [];
  if (queryTimeout !== null) {
    clearTimeout(queryTimeout);
    queryTimeout = null;
  }

  for (var i = 0; i < markersArray.length; i++)
    markersArray[i].setMap(null);
  markersArray = [];

  for (var i = 0; i < polyArray.length; i++)
    polyArray[i].setMap(null);
  polyArray = [];

  polyInfoWindow.close();
  polyInfoWindowSource = -1;
}


// Called when 'Calculate' button is clicked by user
function Calculate() {

  ++calculateCounter;

  // Clear old data
  Clear();

  gridRadius = getGridRadius();
  gridInradius = Math.sqrt(3)/2 * gridRadius;
  searchRadius = getSearchRadius();
  var departFrom = getType() === 'departFrom';
  var leaveBy = getTimeType() === 'leaveBy';
  var isDriving = getTravelMode() === 'DRIVING';
  var isTransit = getTravelMode() === 'TRANSIT';
  var advancedSearch = advancedSearchCheck.checked;
  var queryTimeUTC = 0;
  var queryTimeDate;


  var searchBounds = new google.maps.LatLngBounds(targetLocation, targetLocation);

  var path = drawPolyline.getPath();
  if (path.getLength() > 0) {
    for (var i = 0; i < path.getLength(); ++i)
      searchBounds.extend(path.getAt(i));
  }
  else {
    searchBounds.extend(computeOffset(targetLocation, 0, searchRadius));
    searchBounds.extend(computeOffset(targetLocation, 90, searchRadius));
    searchBounds.extend(computeOffset(targetLocation, 180, searchRadius));
    searchBounds.extend(computeOffset(targetLocation, 270, searchRadius));
  }
  map.fitBounds(searchBounds);




  // Build a static map URL for detecting water/highways
  var mapCenter = { lat:map.getCenter().lat(), lng:map.getCenter().lng() };
  var locationStr = "\"" + mapCenter.lat + "," + mapCenter.lng + "\"";
  var imageZoom = map.getZoom() - 1;
  var imagePath ="http://maps.googleapis.com/maps/api/staticmap?scale=2&center=" + locationStr + "&zoom=" + imageZoom + "&size=" + staticMapWidth + "x" + staticMapHeight + "&sensor=false&visual_refresh=true&style=feature:water|color:0x00FF00&style=element:labels|visibility:off&style=feature:transit|visibiity:off&style=feature:poi|visibility:off&style=feature:administrative|visibility:off&style=feature:transit|visibility:off&style=feature:road.highway|color:0x00FF00";

  // Example imagePath:
  // http://maps.googleapis.com/maps/api/staticmap?scale=2&center="47.60620999999991,-122.33207357423623"&zoom=14&size=640x640&sensor=false&visual_refresh=true&style=feature:water|color:0x00FF00&style=element:labels|visibility:off&style=feature:transit|visibiity:off&style=feature:poi|visibility:off&style=feature:administrative|visibility:off&style=feature:transit|visibility:off&style=feature:road.highway|color:0x00FF00

  var mapMask = new Image();
  mapMask.crossOrigin = 'http://maps.googleapis.com/crossdomain.xml';
  mapMask.src = imagePath;
  var mapMaskCorners = staticMapCorners(mapCenter.lat, mapCenter.lng, imageZoom, staticMapWidth, staticMapHeight);

  // Commented out markers and debug spew. Useful when mask test isn't working properly.
  /*
   markersArray.push(new google.maps.Marker({map: map, icon: destinationIcon, position:searchBounds.getNorthEast() }));
   markersArray.push(new google.maps.Marker({map: map, icon: destinationIcon, position:searchBounds.getSouthWest() }));
   console.log(imagePath);
   */

  // Callback for loading static map
  mapMask.onload = function() {

    // Draw image (hidden) for sampling
    staticMapCanvas.drawImage(mapMask, 0, 0, 640, 640);

    var next = advancedSearch ? getTimeZoneOffset : calculateTargets;
    setTimeout(next, 100);
  }

  var getTimeZoneOffset = function() {

    var year = Number(travelTimeYearSelect[travelTimeYearSelect.selectedIndex].value);
    var month = travelTimeMonthSelect.selectedIndex;
    var day = travelTimeDaySelect.selectedIndex + 1;
    var minutes = travelTimeHoursSelect.selectedIndex * 15;

    var date = new Date();
    var hour = Math.floor(minutes/60);
    minutes = minutes - hour*60;

    date.setYear(year);
    date.setMonth(month);
    date.setDate(day);
    date.setHours(hour);
    date.setMinutes(minutes);

    var utcMilliseconds = Date.UTC(year, month, day, hour, minutes);
    var utcSeconds = utcMilliseconds/1000;

    var request = new XMLHttpRequest();
    var url = "https://maps.googleapis.com/maps/api/timezone/json?location=" + targetLocation.lat + "," + targetLocation.lng + "&timestamp=" + utcSeconds + "&key=" + API_KEY;

    request.onload = function() {
      var responseJSON = JSON.parse(request.responseText);
      var timeOffsetDst = Number(responseJSON.dstOffset);
      var timeOffsetRaw = Number(responseJSON.rawOffset);

      queryTimeUTC = utcSeconds - (timeOffsetDst + timeOffsetRaw);

      queryTimeDate = new Date(0);
      queryTimeDate.setUTCSeconds(queryTimeUTC);

      calculateTargets();
    }

    request.onerror = function() {
      calculateTargets();
    }

    request.open("GET", url, true);
    request.send();
  }


  var calculateTargets = function() {

    // Build targets for new queryTimeout
    var row = 0;
    var col = 0;
    targets = [];

    var southwest = searchBounds.getSouthWest();
    southwest = { lat:southwest.lat(), lng:southwest.lng() };

    var northeast = searchBounds.getNorthEast();
    northeast = { lat:northeast.lat(), lng:northeast.lng() };

    // Row loop
    for (;;) {

      // Calculate center of first hexagon for this row
      var rowBegin = computeOffset(southwest, 0, gridInradius * row);
      if ((row % 2) == 1)
        rowBegin = computeOffset(rowBegin, 90, gridRadius * 1.5);

      if (rowBegin.lat > northeast.lat)
        break;

      if (targets.length > targetLimit) {
        console.log("ERROR: Exceeded target limit of [" + targetLimit + "]");
        break;
      }

      // Column loop
      for (;;) {
        var polyCenter = computeOffset(rowBegin, 90, gridRadius * 3 * col);
        if (polyCenter.lng > northeast.lng || targets.length > targetLimit)
          break;

        // Test point against mask
        var dest = polyCenter;
        var masked = isMasked(mapMask, dest.lat, dest.lng, mapMaskCorners, staticMapWidth, staticMapHeight);

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


  // Helper to draw a polygon
  var drawPoly = function(center, size, colorIndex) {
    var polyCoordsHex = function(_center, _size) {
      var coords = [
        computeOffset(_center, 30, _size),
        computeOffset(_center, 90, _size),
        computeOffset(_center, 150, _size),
        computeOffset(_center, 210, _size),
        computeOffset(_center, 270, _size),
        computeOffset(_center, 330, _size),
      ];

      return coords;
    }

    var color = polyColors[colorIndex];
    var poly = new google.maps.Polygon({
      paths: polyCoordsHex(center, size),
      strokeColor: color,
      strokeOpacity: polyStrokeOpacity,
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: colorIndex < polyColors.length - 1 ? polyFillOpacity : .35,
      zIndex: -colorIndex,
    });
    polyArray.push(poly);

    return poly;
  }


  // Callback closure for GoogleMapsAPI.distanceMatrix
  var queryResponseClosure = function(index) {
    var idx = index;
    var queryCalculateCount = calculateCounter;

    return function(response, status) {
      // Ignore responses if it's to an old query
      if (calculateCounter != queryCalculateCount)
        return;

      if (status !== 'OK') {

        // Re-request if rate limiter hit
        if (status === 'OVER_QUERY_LIMIT') {
          rateLimitCounter += 1;
          console.log("Unexpected error: [" + status + "] Index: [" + idx + "]  DelayCount: [" + rateLimitCounter + "]");
          queryIndices.push(idx);
          if (queryTimeout == null) {
            queryTimeout = setTimeout(stepQuery, queryDelay());
          }
        }
        else {
          console.log("Unexpected error: [" + status + "]");
        }
        return;
      }
      rateLimitCounter = 0;

      // Process results
      for (var i = 0; i < response.rows.length; i++) {
        var results = response.rows[i].elements;

        for (var j = 0; j < results.length; j++) {

          var result = results[j];
          if (result.status !== 'OK') // No route found?
            continue;

          var travelTime = result.duration_in_traffic ? result.duration_in_traffic.value : result.duration.value;

          var targetIdx = idx + (departFrom ? j : i);
          var center = targets[targetIdx].polyCenter;

          var poly = drawPoly(center, gridRadius, getTravelTimeThresholdIndex(travelTime));

          var polyEventMouseoverClosure = function() {
            var idx = j;
            var centerCopy = center;
            var travelTimeCopy = travelTime;
            return function(e) {
              if (polyInfoWindow.getMap() == null) {
                if (polyInfoWindowSource == -1)
                  polyInfoWindow.open(map);

                polyInfoWindowSource = idx;
                var minutes = (Math.round((travelTimeCopy/60) * 100) / 100).toFixed(2);
                polyInfoWindow.setContent(`${minutes} minutes`);
                polyInfoWindow.setPosition(centerCopy);
              }
            };
          }

          var polyMouseoutClosure = function() {
            var idx = j;
            return function(e) {
              if (polyInfoWindowSource == idx) {
                polyInfoWindow.close();
                polyInfoWindowSource = -1;
              }
            }
          }

          google.maps.event.addListener(poly, 'mouseover', polyEventMouseoverClosure());
          google.maps.event.addListener(poly, 'mouseout', polyMouseoutClosure());
          poly.setMap(map);
        }
      }
    }
  }

  var queryDelay = function() {
    return Math.min(Math.pow(1.5, 1 + rateLimitCounter) * requestInterval, 15000);;
  }

  var stepQuery = function(delay) {
    var i = queryIndices.pop();
    var count = Math.min(targets.length - i, destinationLimit);

    var stepOrigins = departFrom ? queryOrigins : queryOrigins.slice(i, i + count);
    var stepDestinations = departFrom ? queryDestinations.slice(i, i + count) : queryDestinations;

    var query = {
      origins: stepOrigins,
      destinations: stepDestinations,
      travelMode: getTravelMode(),
      transitOptions: { modes: getTransitModes() },
      unitSystem: google.maps.UnitSystem.METRIC,
      avoidHighways: false,
      avoidTolls: false,
    };


    if (advancedSearch && queryTimeUTC != 0) {
      if (isDriving) {
        query['drivingOptions'] = {
          'departureTime': queryTimeDate,
          'trafficModel': getTrafficModel()
        };
      }
      else if (isTransit) {
        var k = leaveAt ? 'departureTime' : 'arrivalTime';
        query.transitOptions[k] = queryTimeDate;
      }
    }

    service.getDistanceMatrix(query, queryResponseClosure(i));

    if (queryIndices.length > 0)
      queryTimeout = setTimeout(stepQuery, queryDelay());
    else
      queryTimeout = null;
  }
}

// StaticMap mask utilities
function latLngToPoint(lat, lng) {
  var x = HALF_MERCATOR_RANGE + lng * pixelsPerLonDegree;
  var siny = Math.sin(toRadians(lat));
  var y = HALF_MERCATOR_RANGE + 0.5 * Math.log((1 + siny) / (1 - siny)) * -pixelsPerLonRadian;
  return { x:x, y:y };
}

function pointToLatLng(point) {
  var latRadians = (point.y - HALF_MERCATOR_RANGE) / -pixelsPerLonRadian;
  var lat = toDegrees(2 * Math.atan(Math.exp(latRadians)) - Math.PI / 2);
  var lng = (point.x - HALF_MERCATOR_RANGE) / pixelsPerLonDegree;
  return { lat:lat, lng:lng };
}

function staticMapCorners(lat, lng, zoom, mapWidth, mapHeight) {

  var scale = Math.pow(2,zoom);
  var centerPixel = latLngToPoint(lat, lng);

  var NWPoint = {x: (centerPixel.x -(mapWidth/2)/ scale), y: (centerPixel.y - (mapHeight/2)/ scale)};
  var NWLatLng = pointToLatLng(NWPoint);

  var SEPoint = {x: (centerPixel.x +(mapWidth/2)/ scale), y: (centerPixel.y + (mapHeight/2)/ scale)};
  var SELatLng = pointToLatLng(SEPoint);

  return { northwest: NWLatLng, southeast: SELatLng };
}

function staticMapPixel(lat, lng, corners, mapWidth, mapHeight) {
  // linear interpolation (which is wrong but we'll start with it)
  var width = corners.southeast.lng - corners.northwest.lng;
  var height = corners.northwest.lat - corners.southeast.lat;
  var x = (lng - corners.northwest.lng) / width;
  var y = (lat - corners.southeast.lat) / height;

  x = x * mapWidth;
  y = (1-y) * mapHeight;

  return { x:Math.floor(x), y:Math.floor(y) };
}

function isMasked(mapMask, lat, lng, corners, mapWidth, mapHeight) {

  var pixel = staticMapPixel(lat, lng, corners, mapWidth, mapHeight);
  if (pixel.x < 0 || pixel.x >= mapWidth || pixel.y < 0 || pixel.y >= mapHeight)
    return false;

  var pixel_data = staticMapCanvas.getImageData(pixel.x, pixel.y, 1, 1);
  pixel_data = pixel_data.data;
  var is_green = pixel_data[0] == 0 && pixel_data[1] >= 254 && pixel_data[2] == 0;
  return is_green;
}
