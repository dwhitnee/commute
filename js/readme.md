## VueJS refactor

This code is free to use in educational and not-for-profit projects.
May 2017, David Whitney (dwhitnee@gmail.com)

This version is available here: https://dwhitnee.github.io/commute/

I've taken forrestthewoods's original code and refactored it into a VueJS app and several objects including the VueJS **app**, **AccessMap** (to find dry land with roads), and **Travel Calculator** that computes the hexagons and travel times.

I did this mostly for fun because I thought Forrest made a cool tool, even if the code needed some love.  VueJS is a good basic webapp framework that makes a lot of what he did easier and more expandable.  Vue is not as heavyweight as React and Angular and I think is easier to grasp for the non-pro webapp dev.

### Notes on getting Google Maps API key

You will want your own Google key so you don't get throttled.
Create a project here: https://console.developers.google.com/apis/dashboard
You'll need to enable these APIs   

* Google Maps JavaScript API  
* Distance Matrix API  
* Google Static Maps API  
