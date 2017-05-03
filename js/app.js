/*global Vue */

new Vue({
  el: '#commuteVisualizerApp',


  // update these values, rather than update the DOM directly
  data: {
    message: "Hello Vue!",
    travelTimeHoursOptions: ["12:00 am", "12:30 am", "poop"],
    travelTime: "5:00 pm"
  },


  // event handlers accessible from the web page
  methods: {
    addState: function() {
      this.states.push( this.newState );
      this.newState = "";
      console.log( this.states );
    }
  }

});
